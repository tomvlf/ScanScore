'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),WebSocket=require('ws');
const APP=(process.env.APP_URL||'http://app:8080').replace(/\/$/,''),ORIGIN=process.env.PUBLIC_ORIGIN||'https://quiz.example.test';
const room=`e2e-${crypto.randomBytes(5).toString('hex')}`,hostSecret='correct horse battery staple';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Client{constructor(role,secret){this.role=role;this.secret=secret;this.queue=[];this.waiters=[]}async open(){const url=APP.replace(/^http/,'ws')+'/ws';this.ws=new WebSocket(url,{headers:{Origin:ORIGIN}});this.ws.on('message',b=>this.push(JSON.parse(b)));this.ws.on('close',()=>{for(const w of this.waiters){clearTimeout(w.t);w.no(Error('WebSocket closed'))}this.waiters=[]});await new Promise((ok,no)=>{this.ws.once('open',ok);this.ws.once('error',no)});this.send({type:'auth',roomId:room,role:this.role,secret:this.secret});return this.next(x=>x.type==='auth.ok')}push(m){const i=this.waiters.findIndex(w=>w.pred(m));if(i>=0){const w=this.waiters.splice(i,1)[0];clearTimeout(w.t);w.ok(m)}else this.queue.push(m)}next(pred,timeout=7000){const i=this.queue.findIndex(pred);if(i>=0)return Promise.resolve(this.queue.splice(i,1)[0]);return new Promise((ok,no)=>{const w={pred,ok,no,t:setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);no(Error('Timed out waiting for message'))},timeout)};this.waiters.push(w)})}send(m){this.ws.send(JSON.stringify(m))}close(){this.ws?.close()}}
async function stateAfter(c,type,payload={}){c.send({type,...payload});return c.next(x=>x.type==='state')}
async function scan(c,code,key=crypto.randomUUID()){c.send({type:'scan.award',code,idempotencyKey:key});return c.next(x=>x.type==='scan.result'||x.type==='error')}
function score(state,name){const p=state.players.find(x=>x.name===name);return p?Object.values(p.scores).reduce((a,b)=>a+Number(b),0):0}
(async()=>{for(let i=0;i<40;i++){try{if((await fetch(APP+'/readyz')).ok)break}catch{}await wait(500)}
 let page=await fetch(APP+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy')||'',/default-src/);assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 let scoreboard=await fetch(APP+'/scoreboard.html');assert.equal(scoreboard.status,200);
 let missingPage=await fetch(APP+'/does-not-exist');assert.equal(missingPage.status,404);
 let invalid=await fetch(APP+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:'x',title:'',hostSecret:'short'})});assert.equal(invalid.status,400);
 await new Promise((ok,no)=>{const bad=new WebSocket(APP.replace(/^http/,'ws')+'/ws',{headers:{Origin:'https://evil.example'}});bad.once('unexpected-response',(_req,res)=>{assert.equal(res.statusCode,403);ok()});bad.once('open',()=>no(Error('Forbidden origin connected')));bad.once('error',e=>{if(!String(e.message).includes('403'))no(e)})});
 let r=await fetch(APP+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:room,title:'E2E Quiz',hostSecret})});assert.equal(r.status,201);const created=await r.json();assert.ok(created.displayToken);
 r=await fetch(APP+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:room,title:'Duplicate',hostSecret})});assert.equal(r.status,409);
 const idle=new WebSocket(APP.replace(/^http/,'ws')+'/ws',{headers:{Origin:ORIGIN}});await new Promise((ok,no)=>{idle.once('open',ok);idle.once('error',no)});await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('Authentication timeout missing')),7000);idle.once('close',code=>{clearTimeout(t);assert.equal(code,4401);ok()})});
 const oversized=new Client('host',hostSecret);await oversized.open();oversized.ws.send(JSON.stringify({type:'unknown',data:'x'.repeat(20000)}));await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('Oversized message was not closed')),5000);oversized.ws.once('close',()=>{clearTimeout(t);ok()})});
 const host=new Client('host',hostSecret),auth=await host.open();assert.equal(auth.state.title,'E2E Quiz');assert.equal(auth.state.rounds.length,1);
 let st=await stateAfter(host,'player.add',{name:'Alice',playerType:'person',code:'qr-alice'});assert.equal(st.state.players.length,1);
 st=await stateAfter(host,'player.add',{name:'Team Bravo',playerType:'team',code:'qr-bravo'});assert.equal(st.state.players.length,2);
 st=await stateAfter(host,'player.add',{name:'Charlie',playerType:'person',code:'qr-charlie'});assert.equal(st.state.players.length,3);
 host.send({type:'player.add',name:'',playerType:'person',code:'qr-invalid'});assert.equal((await host.next(x=>x.type==='error')).code,'action_rejected');
 host.send({type:'player.add',name:'Duplicate',playerType:'person',code:'qr-alice'});assert.equal((await host.next(x=>x.type==='error')).code,'action_rejected');
 let result=await scan(host,'missing');assert.equal(result.code,'unknown');
 result=await scan(host,'qr-alice');assert.equal(result.ok,true);assert.equal(result.points,1);st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),1);
 result=await scan(host,'qr-alice');assert.equal(result.code,'duplicate');
 st=await stateAfter(host,'award.undo');assert.equal(score(st.state,'Alice'),0);
 st=await stateAfter(host,'question.next');assert.equal(st.state.question,2);
 st=await stateAfter(host,'context.set',{roundId:st.state.activeRoundId,question:2,mode:'places',fixedPoints:1,placePoints:[5,3],oncePerQuestion:true});assert.equal(st.state.mode,'places');
 result=await scan(host,'qr-alice');assert.equal(result.points,5);await host.next(x=>x.type==='state');result=await scan(host,'qr-bravo');assert.equal(result.points,3);st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),5);assert.equal(score(st.state,'Team Bravo'),3);
 result=await scan(host,'qr-charlie');assert.equal(result.code,'no_more_places');
 st=await stateAfter(host,'round.add',{name:'Finale'});assert.equal(st.state.rounds.length,2);assert.equal(st.state.question,1);assert.equal(st.state.rounds.find(x=>x.id===st.state.activeRoundId).name,'Finale');
 st=await stateAfter(host,'context.set',{roundId:st.state.activeRoundId,question:1,mode:'fixed',fixedPoints:2,placePoints:[5,3],oncePerQuestion:false});const idem=crypto.randomUUID();result=await scan(host,'qr-alice',idem);assert.equal(result.points,2);st=await host.next(x=>x.type==='state');assert.equal(score(st.state,'Alice'),7);result=await scan(host,'qr-alice',idem);assert.equal(result.code,'action_rejected');
 const display=new Client('display',created.displayToken),displayAuth=await display.open();assert.equal(displayAuth.state.players.length,3);display.send({type:'question.next'});await new Promise(ok=>display.ws.once('close',ok));
 const wrong=new Client('host','definitely wrong password');let rejected=false;try{await wrong.open()}catch{rejected=true}assert.equal(rejected,true);wrong.close();host.close();display.close();console.log('Functional end-to-end feature suite passed');
})().catch(e=>{console.error(e);process.exit(1)});
