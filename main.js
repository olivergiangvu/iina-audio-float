/* Audio Float v1.1.0 — reduced native hit-testing exposure for IINA hitTest crash.
 * Playback/UI logic promoted unchanged from user-validated v0.9.5.
 * IINA's native OSC visibility is not exposed by the public plugin API.
 */
(function () {
  'use strict';
  const {core, mpv, event, overlay, menu, input, console: log} = iina;
  const prefs = iina.preferences;
  const VERSION = '1.1.0';
  const IDLE_MS = 2500;
  const DEFAULTS = {window:{yRatio:0.762,dx:0},fullscreen:{yRatio:0.700,dx:0},oscWidth:360,gap:12};
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
  const numeric = (n,d) => Number.isFinite(Number(n)) ? Number(n) : d;
  const say = s => log.log('Audio Float '+VERSION+': '+s);
  const bad = s => log.error('Audio Float '+VERSION+': '+s);
  let layoutCfg = clone(DEFAULTS), overlayStarted=false, webReady=false;
  let nativeClickable=null;
  let bridgeHandlersBound=false;
  let nativeMenuReady=false, nativeMenuTimer=null;
  let currentMode='window', popupOpen=false, autoHide=true, shown=null;
  let deadline=Date.now()+IDLE_MS, hover=false, lastMouse=null, hoverSince=0, isMainWindow=true;
  let mouseAvailable=false, mouseMovementSeen=false, recentSource='init', mouseSamples=0, mouseDiagnosed=false;
  let tracksCache=[], cacheReady=false, cacheUpdated=0, pendingRefresh=null;
  let clickCount=0, requestCount=0, lastTrackFetchMs=0;
  let lastReadError='', lastSwitchStatus='not-run', switchCount=0;
  let readyMessages=0, sentMessages=0, failedMessages=0, nativeMenuTrackCount=0, wakeCount=0, inputWakeCount=0;

  function restorePreferences() {
    try {
      const raw=prefs && prefs.get('layout_v04');
      const saved=typeof raw==='string'?JSON.parse(raw):raw;
      if(saved && typeof saved==='object') {
        for(const mode of ['window','fullscreen']) {
          if(saved[mode]) {
            layoutCfg[mode].yRatio=clamp(numeric(saved[mode].yRatio,layoutCfg[mode].yRatio),.12,.95);
            layoutCfg[mode].dx=clamp(numeric(saved[mode].dx,layoutCfg[mode].dx),-400,400);
          }
        }
        layoutCfg.oscWidth=clamp(numeric(saved.oscWidth,360),220,650);
        layoutCfg.gap=clamp(numeric(saved.gap,12),4,48);
      }
      // v0.9.4's diagnostic build persisted auto-hide=false.
      // v0.9.5 explicitly enables it on upgrade (no legacy false inheritance).
    } catch(e) { bad('settings read: '+e); }
  }
  function savePreferences() {
    try {
      if(prefs && prefs.set) {
        prefs.set('layout_v04',JSON.stringify(layoutCfg));
        prefs.set('autoHide_v05',autoHide);
        if(prefs.sync) prefs.sync();
      }
    } catch(e) { bad('settings write: '+e); }
  }
  restorePreferences();
  // User appearance preference is independent from OSC visibility.
  const THEMES=['system','light','dark'];
  const appearanceKey='appearance_v01';
  function validTheme(value){return THEMES.includes(value)?value:'system';}
  let appearance='system';
  try {appearance=validTheme(prefs && prefs.get(appearanceKey));}
  catch(e) {bad('appearance read: '+e);}
  function sendTheme(){send('af-theme-config',{mode:appearance});}
  function setTheme(value){
    const next=validTheme(value);
    if(next!==appearance){
      appearance=next;
      try {if(prefs && prefs.set){prefs.set(appearanceKey,appearance);if(prefs.sync)prefs.sync();}}
      catch(e){bad('appearance write: '+e);}
      say('APPEARANCE '+appearance);
    }
    sendTheme();
  }
  autoHide=true; // User requested auto-hide. Never inherit diagnostic v0.9.4 OFF.

  // Do not couple outgoing messages to the incoming ready event: that created
  // a bidirectional deadlock when the first WebView ready notification was lost.
  function send(name,data) {
    if(!overlayStarted) return false;
    try { overlay.postMessage(name,data || {}); sentMessages++; return true; }
    catch(e) { failedMessages++; bad('bridge '+name+': '+e); return false; }
  }
  function emitLayout() { send('af-layout',{layout:layoutCfg,fullscreen:currentMode==='fullscreen'}); }
  function pushTracks() { send('af-tracks',{tracks:tracksCache,ready:cacheReady}); }
  function readTracks(reason) {
    const start=Date.now();
    try {
      const selected=Number(core.audio.id);
      const raw=core.audio.tracks;
      if(!Array.isArray(raw)) throw new Error('core.audio.tracks is not an array');
      tracksCache=raw.map(t=>({
        id:Number(t.id),
        title:String(t.formattedTitle||t.title||('Audio '+t.id)),
        lang:String(t.lang||''), codec:String(t.codec||''),
        channels:String(t.demuxChannels||''),
        selected:!!t.isSelected || Number(t.id)===selected
      })).filter(t=>Number.isFinite(t.id));
      cacheReady=true; cacheUpdated=Date.now();lastReadError='';
      lastTrackFetchMs=Date.now()-start;
      say('NATIVE_TRACK_COUNT='+tracksCache.length+' reason='+reason+' readMs='+lastTrackFetchMs);
      pushTracks();
      queueMenuUpdate();
    } catch(e) {
      lastReadError=String(e); bad('track read reason='+reason+': '+e);
      cacheReady=false;
      // Independent diagnostic: can mpv retrieve tracks even if IINA API fails?
      try {
        const raw = mpv.getNative('track-list') || [];
        tracksCache=Array.isArray(raw)?raw.filter(t=>t && t.type==='audio').map(t=>({
          id:Number(t.id), title:String(t.title || t.lang || 'Audio '+t.id),
          lang:String(t.lang||''),codec:String(t.codec||''),channels:'',
          selected:!!t.selected
        })).filter(t=>Number.isFinite(t.id)):[];
        cacheReady=true;cacheUpdated=Date.now();
        say('MPV_FALLBACK_TRACK_COUNT='+tracksCache.length);
        pushTracks();queueMenuUpdate();
      }catch(e2){bad('mpv fallback: '+e2);}
    }
  }
  function scheduleTrackRead(reason,wait=80) {
    if(pendingRefresh!==null) clearTimeout(pendingRefresh);
    pendingRefresh=setTimeout(()=>{pendingRefresh=null;readTracks(reason);},wait);
  }
  // SAFETY: IINA 1.5.0 calls a nested NSRunLoop during PluginOverlayView.hitTest.
  // When the button is visually hidden, disable native overlay hit-testing too.
  // This avoids invisible WebView hit tests and preserves input pass-through.
  // There is no IINA plugin event for native OSC visibility; when mpv.mouse-pos
  // is unavailable, restoring the button requires native click/window focus.
  function syncNativeClickable() {
    const enabled=!!(webReady && shown===true);
    if(!overlayStarted || nativeClickable===enabled)return;
    try {
      overlay.setClickable(enabled);
      nativeClickable=enabled;
      say('NATIVE_CLICKABLE '+(enabled?'ON':'OFF')+' source='+recentSource);
    } catch(e) {bad('native clickability: '+e);}
  }
  function visibility(on) {
    on=!!on;
    if(shown===on){syncNativeClickable();return;}
    shown=on;
    // Disable hit testing before fading the invisible button; enable only
    // after the WebView messaging bridge has completed its handshake.
    syncNativeClickable();
    send('af-visibility',{visible:on});
    say('VISIBILITY '+(on?'SHOW':'HIDE')+' source='+recentSource);
  }
  function wake(reason,extend=IDLE_MS) {
    deadline=Date.now()+extend;recentSource=reason;wakeCount++;
    if(isMainWindow || popupOpen) visibility(true);
  }
  function checkVisible() {
    if(!autoHide) {visibility(true);return;}
    if(!isMainWindow) { visibility(false); return; }
    // Expire stale hover: some WebKit hit-test paths do not deliver mouseleave.
    // Keep popover pinned while the user chooses a track.
    if(hover && !popupOpen && Date.now()-hoverSince>5000) hover=false;
    visibility(popupOpen || hover || Date.now()<deadline);
  }
  function initOverlay() {
    if(overlayStarted || !core.window.loaded)return;
    // IMPORTANT: JavascriptAPIOverlay.loadFile() calls messageHub.clearListeners().
    // Never register overlay.onMessage() before loadFile(): it erases callbacks.
    // Bind only once the iina.plugin-overlay-loaded event arrives.
    overlayStarted=true;
    currentMode=core.window.fullscreen?'fullscreen':'window';
    try {
      overlay.loadFile('ui/index.html');
      overlay.show();
      // Keep the freshly loaded WebView non-interactive until AF_READY + visible.
      syncNativeClickable();
      say('OVERLAY_START: loadFile+show; native hit-testing gated by visibility');
    } catch(e) {overlayStarted=false;bad('overlay init: '+e);}
  }
  // Audio changes are never optimistically marked as successful. Confirm the
  // actual active track ID before closing the overlay and showing a checkmark.
  function activeAudioId() {
    try {
      const id=Number(core.audio.id);
      if(Number.isFinite(id) && id>0)return id;
    } catch(e) {bad('read core.audio.id: '+e);}
    try {
      const id=Number(mpv.getNative('aid'));
      if(Number.isFinite(id) && id>0)return id;
    } catch(e) {bad('read mpv.aid: '+e);}
    try {
      const tracks=mpv.getNative('track-list');
      const t=Array.isArray(tracks)&&tracks.find(x=>x.type==='audio'&&x.selected);
      if(t)return Number(t.id);
    } catch(e) {bad('read selected track: '+e);}
    return null;
  }
  function switchStatus(state,id,detail) {
    lastSwitchStatus=state+' id='+id+' '+detail;
    say('SWITCH_'+state.toUpperCase()+' id='+id+' '+detail);
    send('af-switch-status',{state,id,detail});
  }
  function setTrack(id) {
    const n=Number(id);
    say('TRACK_CLICK_RECEIVED id='+String(id));
    send('af-ui-track-receipt',{id:n,received:true});
    if(!Number.isFinite(n) || n<=0) {
      switchStatus('error',id,'Invalid audio track ID');return;
    }
    // A refresh can recover a track that was added after the initial cache.
    if(!tracksCache.some(t=>t.id===n))readTracks('switch-revalidate');
    if(!tracksCache.some(t=>t.id===n)) {
      switchStatus('error',n,'Track is not present in IINA/mpv track list');return;
    }
    switchCount++;
    switchStatus('pending',n,'Sending to IINA');
    const before=activeAudioId();
    try {
      core.audio.id=n;
    } catch(e) {
      bad('core.audio.id set failed: '+e);
      try{mpv.set('aid',n);}catch(e2){switchStatus('error',n,'IINA and mpv rejected track: '+e2);return;}
    }
    function confirm(usedFallback) {
      const after=activeAudioId();
      if(after===n) {
        switchStatus('ok',n,'Confirmed active ID '+after+(usedFallback?' via mpv fallback':''));
        try{core.osd('Audio track '+n+' selected');}catch(e){}
        readTracks('switch-confirmed');
        popupOpen=false;
        send('af-close',{});
        wake('audio-selected');
        return;
      }
      if(!usedFallback) {
        // In case IINA's wrapper setter fails silently, use the documented
        // mpv setter once, then verify again; no blind repeated writes.
        try {
          mpv.set('aid',n);
          say('SWITCH_FALLBACK_MPV id='+n+' current='+after+' before='+before);
          setTimeout(()=>confirm(true),500);
        } catch(e) {switchStatus('error',n,'mpv fallback failed: '+e);}
      } else {
        switchStatus('error',n,'Selection not confirmed. Active ID='+after+'; previous='+before);
        readTracks('switch-failed');
      }
    }
    setTimeout(()=>confirm(false),400);
  }
  function pointer() {
    try {
      if(!mpv || typeof mpv.getNative!=='function')return null;
      const p=mpv.getNative('mouse-pos');
      if(!p || typeof p!=='object')return null;
      const x=Number(p.x),y=Number(p.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      return {x,y,hover:p.hover!==false};
    } catch(e) {return null;}
  }
  // Never touch IINA plugin menus from the top-level JS evaluator.
  // On IINA 1.5.0 build 180, a forceUpdate there enters PlayerCore's
  // dispatch_once recursively and terminates the entire app.
  function queueMenuUpdate() {
    return; // Diagnostic: no native menu mutation; see the 0.8.0 startup crash.
    if(nativeMenuTimer!==null)clearTimeout(nativeMenuTimer);
    nativeMenuTimer=setTimeout(()=>{
      nativeMenuTimer=null;
      updateMenus();
    },250);
  }
  function allowMenuUpdates() {
    return; // Disable menu mutation while debugging overlay.
    nativeMenuReady=true;
    queueMenuUpdate();
  }
  function updateMenus() {
    if(!nativeMenuReady)return;
    try {
      menu.removeAllItems();
      const tracksRoot=menu.item('Audio Float: Choose audio track (native)');
      nativeMenuTrackCount=tracksCache.length;
      if(tracksCache.length) {
        for(const t of tracksCache) {
          tracksRoot.addSubMenuItem(menu.item(
            (t.lang?t.lang+' — ':'')+t.title,
            ()=>setTrack(t.id), {selected:!!t.selected}
          ));
        }
      } else {
        tracksRoot.addSubMenuItem(menu.item('No tracks — select Refresh',null,{enabled:false}));
      }
      menu.addItem(tracksRoot);
      menu.addItem(menu.item('Audio Float: Open IINA Audio sidebar',()=>{
        try {core.window.sidebar='audio';}catch(e){bad('sidebar: '+e);}
      }));
      menu.addItem(menu.item('Audio Float: Show overlay selector',()=>{
        initOverlay();overlay.show();
        popupOpen=true;wake('menu',8000);
        send('af-open',{});pushTracks();
      }));
      menu.addItem(menu.item('Audio Float: Refresh native tracks',()=>{readTracks('manual');
        try{core.osd('Audio Float: '+tracksCache.length+' audio tracks');}catch(e){}
      }));
      menu.addItem(menu.item('Audio Float: Auto-hide ('+(autoHide?'ON':'OFF')+')',()=>{
        autoHide=!autoHide;savePreferences();wake('mode-changed');updateMenus();
        send('af-hide-config',{enabled:autoHide,timeoutMs:IDLE_MS});
      }));
      menu.addItem(menu.item('Audio Float: Print bridge diagnostics',diagnostics));
      // DO NOT invoke menu.forceUpdate() here: IINA 1.5.0 startup crash.
    } catch(e){bad('native menu: '+e);}
  }
  function diagnostics() {
    say('DIAGNOSTICS '+JSON.stringify({version:VERSION,overlayStarted,webReady,autoHide,
      currentlyShown:shown,popupOpen,hover,mouseAvailable,mouseMovementSeen,
      latestMouse:pointer(),lastWakeSource:recentSource,
      fullScreen:currentMode==='fullscreen',tracks:tracksCache.length,cacheReady,
      cacheAgeMs:cacheReady?Date.now()-cacheUpdated:null,lastTrackFetchMs,
      clickCount,requestCount,readyMessages,sentMessages,failedMessages,
      nativeMenuTrackCount,wakeCount,inputWakeCount,lastReadError,lastSwitchStatus,switchCount,windowFrame:core.window.frame}));
  }
  function adjust(data) {
    const axis=String(data&&data.axis||''),delta=numeric(data&&data.delta,0);
    const m=layoutCfg[currentMode];
    if(axis==='y')m.yRatio=clamp(m.yRatio+delta,.12,.95);
    if(axis==='x')m.dx=clamp(m.dx+delta,-400,400);
    if(axis==='width')layoutCfg.oscWidth=clamp(layoutCfg.oscWidth+delta,220,650);
    savePreferences();emitLayout();wake('calibrate',6000);
  }
  function reset(data) {
    if(data&&data.all)layoutCfg=clone(DEFAULTS);
    else layoutCfg[currentMode]=clone(DEFAULTS[currentMode]);
    savePreferences();emitLayout();wake('reset',6000);
  }

  // IINA's native JavascriptAPIOverlay.loadFile() calls clearListeners().
  // Bind *after* WebView navigation completes, or none of these callbacks survive.
  function bindOverlayMessages() {
    if(bridgeHandlersBound) return true;
    try {
  overlay.onMessage('af-ready',()=>{
    readyMessages++;
    say('AF_READY_RX count='+readyMessages);
    const first=!webReady;
    webReady=true;
    if(first)shown=null;
    if(first)say('WEBVIEW READY (message bridge confirmed)');
    send('af-ack',{version:VERSION,handshake:readyMessages});
    send('af-hide-config',{enabled:autoHide,timeoutMs:IDLE_MS});
    sendTheme();
    syncNativeClickable();
    // Always re-sync state on handshake: WebView can be recreated silently.
    emitLayout();pushTracks();
    if(first)wake('web-ready');
    else send('af-visibility',{visible:shown===true});
  });
  overlay.onMessage('af-click',()=>{clickCount++;wake('button',8000);});
  overlay.onMessage('af-request-tracks',()=>{
    requestCount++;
    if(!cacheReady)readTracks('button-request');
    else pushTracks();
    if(cacheReady && Date.now()-cacheUpdated>10000)scheduleTrackRead('stale-click',200);
  });
  overlay.onMessage('af-set-track',d=>{say('AF_SET_TRACK_MESSAGE id='+String(d&&d.id));setTrack(d&&d.id);});
  overlay.onMessage('af-popup',d=>{
    popupOpen=!!(d&&d.open);if(popupOpen){wake('popup',15000);pushTracks();}
    else {deadline=Date.now()+IDLE_MS;checkVisible();}
  });
  overlay.onMessage('af-hover',d=>{
    hover=!!(d&&d.inside);
    if(hover){hoverSince=Date.now();wake('button-hover');}
    else {deadline=Date.now()+IDLE_MS;checkVisible();}
  });
  overlay.onMessage('af-adjust',adjust);
  overlay.onMessage('af-reset',reset);
  overlay.onMessage('af-theme-change',d=>setTheme(d&&d.mode));
      bridgeHandlersBound=true;
      say('BRIDGE_HANDLERS_REGISTERED count=9 AFTER_OVERLAY_LOADED');
      return true;
    } catch(e) {
      bad('BRIDGE_HANDLER_REGISTRATION_ERROR '+String(e));
      return false;
    }
  }


  event.on('iina.window-loaded',()=>{
    say('WINDOW_LOADED; defer overlay initialization until after event tick');
    setTimeout(()=>{initOverlay();wake('window-loaded');},150);
  });
  event.on('iina.plugin-overlay-loaded',()=>{
    say('OVERLAY_LOADED');
    // This MUST run after overlay.loadFile; loadFile clears every onMessage listener.
    // Registration here also runs after overlayViewLoaded becomes true, as required
    // by IINA's native JavascriptAPIOverlay.onMessage guard.
    if(!bindOverlayMessages()) {
      bad('POST_LOAD_BRIDGE_BIND_FAILED');
      return;
    }
    try{overlay.show();syncNativeClickable();say('OVERLAY_SHOWN; clickability follows visibility');}
    catch(e){bad('overlay-loaded: '+e);}
    send('af-hello',{version:VERSION});
    emitLayout();pushTracks();sendTheme();
  });
  event.on('iina.file-started',()=>{initOverlay();scheduleTrackRead('file-started',140);wake('file-started');});
  event.on('iina.file-loaded',()=>{initOverlay();scheduleTrackRead('file-loaded',170);wake('file-loaded');});
  event.on('mpv.track-list.changed',()=>scheduleTrackRead('track-list',100));
  event.on('mpv.aid.changed',()=>scheduleTrackRead('aid',100));

  // Fallback for cases where IINA consumes mouse-move events before mpv gets
  // updated. Never intercept clicks; preserve default playback/OSC handlers.
  if(input && typeof input.onMouseDown==='function') {
    try {
      input.onMouseDown(input.MOUSE,()=>{
        inputWakeCount++;
        if(!popupOpen)wake('native-mouse-down');
        return false;
      },input.PRIORITY_LOW);
      say('native mouse-down wake registered (low priority / pass-through)');
    } catch(e) {bad('mouse-down registration: '+e);}
  }
  event.on('iina.window-resized',()=>{emitLayout();wake('resize');});
  event.on('iina.window-size-adjusted',()=>{emitLayout();wake('size-adjusted');});
  event.on('iina.window-fs.changed',full=>{
    currentMode=full?'fullscreen':'window';emitLayout();wake('fullscreen');
  });
  event.on('iina.window-main.changed',isMain=>{
    isMainWindow=!!isMain;
    if(!isMainWindow){
      popupOpen=false;hover=false;deadline=0;
      send('af-close',{});
      checkVisible();
    } else wake('window-focus');
  });
  event.on('iina.window-will-close',()=>{popupOpen=false;deadline=0;hover=false;isMainWindow=false;checkVisible();});
  event.on('iina.window-screen.changed',emitLayout);

  setInterval(()=>{
    if(!overlayStarted)return;
    if(!webReady) {
      // Watchdog: a late-injected WebView bridge can recover without reload.
      send('af-hello',{version:VERSION});
      return;
    }
    const pos=pointer();
    mouseSamples++;
    if(pos && pos.hover) {
      if(!mouseAvailable){
        mouseAvailable=true;
        say('MOUSE_SOURCE_AVAILABLE mpv.mouse-pos');
      }
      // A window re-entry wakes even if the cursor position stays unchanged.
      if(lastMouse && lastMouse.hover===false)wake('mouse-reentry');
      if(lastMouse && lastMouse.hover &&
         Math.abs(pos.x-lastMouse.x)+Math.abs(pos.y-lastMouse.y)>1) {
        mouseMovementSeen=true;wake('mpv.mouse-pos');
      }
    }
    if(mouseSamples>=15 && !mouseDiagnosed) {
      mouseDiagnosed=true;
      if(!mouseAvailable) say('MOUSE_SOURCE_UNAVAILABLE: mouse movement cannot wake Audio Float; click/focus/button hover fallback only');
    }
    lastMouse=pos;
    // Missing mouse-pos is not a reason to keep visible indefinitely.
    // Single authority: main.js is the only actor that decides visibility.
    // Overlay HTML never runs a competing hide timer.
    checkVisible();
  },350);

  // Menu writes are postponed until at least one event-loop turn AFTER the
  // PlayerCore / menu singleton finishes initialization. forceUpdate is never used.
  // Native plugin menu registration intentionally disabled for stability.
  if(core.window.loaded){
    setTimeout(()=>{initOverlay();scheduleTrackRead('startup',50);},150);
  }
  say('STARTED HITTEST_GUARD_RC; native clickability OFF while hidden; click/focus-to-wake fallback; timeout=2500ms');
})();
