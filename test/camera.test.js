'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');

function browser({startGate,failOnce,secure=true,lateScanningFlag=false}={}){
 const elements=new Map(),events=[],instances=[],messages=[];let active,requested;
 const started=new Promise(resolve=>{requested=resolve});
 const $=selector=>{
  if(!elements.has(selector)){
   const listeners=new Map();
   elements.set(selector,{value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},focus(){this.focused=true},
    addEventListener(event,listener){listeners.set(event,listener)},removeEventListener(event){listeners.delete(event)},emit(event){listeners.get(event)?.()}});
  }
  return elements.get(selector);
 };
 class Html5Qrcode{
  constructor(id){this.id=id;this.isScanning=false;this.state=1;instances.push(this)}
  getState(){return this.state}
  async start(_camera,_config,onScan){
   events.push('start:'+this.id);requested();this.onScan=onScan;
   if(active)throw Object.assign(Error('Camera in use'),{name:'NotReadableError'});
   if(instances.length===1&&startGate)await startGate;
   if(failOnce){const error=failOnce;failOnce=null;throw error}
   active=this;this.state=2;this.isScanning=!lateScanningFlag;
   if(lateScanningFlag)setImmediate(()=>{this.isScanning=true;$('#'+this.id+' video').emit('playing')});
  }
  async stop(){events.push('stop:'+this.id);await Promise.resolve();active=null;this.isScanning=false;this.state=1}
  clear(){assert.equal(active===this,false);events.push('clear:'+this.id)}
 }
 const context=vm.createContext({
  document:{querySelector:$,querySelectorAll(){return []}},Html5Qrcode,Html5QrcodeScannerState:{NOT_STARTED:1,SCANNING:2,PAUSED:3},
  navigator:{mediaDevices:{getUserMedia(){}}},isSecureContext:secure,
  roomSession:{restore:async()=>null},
  console:{warn(){}},scrollTo(){},setTimeout(){},clearTimeout(){},
  socket:{readyState:1,send(message){messages.push(JSON.parse(message))}}
 });
 vm.runInContext(source,context);vm.runInContext('ws=socket;state={activeGameId:"game",game:{id:"game",question:1,questions:[{id:"q1",ordinal:1}]}}',context);
 $('#playerName').value='Alice';$('#playerType').value='person';
 return {$,context,events,instances,messages,started,get active(){return active},idle(){return vm.runInContext('cameraTask',context)}};
}

test('switching from scoring to players releases the camera before pairing',async()=>{
 const app=browser(),{$}=app;
 await $('#start').onclick();
 await app.context.page('players');
 await $('#pair').onclick();
 assert.deepEqual(app.events,['start:reader','stop:reader','clear:reader','start:pairReader']);
 assert.equal(app.active.id,'pairReader');
 await app.context.page('play');
 assert.equal(app.active,null);
 await $('#start').onclick();
 assert.equal(app.active.id,'reader');
});

test('page changes and pairing wait for a pending scoring-camera startup',async()=>{
 let release;const startGate=new Promise(resolve=>{release=resolve});
 const app=browser({startGate,lateScanningFlag:true}),{$}=app;
 const scoring=$('#start').onclick();await app.started;
 const switching=app.context.page('players'),pairing=$('#pair').onclick();
 assert.deepEqual(app.events,['start:reader']);
 release();await Promise.all([scoring,switching,pairing]);
 assert.deepEqual(app.events,['start:reader','stop:reader','clear:reader','start:pairReader']);
 assert.equal(app.active.id,'pairReader');
});

test('camera permission errors remain visible and a subsequent retry can start',async()=>{
 const app=browser({failOnce:Object.assign(Error('Permission denied'),{name:'NotAllowedError'})}),{$}=app;
 await $('#pair').onclick();
 assert.match($('#pairStatus').textContent,/Cameratoegang is geblokkeerd.*site-instellingen/);
 assert.equal($('#pair').disabled,false);
 await $('#pair').onclick();
 assert.equal(app.active.id,'pairReader');
 assert.match($('#pairStatus').textContent,/Camera actief/);
});

test('insecure pages explain HTTPS without attempting to open a camera',async()=>{
 const app=browser({secure:false}),{$}=app;
 await $('#pair').onclick();
 assert.match($('#pairStatus').textContent,/HTTPS/);
 assert.equal(app.instances.length,0);
});

test('pairing submits a QR code once and releases the camera',async()=>{
 const app=browser(),{$}=app;
 await $('#pair').onclick();
 const scanner=app.active;scanner.onScan('qr-alice');scanner.onScan('qr-alice');
 await app.idle();
 assert.deepEqual(app.messages,[{type:'player.add',name:'Alice',playerType:'person',code:'qr-alice'}]);
 assert.equal(app.active,null);
 assert.equal($('#playerName').value,'');
 assert.match($('#pairStatus').textContent,/QR-code gescand en verzonden/);
});
