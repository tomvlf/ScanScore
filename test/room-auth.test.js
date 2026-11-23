'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync('server.js','utf8');

function application({production=false,trustProxyHops=0}={}){
 const rooms=new Map(),sessions=new Map();let handle;
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
   if(sql.startsWith('INSERT INTO host_sessions')){
    const id='session-'+sessions.size;
    sessions.set(id,{id,room_id:values[0],token_hash:values[1],expires_at:Date.now()+(sql.includes('30 days')?30*24:8)*60*60e3});
    return {rows:[{id,expires_at:new Date(sessions.get(id).expires_at)}],rowCount:1};
   }
   if(sql.includes('FROM host_sessions s JOIN rooms')){
    const session=[...sessions.values()].find(s=>(sql.includes('s.id=$1')?s.id===values[0]:s.token_hash.equals(values[0]))&&!s.revoked_at&&s.expires_at>Date.now());
    const room=session&&[...rooms.values()].find(r=>r.id===session.room_id);
    return {rows:room?[{...room,session_id:session.id,session_expires_at:new Date(session.expires_at)}]:[],rowCount:room?1:0};
   }
   if(sql.startsWith('UPDATE host_sessions SET revoked_at')){
    sessions.get(values[0]).revoked_at=Date.now();return {rows:[],rowCount:1};
   }
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
  process:{env:{DATABASE_URL:'postgresql://test.invalid/test',SECRET_PEPPER:'test-only-pepper',QR_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64'),NODE_ENV:production?'production':'test',TRUST_PROXY_HOPS:String(trustProxyHops)},stdout:{write(){}}},
  setInterval(){return {unref(){}}}
 });
 vm.runInContext(source,context);
 return {
  sessions,
  async request(method,url,body,headers={}){
   const request=new EventEmitter();Object.assign(request,{method,url,headers:{origin:'http://localhost:8080',...headers},socket:{remoteAddress:'test-client'}});
   const response={statusCode:200,headers:{},setHeader(name,value){this.headers[name.toLowerCase()]=value},writeHead(status){this.statusCode=status},end(body){this.body=JSON.parse(body)}};
   const done=handle(request,response);request.emit('data',Buffer.from(JSON.stringify(body)));request.emit('end');await done;
   return response;
  },
  create(body){return this.request('POST','/api/rooms',body)},
  clientIp(headers={},remoteAddress='test-client'){return context.ip({headers,socket:{remoteAddress}})},
  async authenticate(message,cookie){
   const messages=[],socket={clientIp:'test-client',send(data){messages.push(JSON.parse(data))},close(code){this.closed=code}};
   await context.auth(socket,{type:'auth',...message},{socket:{remoteAddress:'test-client'},headers:{cookie}});
   vm.runInContext('wss',context).clients.add(socket);
   return {socket,message:messages[0]};
  },
  act(socket,message){return context.act(socket,message)}
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
 await assert.rejects(app.authenticate({role:'host'},'scorescan_session='+display.message.sessionToken),/session_expired/);
});

test('empty names and invalid passwords cannot create a room',async()=>{
 const app=application();
 for(const body of [{roomName:' ',hostSecret:'a long host password'},{roomName:'Quiz',hostSecret:'short'},{roomName:'Q'.repeat(81),hostSecret:'a long host password'}]){
  assert.equal((await app.create(body)).statusCode,400);
 }
});

test('display signs in with room name/password but cannot mutate room data',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const display=await app.authenticate({role:'display',roomName:' FAMILY QUIZ ',secret:hostSecret});
 assert.equal(display.socket.role,'display');
 assert.equal(display.message.state.title,'Family Quiz');
 assert.ok(!('quizzes' in display.message.state));
 const host=await app.authenticate({role:'host',roomName:'FAMILY QUIZ',secret:hostSecret});
 assert.deepEqual(host.message.state.quizzes,[]);
 await assert.rejects(app.act(display.socket,{type:'player.add',name:'Intruder'}),/forbidden/);
});

