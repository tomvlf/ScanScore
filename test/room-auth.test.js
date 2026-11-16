'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync('server.js','utf8');

function application(){
 const rooms=new Map();let handle;
 const client={
  async query(sql,values=[]){
   if(sql.startsWith('INSERT INTO rooms')){
    const [slug,title,hash]=values,login_name=title.toLowerCase();
    if(rooms.has(login_name))throw Object.assign(Error('duplicate'),{code:'23505'});
    const room={id:'database-room-id',slug,title,login_name,host_secret_hash:hash};
    rooms.set(login_name,room);return {rows:[room],rowCount:1};
   }
   if(sql.startsWith('SELECT * FROM rooms')){
    const room=sql.includes('login_name')?rooms.get(values[0].toLowerCase()):[...rooms.values()].find(r=>r.slug===values[0]);
    return {rows:room?[room]:[],rowCount:room?1:0};
   }
   if(sql.startsWith('INSERT INTO rounds')||sql.startsWith('INSERT INTO host_sessions'))return {rows:[{id:'generated-record-id'}],rowCount:1};
   if(sql.startsWith('SELECT 1 FROM display_tokens'))return {rows:[{}],rowCount:1};
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
   if(name==='http')return {createServer(listener){handle=listener;const server=new EventEmitter();server.listen=()=>{};return server}};
   return require(name);
  },
  __dirname:process.cwd(),Buffer,
  process:{env:{DATABASE_URL:'postgresql://test.invalid/test',SECRET_PEPPER:'test-only-pepper',QR_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')},stdout:{write(){}}},
  setInterval(){return {unref(){}}}
 });
 vm.runInContext(source,context);
 return {
  async create(body){
   const request=new EventEmitter();Object.assign(request,{method:'POST',url:'/api/rooms',headers:{},socket:{remoteAddress:'test-client'}});
   const response={statusCode:200,setHeader(){},writeHead(status){this.statusCode=status},end(body){this.body=JSON.parse(body)}};
   const done=handle(request,response);request.emit('data',Buffer.from(JSON.stringify(body)));request.emit('end');await done;
   return response;
  },
  async authenticate(message){
   const messages=[],socket={clientIp:'test-client',send(data){messages.push(JSON.parse(data))}};
   await context.auth(socket,message,{socket:{remoteAddress:'test-client'},headers:{}});
   return {socket,message:messages[0]};
  }
 };
}

test('room creation accepts a name and password and returning hosts use that name',async()=>{
 const app=application(),hostSecret='a long host password';
 const created=await app.create({roomName:'  Family Quiz  ',hostSecret});
 assert.equal(created.statusCode,201);
 assert.match(created.body.roomId,/^[a-f0-9-]{36}$/);
 const auth=await app.authenticate({role:'host',roomName:' FAMILY QUIZ ',secret:hostSecret});
 assert.equal(auth.socket.authed,true);
 assert.equal(auth.message.roomId,created.body.roomId);
 assert.equal(auth.message.state.title,'Family Quiz');
 const duplicate=await app.create({roomName:'family quiz',hostSecret});
 assert.equal(duplicate.statusCode,409);
});

test('generated room IDs and display tokens cannot authenticate a host',async()=>{
 const app=application(),hostSecret='a long host password';
 const created=await app.create({roomName:'Family Quiz',hostSecret});
 await assert.rejects(app.authenticate({role:'host',roomId:created.body.roomId,secret:hostSecret}),/auth/);
 await assert.rejects(app.authenticate({role:'host',roomName:created.body.roomId,secret:hostSecret}),/denied/);
 await assert.rejects(app.authenticate({role:'host',roomName:'Family Quiz',secret:created.body.displayToken}),/denied/);
 const display=await app.authenticate({role:'display',roomId:created.body.roomId,secret:created.body.displayToken});
 assert.equal(display.socket.role,'display');
});

test('empty names and invalid passwords cannot create a room',async()=>{
 const app=application();
 for(const body of [{roomName:' ',hostSecret:'a long host password'},{roomName:'Quiz',hostSecret:'short'},{roomName:'Q'.repeat(81),hostSecret:'a long host password'}]){
  assert.equal((await app.create(body)).statusCode,400);
 }
});
