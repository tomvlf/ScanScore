'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync('public/scores.js','utf8'),context);
function element(){return {classList:{toggle(name,on){this[name]=on}},innerHTML:''}}
test('scoreboard switches between totals and question details without rounding stored shares',()=>{
 const list=element(),table=element(),s={
  game:{questions:[{id:'q1',ordinal:1},{id:'q2',ordinal:2},{id:'q3',ordinal:3}]},
  players:[{name:'Alice',scores:{q1:50/3,q2:50/3,q3:50/3},score:50}]
 };
 context.renderScores(s,'total',list,table);
 assert.equal(table.classList.hidden,true);
 assert.match(list.innerHTML,/>50</);
 context.renderScores(s,'questions',list,table);
 assert.equal(list.classList.hidden,true);assert.equal(table.classList.hidden,false);
 assert.equal((table.innerHTML.match(/16,67/g)||[]).length,3);
 assert.match(table.innerHTML,/>50</);assert.ok(!table.innerHTML.includes('50,01'));
 assert.equal(s.players[0].scores.q1,50/3);
});
test('historical results retain removed players and escape names and old question labels',()=>{
 const list=element(),table=element();
 context.renderScores({game:{questions:[{id:'q',label:'<Finale>'}]},players:[
  {name:'<Alice>',deleted:true,score:25,scores:{q:25}},
  {name:'Bravo',score:50,scores:{q:50}}
 ]},'questions',list,table);
 assert.ok(list.innerHTML.indexOf('Bravo')<list.innerHTML.indexOf('&lt;Alice&gt;'));
 assert.match(table.innerHTML,/&lt;Finale&gt;/);assert.match(table.innerHTML,/&lt;Alice&gt;/);
 assert.match(table.innerHTML,/verwijderd/);assert.ok(!table.innerHTML.includes('<Alice>'));
});
test('podium shows the top three, highlights the leader and escapes names',()=>{
 const box={innerHTML:'',classList:{one:true,few:true,toggle(name,on){this[name]=on}}};
 context.renderPodium({players:[
  {name:'<b>Alice</b>',score:100},
  {name:'Bravo',score:50},
  {name:'Charlie',score:25},
  {name:'Delta',score:10}
 ]},box);
 assert.equal((box.innerHTML.match(/podium-card place-/g)||[]).length,3);
 assert.match(box.innerHTML,/place-1/);
 assert.match(box.innerHTML,/100/);
 assert.ok(!box.innerHTML.includes('<b>Alice</b>'));
 assert.ok(!box.innerHTML.includes('Delta'));
 assert.equal(box.classList.one,false);
 assert.equal(box.classList.few,false);
});

async function scoreboard({savedSession=null,loginStatus=200}={}){
 const elements=new Map(),sockets=[],requests=[],location={protocol:'https:',host:'quiz.example.test'};
 const document={
  querySelector(selector){
   if(!elements.has(selector)){
    const classes=new Set(selector==='#board'||selector==='#logout'?['hidden']:[]);
    elements.set(selector,{value:'',textContent:'',innerHTML:'',classList:{
     add(name){classes.add(name)},remove(name){classes.delete(name)},
     toggle(name,on){if(on)classes.add(name);else classes.delete(name)},contains(name){return classes.has(name)}
    }});
   }
   return elements.get(selector);
  }
 };
 class WebSocket{
  constructor(){this.readyState=1;this.messages=[];sockets.push(this)}
  send(message){this.messages.push(JSON.parse(message))}
  close(){}
 }
 const browser=vm.createContext({document,location,WebSocket,fetch:async(url,options)=>{
  assert.equal(url,'/api/session');requests.push(options);
  const status=options.method==='GET'?(savedSession?200:401):loginStatus;
  return {status,ok:status===200,json:async()=>savedSession||{roomName:'Family Quiz'}};
 }});
 for(const file of ['scores.js','session.js','scoreboard.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),browser);
 await new Promise(setImmediate);
 return {$:selector=>document.querySelector(selector),sockets,requests,location};
}

test('scoreboard uses room credentials, clears the password and opens a read-only connection',async()=>{
 const app=await scoreboard(),{$}=app;
 $('#roomName').value='Family Quiz';$('#secret').value='a long host password';
 await $('#auth').onsubmit({preventDefault(){}});
 assert.deepEqual(JSON.parse(app.requests.find(r=>r.method==='POST').body),{roomName:'Family Quiz',secret:'a long host password'});
 assert.equal($('#secret').value,'');
 app.sockets[0].onopen();
 assert.deepEqual(app.sockets[0].messages,[{type:'auth',role:'display'}]);
 app.sockets[0].onmessage({data:JSON.stringify({type:'auth.ok',state:{title:'Family Quiz',games:[],players:[],game:null,revision:1}})});
 assert.equal($('#auth').classList.contains('hidden'),true);
 assert.equal($('#board').classList.contains('hidden'),false);
 assert.equal($('#logout').classList.contains('hidden'),false);
});

test('scoreboard restores after reopening without a password and can log out',async()=>{
 const app=await scoreboard({savedSession:{roomName:'Family Quiz'}});
 assert.equal(app.sockets.length,1);app.sockets[0].onopen();
 assert.deepEqual(app.sockets[0].messages,[{type:'auth',role:'display'}]);
 assert.deepEqual(app.requests.map(r=>r.method),['GET']);
 await app.$('#logout').onclick();
 assert.deepEqual(app.requests.map(r=>r.method),['GET','DELETE']);
 assert.equal(app.location.href,'/');
});

test('scoreboard shows invalid credentials and returns to login when a session expires',async()=>{
 const invalid=await scoreboard({loginStatus:401});
 await invalid.$('#auth').onsubmit({preventDefault(){}});
 assert.equal(invalid.sockets.length,0);
 assert.match(invalid.$('#authMessage').textContent,/Ruimtenaam of wachtwoord is onjuist/);
 const expired=await scoreboard({savedSession:{roomName:'Family Quiz'}});
 expired.sockets[0].onclose({code:4403});
 assert.equal(expired.$('#auth').classList.contains('hidden'),false);
 assert.equal(expired.$('#board').classList.contains('hidden'),true);
 assert.match(expired.$('#authMessage').textContent,/aanmelding is verlopen/);
});
