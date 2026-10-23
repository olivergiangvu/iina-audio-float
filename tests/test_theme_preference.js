/* Entry-script integration test: theme preferences persist, resync on WebView reload. */
'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');const assert=require('assert');
const script=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
function boot(saved){
  const prefs={...saved};const events={};let messages={};const outgoing=[];let syncs=0;
  const iina={
    preferences:{get:k=>prefs[k],set:(k,v)=>{prefs[k]=v},sync:()=>{syncs++}},
    console:{log:()=>{},error:()=>{}},
    core:{window:{loaded:true,fullscreen:false},audio:{tracks:[{id:1,isSelected:true,formattedTitle:'French',lang:'fr'}],id:1}},
    mpv:{getNative:(key)=>key==='mouse-pos'?null:key==='aid'?1:[]},
    event:{on:(name,fn)=>{events[name]=fn}},
    overlay:{loadFile:()=>{messages={};},show:()=>{},setClickable:()=>{},onMessage:(name,fn)=>{messages[name]=fn},postMessage:(name,data)=>{outgoing.push({name,data})}},
    menu:{},input:{},
  };
  const scheduled=[];
  const ctx={iina,Date,Number,Math,JSON,Error,String,Object,Array,Boolean,Promise,
    setTimeout:(fn)=>{scheduled.push(fn);return scheduled.length},clearTimeout:()=>{},setInterval:()=>{}};
  vm.runInNewContext(script,ctx,{timeout:1500});
  function flush(max=15){for(let n=0;n<max && scheduled.length;n++)scheduled.shift()()}
  flush();events['iina.plugin-overlay-loaded']();
  assert.equal(typeof messages['af-theme-change'],'function','WebView theme callback must be bound after load');
  messages['af-ready']();
  return {prefs,messages,outgoing,syncs:()=>syncs,flush};
}
let s=boot({});
assert.equal(s.outgoing.filter(x=>x.name==='af-theme-config').at(-1).data.mode,'system');
s.messages['af-theme-change']({mode:'light'});
assert.equal(s.prefs['appearance_v01'],'light');
assert.equal(s.outgoing.filter(x=>x.name==='af-theme-config').at(-1).data.mode,'light');
assert.equal(s.syncs(),1);
s.messages['af-theme-change']({mode:'dark'});
assert.equal(s.prefs['appearance_v01'],'dark');
s=boot(s.prefs);
assert.equal(s.outgoing.filter(x=>x.name==='af-theme-config').at(-1).data.mode,'dark','reboot restores Dark choice');
s.messages['af-theme-change']({mode:'unknown'});
assert.equal(s.prefs['appearance_v01'],'system','invalid data resets to System');
assert.equal(s.outgoing.filter(x=>x.name==='af-theme-config').at(-1).data.mode,'system');
console.log('PASS: entry bridge lifecycle, persistent theme selection, handshake re-sync, validation');
