'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');

const IMAGE='11111111-1111-4111-8111-111111111111',QUIZ='33333333-3333-4333-8333-333333333333';

function application(missingDisplayMode=false){
 const stored=[],quizzes=[],games=[],gameQuestions=[],roomUpdates=[],languageUpdates=[];
 const client={
  async query(sql,values=[]){
   if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql))return {rows:[],rowCount:0};
   if(sql.includes('FROM host_sessions s JOIN rooms'))return {rows:[{id:'room-id',slug:'room-slug',title:'Testruimte',session_id:'session-id'}],rowCount:1};
   if(sql.startsWith('SELECT id FROM quiz_images'))return {rows:(values[1]||[]).filter(id=>id===IMAGE).map(id=>({id})),rowCount:1};
   if(sql.startsWith('SELECT * FROM rooms WHERE id=$1 FOR UPDATE'))return {rows:[{id:'room-id',slug:'room-slug',title:'Testruimte'}],rowCount:1};
   if(sql.startsWith('SELECT 1 FROM games WHERE room_id'))return {rows:[],rowCount:0};
   if(sql.startsWith('SELECT id,title,language_primary,language_secondary FROM quizzes'))return {rows:[{id:QUIZ,title:'Filmavond',language_primary:'Nederlands',language_secondary:'English'}],rowCount:1};
   if(sql.startsWith('SELECT prompt,prompt_alt,points,image_id FROM quiz_questions'))return {rows:stored.map(row=>({prompt:row[2],prompt_alt:row[3],points:row[4],image_id:row[5]})),rowCount:stored.length};
   if(sql.startsWith('INSERT INTO games')){games.push(values);return {rows:[{id:'game-id'}],rowCount:1}};
   if(sql.startsWith('INSERT INTO game_questions')){gameQuestions.push(values);return {rows:[],rowCount:1}};
   if(sql.startsWith('INSERT INTO quizzes')){const id=QUIZ;quizzes.push({id,values});return {rows:[{id}],rowCount:1}}
   if(sql.startsWith('UPDATE quizzes'))return {rows:[{id:values[4]}],rowCount:1};
   if(sql.startsWith('DELETE FROM quiz_questions')){stored.length=0;return {rows:[],rowCount:1}}
   if(sql.startsWith('INSERT INTO quiz_questions')){stored.push(values);return {rows:[],rowCount:1}}
   if(sql.startsWith('UPDATE rooms SET display_mode')){if(missingDisplayMode)throw Object.assign(Error('column display_mode does not exist'),{code:'42703'});roomUpdates.push(values[0]);return {rows:[],rowCount:1}}
   if(sql.startsWith('UPDATE rooms SET display_language')){languageUpdates.push(values[0]);return {rows:[],rowCount:1}}
   if(sql.startsWith('UPDATE rooms'))return {rows:[],rowCount:1};
   if(sql.startsWith('INSERT INTO audit_events'))return {rows:[],rowCount:1};
   return {rows:[],rowCount:0};
  },
  release(){}
 };
 class Pool{on(){}async connect(){return client}}
 class WebSocketServer extends EventEmitter{constructor(){super();this.clients=new Set()}}
 const context=vm.createContext({
  require(name){
   if(name==='pg')return {Pool};
   if(name==='ws')return {WebSocketServer};
   if(name==='http')return {createServer(){const server=new EventEmitter();server.listen=()=>{};return server}};
   return require(name);
  },
  __dirname:process.cwd(),Buffer,URL,
  process:{env:{DATABASE_URL:'postgresql://test.invalid/test',SECRET_PEPPER:'test-only-pepper',QR_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64'),ALLOWED_ORIGINS:'https://quiz.example.test'},stdout:{write(){}}},
  setInterval(){return {unref(){}}}
 });
 vm.runInContext(fs.readFileSync('server.js','utf8'),context);
 return {context,stored,quizzes,games,gameQuestions,roomUpdates,languageUpdates};
}

function request(body){
 const req=new EventEmitter();
 Object.assign(req,{method:'POST',url:'/api/quizzes',headers:{origin:'https://quiz.example.test',cookie:'scorescan_session='+'a'.repeat(43),'content-type':'application/json'},socket:{remoteAddress:'test-client'}});
 const res={statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k.toLowerCase()]=v},writeHead(status){this.statusCode=status},end(body=''){this.body=String(body)}};
 return {req,res,body};
}

