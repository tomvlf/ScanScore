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
