/* Offline behavioral smoke test of the plugin API; NOT a native macOS crash test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let now = 10000;
const timeouts = [];
const intervals = [];
const callbacks = new Map();
const overlayHandlers = new Map();
const clickableTransitions = [];
const outgoing = [];
let mouseDown = null;
let currentlyPlaying = 2;
const audioTracks = [
  { id:1,lang:'fr',title:'French',isSelected:false },
  { id:2,lang:'en',title:'English',isSelected:true }
];
const iina = {
  core: {
    window:{loaded:true,fullscreen:false,frame:{width:900,height:600}},
    audio:{ get id(){ return currentlyPlaying }, set id(v){ currentlyPlaying = Number(v) }, get tracks(){return audioTracks.map(t=>({...t,isSelected:t.id===currentlyPlaying}))}},
    osd:()=>{}
  },
  mpv:{getNative:(key)=>key==='mouse-pos'?null:key==='aid'?currentlyPlaying:[],set:(key,v)=>{if(key==='aid')currentlyPlaying=Number(v)}},
  event:{on:(key,fn)=>callbacks.set(key,fn)},
  overlay:{loadFile:()=>{},show:()=>{},setClickable:(on)=>clickableTransitions.push(!!on),postMessage:(name,data)=>outgoing.push({name,data}),onMessage:(name,fn)=>overlayHandlers.set(name,fn)},
  input:{MOUSE:'MOUSE',PRIORITY_LOW:1,onMouseDown:(_button,fn)=>{mouseDown=fn}},
  menu:{},
  console:{log:()=>{},error:(e)=>{throw new Error(e)}},
  preferences:{get:()=>null,set:()=>{},sync:()=>{}}
};
const sandbox = {
  iina,
  Date: class extends Date { static now(){return now} },
  setTimeout(fn,delay){timeouts.push({fn,delay}) ;return timeouts.length},
  clearTimeout(){},
  setInterval(fn,delay){intervals.push({fn,delay});return intervals.length},
  clearInterval(){},
  console
};
const src = fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
vm.runInNewContext(src,sandbox,{timeout:5000});
const runTimeouts=()=>{let count=0;while(timeouts.length){const fn=timeouts.shift().fn; fn(); assert(++count<30,'Unexpected callback loop')}};
assert.equal(typeof mouseDown, 'function');
assert.equal(intervals.length,1);
runTimeouts();
assert.equal(clickableTransitions.at(-1),false,'WebView must start non-clickable');
callbacks.get('iina.plugin-overlay-loaded')();
assert.equal(clickableTransitions.at(-1),false,'overlay-loaded alone must not enable hit-testing');
overlayHandlers.get('af-ready')();
assert.equal(clickableTransitions.at(-1),true,'After WebView-ready and visible, hit-testing enabled');
assert(outgoing.some(x=>x.name==='af-tracks'));
now+=3500;
intervals[0].fn();
assert.equal(clickableTransitions.at(-1),false,'Auto-hide MUST disable native hit-testing');
assert(outgoing.some(x=>x.name==='af-visibility'&&x.data.visible===false));
// Repeated overlay-loaded notifications must NOT resurrect clickability.
callbacks.get('iina.plugin-overlay-loaded')();
assert.equal(clickableTransitions.at(-1),false,'Repeat overlay load must remain non-clickable');
assert.equal(mouseDown(),false,'Wake event must pass through to IINA playback');
assert.equal(clickableTransitions.at(-1),true,'Native mouse down wakes clickable button');
overlayHandlers.get('af-request-tracks')();
overlayHandlers.get('af-set-track')({id:1});
runTimeouts();
assert.equal(currentlyPlaying,1,'Audio selection remains operational');
assert(outgoing.some(x=>x.name==='af-switch-status'&&x.data.state==='ok'));
// Lose focus should disable clickability immediately, even after switching tracks.
callbacks.get('iina.window-main.changed')(false);
assert.equal(clickableTransitions.at(-1),false,'Background window must be non-clickable');
callbacks.get('iina.window-main.changed')(true);
assert.equal(clickableTransitions.at(-1),true,'Window focus should re-enable button');
now+=3500;
intervals[0].fn();
assert.equal(clickableTransitions.at(-1),false);
console.log('PASS: native clickability lifecycle, idle-hide, click-to-wake, audio-switch, focus guard');
