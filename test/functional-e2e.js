'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),WebSocket=require('ws');
const APP=(process.env.APP_URL||'http://app:8080').replace(/\/$/,''),ORIGIN=process.env.PUBLIC_ORIGIN||'https://quiz.example.test';
const room=`E2E Quiz ${crypto.randomBytes(5).toString('hex')}`,hostSecret='correct horse battery staple';let roomId;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Client{
 constructor(role,secret){this.role=role;this.secret=secret;this.queue=[];this.waiters=[]}
 async open(){
  const login=await fetch(APP+'/api/session?role='+this.role,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({roomName:room,secret:this.secret})});
  if(login.status!==200)throw Error('Login rejected');
  const ticket=(await login.json()).socketTicket;
  const url=APP.replace(/^http/,'ws')+'/ws';
  this.ws=new WebSocket(url,{headers:{Origin:ORIGIN}});
  this.ws.on('message',b=>this.push(JSON.parse(b)));
  this.ws.on('close',()=>{for(const w of this.waiters){clearTimeout(w.t);w.no(Error('WebSocket closed'))}this.waiters=[]});
  await new Promise((ok,no)=>{this.ws.once('open',ok);this.ws.once('error',no)});
  this.send({type:'auth',role:this.role,socketTicket:ticket});
  return this.next(x=>x.type==='auth.ok');
 }
 push(m){const i=this.waiters.findIndex(w=>w.pred(m));if(i>=0){const w=this.waiters.splice(i,1)[0];clearTimeout(w.t);w.ok(m)}else this.queue.push(m)}
 next(pred,timeout=7000){const i=this.queue.findIndex(pred);if(i>=0)return Promise.resolve(this.queue.splice(i,1)[0]);return new Promise((ok,no)=>{const w={pred,ok,no,t:setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);no(Error('Timed out waiting for message'))},timeout)};this.waiters.push(w)})}
 send(m){this.ws.send(JSON.stringify(m))}
 close(){this.ws?.close()}
}
async function stateAfter(c,type,payload={}){c.send({type,...payload});return c.next(x=>x.type==='state')}
async function rejected(c,type,payload={}){c.send({type,...payload});const m=await c.next(x=>x.type==='error');assert.equal(m.code,'action_rejected');return m}
async function scan(c,code,key=crypto.randomUUID(),gameId,questionId){c.send({type:'scan.award',code,idempotencyKey:key,gameId,questionId});return c.next(x=>x.type==='scan.result'||x.type==='error')}
function player(state,name){return state.players.find(x=>x.name===name)}
function score(state,name){return player(state,name)?.score||0}
function close(...clients){for(const c of clients)c?.close()}
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(APP+'/readyz')).ok)break}catch{}await wait(250)}
 let page=await fetch(APP+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy')||'',/default-src/);assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 assert.equal((await fetch(APP+'/scoreboard.html')).status,200);assert.equal((await fetch(APP+'/does-not-exist')).status,404);
 let r=await fetch(APP+'/api/rooms',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({roomName:'',hostSecret:'short'})});assert.equal(r.status,400);
 await new Promise((ok,no)=>{const bad=new WebSocket(APP.replace(/^http/,'ws')+'/ws',{headers:{Origin:'https://evil.example'}});bad.once('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,403);ok()});bad.once('open',()=>no(Error('Forbidden origin connected')));bad.once('error',e=>{if(!String(e.message).includes('403'))no(e)})});
 r=await fetch(APP+'/api/rooms',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({roomName:room,hostSecret})});assert.equal(r.status,201);const created=await r.json();assert.ok(created.roomId&&!('displayToken' in created));roomId=created.roomId;
 r=await fetch(APP+'/api/rooms',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({roomName:` ${room.toUpperCase()} `,hostSecret})});assert.equal(r.status,409);
 const idle=new WebSocket(APP.replace(/^http/,'ws')+'/ws',{headers:{Origin:ORIGIN}});await new Promise((ok,no)=>{idle.once('open',ok);idle.once('error',no)});
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Authentication timeout missing')),7000);idle.once('close',code=>{clearTimeout(timer);assert.equal(code,4401);ok()})});
 const host=new Client('host',hostSecret),auth=await host.open();assert.equal(auth.state.title,room);assert.equal(auth.state.games.length,0);
 const oversized=new Client('host',hostSecret);await oversized.open();oversized.ws.send(JSON.stringify({type:'unknown',data:'x'.repeat(20000)}));
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Oversized message was not closed')),5000);oversized.ws.once('close',()=>{clearTimeout(timer);ok()})});
 const playerIds={};
 for(const [name,code,playerType] of [['Alice','qr-alice','person'],['Team Bravo','qr-bravo','team'],['Charlie','qr-charlie','person']]){
  let st=await stateAfter(host,'player.add',{name,playerType,code});assert.equal(player(st.state,name).kind,playerType);playerIds[name]=player(st.state,name).id;
 }
 await rejected(host,'player.add',{name:'',playerType:'person',code:'qr-invalid'});
 await rejected(host,'player.add',{name:'Duplicate QR',playerType:'person',code:'qr-alice'});
 const gameState=await stateAfter(host,'game.start',{pointsPerQuestion:50}),gameId=gameState.state.activeGameId,question1=gameState.state.game.questions[0].id;
 assert.ok(gameId);assert.equal(gameState.state.game.pointsPerQuestion,50);
 const secondHost=new Client('host',hostSecret);await secondHost.open();
 await rejected(secondHost,'game.start',{pointsPerQuestion:10});
 const withDana=await stateAfter(host,'player.add',{name:'Dana',playerType:'person',code:'qr-dana'});playerIds.Dana=player(withDana.state,'Dana').id;
 let result=await scan(host,'missing',crypto.randomUUID(),gameId,question1);assert.equal(result.code,'unknown');
 const firstScanKey=crypto.randomUUID();result=await scan(host,'qr-alice',firstScanKey,gameId,question1);assert.equal(result.ok,true);assert.equal(result.points,50);assert.equal(result.winnerCount,1);
 result=await scan(host,'qr-alice',firstScanKey,gameId,question1);assert.equal(result.type,'error');assert.equal(result.reason,'duplicate_request');
 let st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),50);
 result=await scan(host,'qr-bravo',crypto.randomUUID(),gameId,question1);assert.equal(result.ok,true);assert.equal(result.points,25);
 st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),25);assert.equal(score(st.state,'Team Bravo'),25);
 result=await scan(host,'qr-charlie',crypto.randomUUID(),gameId,question1);assert.equal(result.ok,true);assert.ok(Math.abs(result.points-50/3)<1e-10);
 st=await host.next(x=>x.type==='state');for(const name of ['Alice','Team Bravo','Charlie'])assert.ok(Math.abs(st.state.players.find(p=>p.name===name).scores[question1]-50/3)<1e-10);
 result=await scan(host,'qr-charlie',crypto.randomUUID(),gameId,question1);assert.equal(result.code,'duplicate');
 st=await stateAfter(host,'winner.remove',{gameId,questionId:question1,playerId:playerIds['Team Bravo']});
 assert.equal(score(st.state,'Alice'),25);assert.equal(score(st.state,'Charlie'),25);assert.equal(score(st.state,'Team Bravo'),0);
 const question2State=await stateAfter(host,'question.next',{gameId,questionId:question1}),question2=question2State.state.game.questions.find(q=>q.ordinal===2).id;
 assert.equal(question2State.state.game.question,2);
 result=await scan(host,'qr-bravo',crypto.randomUUID(),gameId,question2);assert.equal(result.points,50);st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Team Bravo'),50);
 let error=await rejected(host,'scan.award',{gameId,questionId:question1,code:'qr-alice',idempotencyKey:crypto.randomUUID()});assert.equal(error.reason,'stale_question');
 st=await stateAfter(host,'question.select',{gameId,questionId:question2,targetQuestionId:question1});assert.equal(st.state.game.question,1);
 result=await scan(host,'qr-bravo',crypto.randomUUID(),gameId,question1);assert.equal(result.ok,true);
 st=await host.next(x=>x.type==='state');for(const name of ['Alice','Team Bravo','Charlie'])assert.ok(Math.abs(st.state.players.find(p=>p.name===name).scores[question1]-50/3)<1e-10);
 const nextAgain=await stateAfter(host,'question.next',{gameId,questionId:question1});assert.equal(nextAgain.state.game.question,2);assert.equal(nextAgain.state.game.questions.length,2);
 st=await stateAfter(host,'game.stop',{gameId,questionId:question2});assert.ok(st.state.game.endedAt);assert.equal(st.state.activeGameId,null);
 let nextGame=await stateAfter(host,'game.start',{pointsPerQuestion:10});assert.notEqual(nextGame.state.activeGameId,gameId);assert.equal(score(nextGame.state,'Alice'),0);assert.equal(score(nextGame.state,'Team Bravo'),0);
 st=await stateAfter(host,'game.select',{gameId});assert.equal(st.state.game.id,gameId);assert.ok(Math.abs(score(st.state,'Team Bravo')-200/3)<1e-10);
 st=await stateAfter(host,'player.remove',{playerId:playerIds.Charlie});assert.equal(player(st.state,'Charlie').deleted,true);assert.ok(Math.abs(score(st.state,'Charlie')-50/3)<1e-10);
 st=await stateAfter(host,'player.add',{name:'Charlie New',playerType:'person',code:'qr-charlie'});assert.ok(player(st.state,'Charlie New'));assert.ok(player(st.state,'Charlie').deleted);
 st=await stateAfter(host,'game.select',{gameId:null});assert.equal(st.state.game.id,nextGame.state.activeGameId);assert.equal(score(st.state,'Alice'),0);
 await stateAfter(host,'game.stop',{gameId:nextGame.state.activeGameId,questionId:nextGame.state.game.questions[0].id});
 const login=await fetch(APP+'/api/session?role=host',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({roomName:room,secret:hostSecret})});
 assert.equal(login.status,200);const cookie=(login.headers.get('set-cookie')||'').split(';')[0];assert.match(cookie,/^(__Host-)?scorescan_session=/);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 r=await fetch(APP+'/api/images',{method:'POST',headers:{origin:ORIGIN,'content-type':'image/png'},body:png});assert.equal(r.status,401);
 r=await fetch(APP+'/api/images',{method:'POST',headers:{origin:ORIGIN,'content-type':'image/png',cookie},body:Buffer.from('not an image')});assert.equal(r.status,415);
 r=await fetch(APP+'/api/images',{method:'POST',headers:{origin:ORIGIN,'content-type':'image/png',cookie},body:png});assert.equal(r.status,201);const image=await r.json();assert.ok(image.id);
 const quizTitle=`E2E Quiz ${crypto.randomBytes(4).toString('hex')}`;
 r=await fetch(APP+'/api/quizzes',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',cookie},body:JSON.stringify({title:quizTitle,languagePrimary:'Nederlands',languageSecondary:'English',questions:[{prompt:'Eerste vraag?',promptAlt:'First question?',points:25,imageId:image.id},{prompt:'Tweede vraag?',promptAlt:'Second question?',points:75,imageId:image.id}]})});
 assert.equal(r.status,201);const quiz=await r.json();assert.ok(quiz.quizId);
 const quizList=await host.next(x=>x.type==='state'&&x.state.quizzes?.some(q=>q.id===quiz.quizId));assert.equal(quizList.state.quizzes[0].questions.length,2);
 const quizGame=await stateAfter(host,'game.start',{quizId:quiz.quizId});const quizGameId=quizGame.state.activeGameId,quizQ1=quizGame.state.game.questions[0],quizQ2=quizGame.state.game.questions[1];
 assert.equal(quizGame.state.game.quizTitle,quizTitle);assert.equal(quizGame.state.game.questionCount,2);assert.equal(quizGame.state.game.languagePrimary,'Nederlands');assert.equal(quizGame.state.game.languageSecondary,'English');assert.equal(quizQ1.prompt,'Eerste vraag?');assert.equal(quizQ1.promptAlt,'First question?');assert.equal(quizQ1.points,25);assert.ok(quizQ1.imageId);assert.equal(quizQ2.points,75);
 result=await scan(host,'qr-alice',crypto.randomUUID(),quizGameId,quizQ1.id);assert.equal(result.ok,true);assert.equal(result.points,25);
 st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),25);
 const quizNext=await stateAfter(host,'question.next',{gameId:quizGameId,questionId:quizQ1.id});assert.equal(quizNext.state.game.question,2);
 result=await scan(host,'qr-bravo',crypto.randomUUID(),quizGameId,quizQ2.id);assert.equal(result.ok,true);assert.equal(result.points,75);
 st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Team Bravo'),75);
 const quizFinished=await rejected(host,'question.next',{gameId:quizGameId,questionId:quizQ2.id});assert.equal(quizFinished.reason,'quiz_finished');
 st=await stateAfter(host,'game.stop',{gameId:quizGameId,questionId:quizQ2.id});assert.equal(st.state.activeGameId,null);
 const imageResponse=await fetch(APP+'/api/images/'+image.id,{headers:{cookie}});assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/png');assert.ok((await imageResponse.arrayBuffer()).byteLength>0);
 r=await fetch(APP+'/api/images/'+image.id+'/thumbnail',{method:'POST',headers:{origin:ORIGIN,'content-type':'image/png',cookie},body:png});assert.equal(r.status,200);
 const thumbResponse=await fetch(APP+'/api/images/'+image.id+'?thumb=1',{headers:{cookie}});assert.equal(thumbResponse.status,200);assert.equal(thumbResponse.headers.get('content-type'),'image/png');
 assert.equal((await fetch(APP+'/api/images/'+image.id)).status,401);
 r=await fetch(APP+'/api/quizzes/'+quiz.quizId,{method:'DELETE',headers:{origin:ORIGIN,cookie}});assert.equal(r.status,200);
 const quizGone=await host.next(x=>x.type==='state'&&!(x.state.quizzes||[]).some(q=>q.id===quiz.quizId));assert.equal(quizGone.state.quizzes.length,0);
 const display=new Client('display',hostSecret),displayAuth=await display.open();assert.equal(displayAuth.state.players.length,4);assert.ok(!('quizzes' in displayAuth.state));
 await stateAfter(host,'display.language',{language:'both'});
 const displayBoth=await display.next(x=>x.type==='state'&&x.state.displayLanguage==='both');assert.equal(displayBoth.state.displayLanguage,'both');assert.ok(displayBoth.state.game.questions.find(q=>q.ordinal===displayBoth.state.game.question)?.promptAlt);
 await stateAfter(host,'display.language',{language:'primary'});
 const displayPrimary=await display.next(x=>x.type==='state'&&x.state.displayLanguage==='primary');assert.equal(displayPrimary.state.displayLanguage,'primary');
 await stateAfter(host,'display.mode',{mode:'question'});
 const displayQuestion=await display.next(x=>x.type==='state'&&x.state.displayMode==='question');
 assert.equal(displayQuestion.state.displayMode,'question');
 assert.ok(displayQuestion.state.game.questions.find(q=>q.ordinal===displayQuestion.state.game.question)?.prompt);
 await stateAfter(host,'display.mode',{mode:'scores'});
 const displayScores=await display.next(x=>x.type==='state'&&x.state.displayMode==='scores');assert.equal(displayScores.state.displayMode,'scores');
 const selectedHistory=await stateAfter(display,'game.select',{gameId});assert.equal(selectedHistory.state.game.id,gameId);
 display.send({type:'question.next',gameId:nextGame.state.activeGameId,questionId:nextGame.state.game.questions[0].id});
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Display mutation was not rejected')),5000);display.ws.once('close',()=>{clearTimeout(timer);ok()})});
 const wrong=new Client('host','a'.repeat(16));await assert.rejects(wrong.open());close(wrong);
 close(host,secondHost,oversized,display);console.log('Games and shared-question-pool end-to-end feature suite passed');
})().catch(e=>{console.error(e);process.exit(1)});