test('persistent cookie restores both screens and logout revokes future access',async()=>{
 const app=application({production:true}),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.request('POST','/api/session',{roomName:'family quiz',secret:hostSecret});
 assert.equal(login.statusCode,200);
 const cookie=login.headers['set-cookie'];
 assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=2592000/);
 assert.match(cookie,/; Secure$/);
 assert.ok(!JSON.stringify(login.body).includes(hostSecret));
 assert.ok(!cookie.includes(hostSecret));
 const restored=await app.request('GET','/api/session',{}, {cookie});
 assert.equal(restored.body.roomName,'Family Quiz');
 const sockets=[];
 for(const role of ['host','display']){
  const auth=await app.authenticate({role},cookie);
  sockets.push(auth.socket);
  assert.equal(auth.socket.authed,true);assert.equal(auth.socket.role,role);
  assert.ok(!('sessionToken' in auth.message));
 }
 const logout=await app.request('DELETE','/api/session',{}, {cookie});
 assert.equal(logout.statusCode,200);assert.match(logout.headers['set-cookie'],/Max-Age=0/);
 assert.ok(sockets.every(socket=>socket.closed===4401));
 assert.equal((await app.request('GET','/api/session',{}, {cookie})).statusCode,401);
 await assert.rejects(app.authenticate({role:'host'},cookie),/session_expired/);
});

test('short-lived signed tickets authenticate sockets without a forwarded cookie',async()=>{
 const app=application({production:true}),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.request('POST','/api/session',{roomName:'Family Quiz',secret:hostSecret});
 assert.match(login.body.socketTicket,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
 for(const role of ['host','display']){
  const auth=await app.authenticate({role,socketTicket:login.body.socketTicket},'');
  assert.equal(auth.socket.authed,true);
  assert.equal(auth.socket.role,role);
 }
 const tampered=login.body.socketTicket.slice(0,-1)+(login.body.socketTicket.endsWith('a')?'b':'a');
 await assert.rejects(app.authenticate({role:'host',socketTicket:tampered},''),/session_expired/);
 await app.request('DELETE','/api/session',{}, {cookie:login.headers['set-cookie']});
 await assert.rejects(app.authenticate({role:'host',socketTicket:login.body.socketTicket},''),/session_expired/);
});

test('missing, forged and expired sessions cannot restore access',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.request('POST','/api/session',{roomName:'Family Quiz',secret:hostSecret}),cookie=login.headers['set-cookie'];
 for(const invalid of ['',`scorescan_session=${'a'.repeat(43)}`]){
  assert.equal((await app.request('GET','/api/session',{}, {cookie:invalid})).statusCode,401);
  await assert.rejects(app.authenticate({role:'host'},invalid),/session_expired/);
 }
 for(const session of app.sessions.values())session.expires_at=Date.now()-1;
 assert.equal((await app.request('GET','/api/session',{}, {cookie})).statusCode,401);
 await assert.rejects(app.authenticate({role:'display'},cookie),/session_expired/);
});

test('session login rejects wrong passwords and cross-origin login or logout',async()=>{
 const app=application();
 await app.create({roomName:'Family Quiz',hostSecret:'a long host password'});
 const body={roomName:'Family Quiz',secret:'wrong password'};
 assert.equal((await app.request('POST','/api/session',body)).statusCode,401);
 for(const method of ['POST','DELETE']){
  assert.equal((await app.request(method,'/api/session',body,{origin:'https://evil.example'})).statusCode,403);
 }
 assert.equal(app.sessions.size,0);
});

test('only the configured trusted proxy hops determine the client address',()=>{
 const app=application({trustProxyHops:1});
 assert.equal(app.clientIp({'x-forwarded-for':'198.51.100.9, 203.0.113.12'},'127.0.0.1'),'203.0.113.12');
 assert.equal(app.clientIp({},'127.0.0.1'),'127.0.0.1');
 assert.equal(application({trustProxyHops:0}).clientIp({'x-forwarded-for':'198.51.100.9'},'127.0.0.1'),'127.0.0.1');
});

test('room creation is origin-protected and rate-limited per effective client',async()=>{
 const app=application({trustProxyHops:1}),secret='a long host password';
 const denied=await app.request('POST','/api/rooms',{roomName:'Blocked',hostSecret:secret},{origin:'https://evil.example'});
 assert.equal(denied.statusCode,403);
 for(let i=0;i<5;i++){
  const response=await app.request('POST','/api/rooms',{roomName:`Allowed ${i}`,hostSecret:secret},{'x-forwarded-for':`198.51.100.${i}, 203.0.113.12`});
  assert.equal(response.statusCode,201);
 }
 const throttled=await app.request('POST','/api/rooms',{roomName:'Throttled',hostSecret:secret},{'x-forwarded-for':'192.0.2.1, 203.0.113.12'});
 assert.equal(throttled.statusCode,429);
});