async function save(app,body){
 const {req,res}=request(body);
 const done=app.context.quizSave(req,res,'request-id');
 await new Promise(resolve=>setTimeout(resolve,20));
 req.emit('data',Buffer.from(JSON.stringify(body)));
 req.emit('end');
 await done;
 return {status:res.statusCode,body:JSON.parse(res.body||'{}')};
}

test('quiz save stores ordered questions and validates image ownership',async()=>{
 const app=application();
 const body={title:'Filmavond',languagePrimary:'Nederlands',languageSecondary:'English',questions:[
  {prompt:'Eerste vraag?',promptAlt:'First question?',points:25,imageId:IMAGE},
  {prompt:'Tweede vraag?',points:75,imageId:IMAGE}
 ]};
 const created=await save(app,body);
 assert.equal(created.status,201);
 assert.equal(created.body.quizId,QUIZ);
 assert.equal(JSON.stringify(app.stored.map(row=>row.slice(1))),JSON.stringify([
  [1,'Eerste vraag?','First question?',25,IMAGE],
  [2,'Tweede vraag?',null,75,IMAGE]
 ]));
 const duplicate=await save(app,{title:'Andere quiz',questions:[{prompt:'Vraag?',points:10,imageId:'22222222-2222-4222-8222-222222222222'}]});
 assert.equal(duplicate.status,400);
 assert.equal(duplicate.body.error,'invalid_image');
 const messages=[];
 const socket={room:{id:'room-id',slug:'room-slug'},role:'host',session:'session-id',req:{headers:{},socket:{remoteAddress:'test-client'}},readyState:1,send(message){messages.push(JSON.parse(message))}};
 await app.context.act(socket,{type:'game.start',quizId:QUIZ});
 assert.equal(socket.gameId,'game-id',JSON.stringify(messages));
 assert.equal(JSON.stringify(app.games),JSON.stringify([['room-id',25,QUIZ,'Filmavond','Nederlands','English',2]]));
 assert.equal(JSON.stringify(app.gameQuestions),JSON.stringify([
  ['game-id',1,25,'Vraag 1','Eerste vraag?','First question?',IMAGE],
  ['game-id',2,75,'Vraag 2','Tweede vraag?',null,IMAGE]
 ]));
});

test('display mode is a room setting controlled by the quizmaster',async()=>{
 const app=application(),messages=[];
 const socket={room:{id:'room-id',slug:'room-slug'},role:'host',session:'session-id',req:{headers:{},socket:{remoteAddress:'test-client'}},readyState:1,send(message){messages.push(JSON.parse(message))}};
 await app.context.act(socket,{type:'display.mode',mode:'question'});
 assert.equal(app.roomUpdates.at(-1),'question');
 messages.length=0;
 await app.context.act(socket,{type:'display.mode',mode:'invalid'});
 assert.equal(messages[0].type,'error');
 assert.equal(messages[0].reason,'mode');
});

test('display mode still works when the database column is not installed yet',async()=>{
 const app=application(true),messages=[];
 const socket={room:{id:'room-id',slug:'room-slug'},role:'host',session:'session-id',req:{headers:{},socket:{remoteAddress:'test-client'}},readyState:1,send(message){messages.push(JSON.parse(message))}};
 await app.context.act(socket,{type:'display.mode',mode:'question'});
 assert.equal(messages.length,0);
 assert.equal(app.roomUpdates.length,0);
 assert.equal(vm.runInContext('displayModes.get("room-id")',app.context),'question');
});

test('display language is a room setting controlled by the quizmaster',async()=>{
 const app=application(),messages=[];
 const socket={room:{id:'room-id',slug:'room-slug'},role:'host',session:'session-id',req:{headers:{},socket:{remoteAddress:'test-client'}},readyState:1,send(message){messages.push(JSON.parse(message))}};
 await app.context.act(socket,{type:'display.language',language:'secondary'});
 assert.equal(app.languageUpdates.at(-1),'secondary');
 messages.length=0;
 await app.context.act(socket,{type:'display.language',language:'invalid'});
 assert.equal(messages[0].type,'error');
 assert.equal(messages[0].reason,'language');
});
