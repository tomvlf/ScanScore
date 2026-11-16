'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');

function browser(fetch){
 const elements=new Map(),sockets=[];
 const document={
  querySelector(selector){
   if(!elements.has(selector)){
    const classes=new Set(['hidden']);
    elements.set(selector,{value:'',textContent:'',classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)},contains(x){return classes.has(x)}},focus(){this.focused=true},reportValidity(){return true}});
   }
   return elements.get(selector);
  },
  querySelectorAll(){return []}
 };
 class WebSocket{
  constructor(){this.readyState=1;this.messages=[];sockets.push(this)}
  send(message){this.messages.push(JSON.parse(message))}
  close(){}
 }
 vm.runInNewContext(app,{document,fetch,WebSocket,location:{protocol:'https:',host:'quiz.example.test'},setTimeout(){},clearTimeout(){}});
 const $=selector=>document.querySelector(selector);
 $('#roomName').value='Family Quiz';$('#secret').value='a long host password';
 return {$,sockets};
}

test('duplicate room name explains how to create a different room or sign in',async()=>{
 const {$,sockets}=browser(async()=>({status:409,ok:false}));
 await $('#create').onclick();
 assert.match($('#loginMessage').textContent,/ruimtenaam bestaat al/);
 assert.match($('#loginMessage').textContent,/andere naam/);
 assert.match($('#loginMessage').textContent,/Aanmelden.*bestaande wachtwoord/);
 assert.equal($('#toast').textContent,$('#loginMessage').textContent);
 assert.equal($('#roomName').focused,true);
 assert.equal(sockets.length,0);
});

test('creating a room automatically signs in with the chosen name and password',async()=>{
 let request;
 const {$,sockets}=browser(async(_url,options)=>{
  request=JSON.parse(options.body);
  return {status:201,ok:true,json:async()=>({roomId:'internal-room-id',displayToken:'test-display-token'})};
 });
 const creating=$('#create').onclick();
 $('#roomName').value='Changed while creating';$('#secret').value='another password';
 await creating;
 assert.deepEqual(request,{roomName:'Family Quiz',hostSecret:'a long host password'});
 assert.equal(sockets.length,1);
 const socket=sockets[0];socket.onopen();
 assert.deepEqual(socket.messages[0],{type:'auth',roomName:'Family Quiz',role:'host',secret:'a long host password'});
 assert.equal($('#displayToken').value,'test-display-token');
 assert.equal($('#displayCredentials').classList.contains('hidden'),false);
 assert.ok(!$('#loginMessage').textContent.includes('test-display-token'));
 socket.onmessage({data:JSON.stringify({type:'auth.ok',roomId:'internal-room-id',state:{rounds:[],players:[],winners:[],placePoints:[5,3,1]}})});
 assert.equal($('#login').classList.contains('hidden'),true);
 assert.equal($('#app').classList.contains('hidden'),false);
 assert.equal($('#displayMore').href,'/scoreboard.html?room=internal-room-id');
});

test('returning hosts sign in with room name and password, never a generated token',()=>{
 const {$,sockets}=browser(()=>assert.fail('Signing in must not create another room'));
 $('#loginForm').onsubmit({preventDefault(){}});
 sockets[0].onopen();
 assert.deepEqual(sockets[0].messages[0],{type:'auth',roomName:'Family Quiz',role:'host',secret:'a long host password'});
 sockets[0].onclose({code:4403});
 assert.match($('#loginMessage').textContent,/Ruimtenaam of wachtwoord is onjuist/);
});

test('network failures show a persistent failure instead of stale success',async()=>{
 const {$,sockets}=browser(async()=>{throw Error('Network failed')});
 $('#loginMessage').textContent='Ruimte gemaakt';
 await $('#create').onclick();
 assert.match($('#loginMessage').textContent,/Controleer de velden en je verbinding/);
 assert.equal($('#toast').textContent,$('#loginMessage').textContent);
 assert.equal(sockets.length,0);
 assert.equal($('#create').disabled,false);
});

test('invalid creation fields do not submit or sign in',async()=>{
 const {$,sockets}=browser(()=>assert.fail('Invalid form must not submit'));
 $('#loginForm').reportValidity=()=>false;
 await $('#create').onclick();
 assert.equal(sockets.length,0);
});
