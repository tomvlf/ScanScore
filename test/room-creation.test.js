'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');

function browser(fetch,{savedSession=null,loginStatus=200}={}){
 const elements=new Map(),sockets=[],sessionRequests=[];
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
 const context=vm.createContext({document,fetch:async(url,options)=>{
  if(url!=='/api/session')return fetch(url,options);
  sessionRequests.push(options);
  const status=options.method==='GET'?(savedSession?200:401):loginStatus;
  return {status,ok:status===200,json:async()=>savedSession||{roomName:'Family Quiz'}};
 },WebSocket,location:{protocol:'https:',host:'quiz.example.test'},confirm(){return true},setTimeout(){},clearTimeout(){}});
 vm.runInContext(fs.readFileSync('public/session.js','utf8'),context);
 vm.runInContext(fs.readFileSync('public/scores.js','utf8'),context);
 vm.runInContext(app,context);
 const $=selector=>document.querySelector(selector);
 $('#roomName').value='Family Quiz';$('#secret').value='a long host password';
 $('#scoreView').value='total';
 return {$,sockets,sessionRequests};
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
 const {$,sockets,sessionRequests}=browser(async(_url,options)=>{
  request=JSON.parse(options.body);
  return {status:201,ok:true,json:async()=>({roomId:'internal-room-id',displayToken:'test-display-token'})};
 });
 const creating=$('#create').onclick();
 $('#roomName').value='Changed while creating';$('#secret').value='another password';
 await creating;
 assert.deepEqual(request,{roomName:'Family Quiz',hostSecret:'a long host password'});
 assert.equal(sockets.length,1);
 const socket=sockets[0];socket.onopen();
 assert.deepEqual(socket.messages[0],{type:'auth',role:'host'});
 assert.deepEqual(JSON.parse(sessionRequests.find(r=>r.method==='POST').body),{roomName:'Family Quiz',secret:'a long host password'});
 assert.equal($('#secret').value,'');
 assert.ok(!$('#loginMessage').textContent.includes('test-display-token'));
 socket.onmessage({data:JSON.stringify({type:'auth.ok',roomId:'internal-room-id',state:{games:[],game:null,activeGameId:null,players:[],revision:1}})});
 assert.equal($('#login').classList.contains('hidden'),true);
 assert.equal($('#app').classList.contains('hidden'),false);
 assert.equal($('#displayMore').href,'/scoreboard.html');
});

test('returning hosts sign in with room name and password, never a generated token',async()=>{
 const {$,sockets,sessionRequests}=browser(()=>assert.fail('Signing in must not create another room'));
 await $('#loginForm').onsubmit({preventDefault(){}});
 sockets[0].onopen();
 assert.deepEqual(JSON.parse(sessionRequests.find(r=>r.method==='POST').body),{roomName:'Family Quiz',secret:'a long host password'});
 assert.deepEqual(sockets[0].messages[0],{type:'auth',role:'host'});
 sockets[0].onclose({code:4403});
 assert.match($('#loginMessage').textContent,/aanmelding is verlopen/);
});

test('hosts restore a saved session without requesting or sending a password',async()=>{
 const {sockets,sessionRequests}=browser(()=>assert.fail('Unexpected fetch'),{savedSession:{roomName:'Family Quiz'}});
 await new Promise(setImmediate);
 assert.equal(sockets.length,1);sockets[0].onopen();
 assert.deepEqual(sockets[0].messages,[{type:'auth',role:'host'}]);
 assert.deepEqual(sessionRequests.map(r=>r.method),['GET']);
});

test('incorrect login credentials stay on the form without opening a socket',async()=>{
 const {$,sockets}=browser(()=>assert.fail('Unexpected fetch'),{loginStatus:401});
 await $('#loginForm').onsubmit({preventDefault(){}});
 assert.equal(sockets.length,0);
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

test('a new game requires an explicit point pool and sends it to the server',async()=>{
 const {$,sockets}=browser(()=>assert.fail('Starting a game must not create another room'));
 await $('#loginForm').onsubmit({preventDefault(){}});
 $('#pointsPerQuestion').value='50';
 $('#gameForm').reportValidity=()=>false;
 $('#gameForm').onsubmit({preventDefault(){}});
 assert.equal(sockets[0].messages.length,0);
 $('#gameForm').reportValidity=()=>true;
 $('#gameForm').onsubmit({preventDefault(){}});
 assert.deepEqual(sockets[0].messages,[{type:'game.start',pointsPerQuestion:50}]);
 assert.equal($('#pointsPerQuestion').value,'');
});

test('question navigation and winner corrections carry the displayed game and question',async()=>{
 const {$,sockets}=browser(()=>assert.fail('Unexpected fetch'));
 await $('#loginForm').onsubmit({preventDefault(){}});
 const socket=sockets[0];
 socket.onmessage({data:JSON.stringify({type:'auth.ok',roomId:'room',state:{
  games:[],activeGameId:'game',game:{id:'game',question:2,questions:[{id:'q1',ordinal:1,winners:[]},{id:'q2',ordinal:2,points:50,winners:[{playerId:'alice',points:50}]}]},
  players:[{id:'alice',name:'Alice',score:50,scores:{q2:50}}],revision:2
 }})});
 $('#previous').onclick();
 $('#winners').onclick({target:{closest(){return {dataset:{removeWinner:'alice'}}}}});
 assert.deepEqual(socket.messages,[
  {type:'question.select',gameId:'game',questionId:'q2',targetQuestionId:'q1'},
  {type:'winner.remove',gameId:'game',questionId:'q2',playerId:'alice'}
 ]);
 assert.match($('#poolInfo').textContent,/50.*1 winnaar.*50/);
});

test('stopped games are read-only while player registration remains available',async()=>{
 const {$,sockets}=browser(()=>assert.fail('Unexpected fetch'));
 await $('#loginForm').onsubmit({preventDefault(){}});
 sockets[0].onmessage({data:JSON.stringify({type:'auth.ok',roomId:'room',state:{
  games:[],activeGameId:null,game:{id:'old',endedAt:'2026-01-01',question:1,questions:[{id:'q1',ordinal:1,winners:[]}]},players:[],revision:1
 }})});
 assert.equal($('#next').disabled,true);
 assert.equal($('#start').disabled,true);
 assert.equal($('#gameForm').classList.contains('hidden'),false);
 await $('#start').onclick();
 assert.match($('#toast').textContent,/Start eerst een spel/);
 assert.equal(sockets[0].messages.length,0);
});
