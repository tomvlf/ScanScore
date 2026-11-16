'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');

function browser(fetch){
 const elements=new Map();
 const document={
  querySelector(selector){
   if(!elements.has(selector))elements.set(selector,{value:'test-room',textContent:'',classList:{add(){},remove(){}},focus(){this.focused=true}});
   return elements.get(selector);
  },
  querySelectorAll(){return []}
 };
 vm.runInNewContext(app,{document,fetch,setTimeout(){},clearTimeout(){}});
 return selector=>document.querySelector(selector);
}

test('duplicate room ID explains how to create a different room or reconnect',async()=>{
 const $=browser(async()=>({status:409,ok:false}));
 await $('#create').onclick();
 assert.match($('#created').textContent,/ruimte-ID bestaat al/);
 assert.match($('#created').textContent,/ander ruimte-ID/);
 assert.match($('#created').textContent,/Verbinden.*bestaande hostwachtwoord/);
 assert.equal($('#toast').textContent,$('#created').textContent);
 assert.equal($('#roomId').focused,true);
});

test('successful room creation still displays the read-only token',async()=>{
 const $=browser(async()=>({status:201,ok:true,json:async()=>({displayToken:'test-display-token'})}));
 await $('#create').onclick();
 assert.match($('#created').textContent,/test-display-token/);
 assert.match($('#toast').textContent,/Ruimte aangemaakt/);
});

test('network failures show a persistent failure instead of stale success',async()=>{
 const $=browser(async()=>{throw Error('Network failed')});
 $('#created').textContent='Ruimte gemaakt';
 await $('#create').onclick();
 assert.match($('#created').textContent,/Controleer de velden en je verbinding/);
 assert.equal($('#toast').textContent,$('#created').textContent);
});
