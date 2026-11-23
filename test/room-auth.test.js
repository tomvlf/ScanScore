'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const source=fs.readFileSync('server.js','utf8');

function application({production=false,trustProxyHops=0}={}){
 const rooms=new Map(),sessions=new Map(),tickets=new Map(),attempts=new Map();let handle;
 const client={
  async query(sql,values=[]){
   if(sql.startsWith('INSERT INTO rooms')){
    const [slug,title,hash]=values,login_name=title.toLowerCase();
    if(rooms.has(login_name))throw Object.assign(Error('duplicate'),{code:'23505'});
    const room={id:'database-room-id',slug,title,login_name,host_secret_hash:hash};
    rooms.set(login_name,room);return {rows:[room],rowCount:1};
   }
   if(sql.startsWith('SELECT * FROM rooms')){
    const room=sql.includes('WHERE id=$1')?[...rooms.values()].find(r=>r.id===values[0]):sql.includes('login_name')?rooms.get(values[0].toLowerCase()):[...rooms.values()].find(r=>r.slug===values[0]);
    return {rows:room?[room]:[],rowCount:room?1:0};
   }
   if(sql.startsWith('UPDATE rooms SET host_secret_hash')){
    const room=[...rooms.values()].find(r=>r.id===values[1]);room.host_secret_hash=values[0];return {rows:[],rowCount:1};
   }
   if(sql.startsWith('INSERT INTO host_sessions')){
    const id='session-'+sessions.size;
    const role=values.length===3?'host':values[2];
    sessions.set(id,{id,room_id:values[0],token_hash:values[1],role,expires_at:Date.now()+values.at(-1)*1000});
    return {rows:[{id,expires_at:new Date(sessions.get(id).expires_at)}],rowCount:1};
   }
   if(sql.startsWith('INSERT INTO login_attempts')){
    const rows=[];
    for(const value of values[0]){
     const hash=value.toString('hex'),entry=attempts.get(hash);
     const attemptsForKey=entry&&entry.expires_at>Date.now()?entry.attempts+1:1;
     attempts.set(hash,{attempts:attemptsForKey,expires_at:entry&&entry.expires_at>Date.now()?entry.expires_at:Date.now()+15*60e3});
     rows.push({key_hash:value,attempts:attemptsForKey});
    }
    return {rows,rowCount:rows.length};
   }
   if(sql.startsWith('INSERT INTO socket_tickets')){
    tickets.set(values[1].toString('hex'),{session_id:values[0],role:values[2],expires_at:Date.now()+30000});
    return {rows:[],rowCount:1};
   }
   if(sql.startsWith('WITH claimed AS')){
    const key=values[0].toString('hex'),ticket=tickets.get(key);
    if(ticket&&ticket.role===values[1])tickets.delete(key);
    const session=ticket?.role===values[1]&&ticket.expires_at>Date.now()&&sessions.get(ticket.session_id);
    const roleMatches=session?.role===values[1];
    const room=session&&[...rooms.values()].find(r=>r.id===session.room_id);
    const active=roleMatches&&session&&!session.revoked_at&&session.expires_at>Date.now();
    return {rows:room&&active?[{...room,session_id:session.id,session_expires_at:new Date(session.expires_at)}]:[],rowCount:room&&active?1:0};
   }
   if(sql.includes('FROM host_sessions s JOIN rooms')){
    const session=[...sessions.values()].find(s=>(sql.includes('s.id=$1')?s.id===values[0]:s.token_hash.equals(values[0]))&&(values[1]==null||s.role===values[1])&&!s.revoked_at&&s.expires_at>Date.now());
    const room=session&&[...rooms.values()].find(r=>r.id===session.room_id);
    return {rows:room?[{...room,session_id:session.id,session_expires_at:new Date(session.expires_at)}]:[],rowCount:room?1:0};
   }
   if(sql.startsWith('UPDATE host_sessions SET revoked_at')){
    if(sql.includes('WHERE id IN'))return {rows:[],rowCount:0};
    for(const session of sessions.values())if(session.id===values[0]||session.room_id===values[0])session.revoked_at=Date.now();
    return {rows:[],rowCount:1};
   }
   if(sql.startsWith('DELETE FROM socket_tickets WHERE session_id IN')){
    for(const [hash,ticket] of tickets)if([...sessions.values()].some(session=>session.id===ticket.session_id&&session.room_id===values[0]))tickets.delete(hash);
    return {rows:[],rowCount:1};
   }
   if(sql.startsWith('DELETE FROM socket_tickets WHERE session_id')){
    for(const [hash,ticket] of tickets)if(ticket.session_id===values[0])tickets.delete(hash);
    return {rows:[],rowCount:1};
   }
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
  tickets,
  attempts,
  async request(method,url,body,headers={}){
   const request=new EventEmitter();Object.assign(request,{method,url,headers:{origin:'http://localhost:8080',...headers},socket:{remoteAddress:'test-client'}});
   const response={statusCode:200,headers:{},setHeader(name,value){this.headers[name.toLowerCase()]=value},writeHead(status){this.statusCode=status},end(body){this.body=JSON.parse(body)}};
   const done=handle(request,response);request.emit('data',Buffer.from(JSON.stringify(body)));request.emit('end');await done;
   return response;
  },
  create(body){return this.request('POST','/api/rooms',body)},
  async signIn(roomName,secret,role='host'){
   return this.request('POST','/api/session?role='+role,{roomName,secret});
  },
  rotatePassword(roomName,currentPassword,newPassword,cookie){
   return this.request('POST','/api/session/password',{roomName,currentPassword,newPassword},{cookie,origin:'http://localhost:8080'});
  },
  revokeAll(cookie){
   return this.request('DELETE','/api/session/all',{}, {cookie,origin:'http://localhost:8080'});
  },
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
 const login=await app.signIn(' FAMILY QUIZ ',hostSecret,'host');
 const auth=await app.authenticate({role:'host',socketTicket:login.body.socketTicket});
 assert.equal(auth.socket.authed,true);
 assert.equal(auth.message.roomId,created.body.roomId);
 assert.equal(auth.message.state.title,'Family Quiz');
 const duplicate=await app.create({roomName:'family quiz',hostSecret});
 assert.equal(duplicate.statusCode,409);
});

test('generated room IDs and arbitrary tokens cannot authenticate a host',async()=>{
 const app=application(),hostSecret='a long host password';
 const created=await app.create({roomName:'Family Quiz',hostSecret});
 assert.ok(!('displayToken' in created.body));
 await assert.rejects(app.authenticate({role:'host',roomId:created.body.roomId,secret:hostSecret}),/session_expired/);
 await assert.rejects(app.authenticate({role:'host',socketTicket:'a'.repeat(43)}),/session_expired/);
 assert.equal((await app.signIn('Family Quiz','a'.repeat(15),'host')).statusCode,400);
 assert.equal((await app.signIn('Family Quiz','violet orchard rain 47!','host')).statusCode,401);
});

test('empty names and invalid passwords cannot create a room',async()=>{
 const app=application();
 for(const body of [
  {roomName:' ',hostSecret:'a long host password'},
  {roomName:'Quiz',hostSecret:'short-password'},
  {roomName:'Quiz',hostSecret:'passwordpassword'},
  {roomName:'Quiz',hostSecret:'1234567890123456'},
  {roomName:'Family Quiz',hostSecret:'My Family Quiz password!'},
  {roomName:'Q'.repeat(81),hostSecret:'a long host password'}
 ]){
  const response=await app.create(body);
  assert.equal(response.statusCode,400);
  if(body.roomName.trim()==='Quiz'||body.roomName==='Family Quiz')assert.equal(response.body.error,'weak_password');
 }
});

test('display signs in with room name/password but cannot mutate room data',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const displayLogin=await app.signIn(' FAMILY QUIZ ',hostSecret,'display');
 const display=await app.authenticate({role:'display',socketTicket:displayLogin.body.socketTicket});
 assert.equal(display.socket.role,'display');
 assert.equal(display.message.state.title,'Family Quiz');
 assert.ok(!('quizzes' in display.message.state));
 const hostLogin=await app.signIn('FAMILY QUIZ',hostSecret,'host');
 const host=await app.authenticate({role:'host',socketTicket:hostLogin.body.socketTicket});
 assert.deepEqual(host.message.state.quizzes,[]);
 await assert.rejects(app.act(display.socket,{type:'player.add',name:'Intruder'}),/forbidden/);
});

test('persistent cookie restores both screens and logout revokes future access',async()=>{
 const app=application({production:true}),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.signIn('family quiz',hostSecret,'host');
 assert.equal(login.statusCode,200);
 const cookie=login.headers['set-cookie'];
 assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=86400/);
 assert.match(cookie,/; Secure$/);
 assert.ok(!JSON.stringify(login.body).includes(hostSecret));
 assert.ok(!cookie.includes(hostSecret));
 const restored=await app.request('GET','/api/session?role=host',{}, {cookie});
 assert.equal(restored.body.roomName,'Family Quiz');
 const displayLogin=await app.signIn('family quiz',hostSecret,'display'),displayCookie=displayLogin.headers['set-cookie'];
 assert.equal((await app.request('GET','/api/session?role=host',{}, {cookie:displayCookie})).statusCode,401);
 assert.equal((await app.request('POST','/api/images',Buffer.from('bad'),{cookie:displayCookie,origin:'http://localhost:8080','content-type':'image/png'})).statusCode,401);
 const sockets=[];
 for(const [role,sessionCookie] of [['host',cookie],['display',displayCookie]]){
  const ticketed=await app.request('GET','/api/session?role='+role,{}, {cookie:sessionCookie});
  const auth=await app.authenticate({role,socketTicket:ticketed.body.socketTicket});
  sockets.push(auth.socket);
  assert.equal(auth.socket.authed,true);assert.equal(auth.socket.role,role);
  assert.ok(!('sessionToken' in auth.message));
 }
 const logout=await app.request('DELETE','/api/session',{}, {cookie});
 assert.equal(logout.statusCode,200);assert.match(logout.headers['set-cookie'],/Max-Age=0/);
 assert.equal(sockets[0].closed,4401);
 assert.equal(sockets[1].closed,undefined);
 assert.equal((await app.request('GET','/api/session?role=host',{}, {cookie})).statusCode,401);
 await assert.rejects(app.authenticate({role:'host'}),/session_expired/);
 await app.request('DELETE','/api/session',{}, {cookie:displayCookie});
 assert.equal(sockets[1].closed,4401);
});

test('host and display sessions use the 24-hour lifetime',async()=>{
 const app=application({production:true}),secret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret:secret});
 for(const role of ['host','display']){
  const before=Date.now(),login=await app.signIn('Family Quiz',secret,role);
  assert.equal(login.statusCode,200);
  assert.match(login.headers['set-cookie'],/Max-Age=86400/);
  const session=[...app.sessions.values()].at(-1);
  assert.equal(session.role,role);
  assert.ok(session.expires_at>=before+24*60*60e3);
  assert.ok(session.expires_at<=Date.now()+24*60*60e3);
 }
});

test('one-time opaque tickets authenticate sockets without a forwarded cookie',async()=>{
 const app=application({production:true}),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.signIn('Family Quiz',hostSecret,'host');
 assert.match(login.body.socketTicket,/^[A-Za-z0-9_-]{43}$/);
 const host=await app.authenticate({role:'host',socketTicket:login.body.socketTicket},'');
 assert.equal(host.socket.authed,true);
 await assert.rejects(app.authenticate({role:'host',socketTicket:login.body.socketTicket},''),/session_expired/);
 const displayLogin=await app.signIn('Family Quiz',hostSecret,'display');
 const restored=await app.request('GET','/api/session?role=display',{}, {cookie:displayLogin.headers['set-cookie']});
 const display=await app.authenticate({role:'display',socketTicket:restored.body.socketTicket},'');
 assert.equal(display.socket.authed,true);
 await assert.rejects(app.authenticate({role:'host',socketTicket:restored.body.socketTicket},''),/session_expired/);
 const tampered=login.body.socketTicket.slice(0,-1)+(login.body.socketTicket.endsWith('a')?'b':'a');
 await assert.rejects(app.authenticate({role:'host',socketTicket:tampered},''),/session_expired/);
 const expired=await app.request('GET','/api/session?role=host',{}, {cookie:login.headers['set-cookie']});
 for(const ticket of app.tickets.values())ticket.expires_at=Date.now()-1;
 await assert.rejects(app.authenticate({role:'host',socketTicket:expired.body.socketTicket},''),/session_expired/);
 const beforeLogout=await app.request('GET','/api/session?role=host',{}, {cookie:login.headers['set-cookie']});
 await app.request('DELETE','/api/session',{}, {cookie:login.headers['set-cookie']});
 await assert.rejects(app.authenticate({role:'host',socketTicket:beforeLogout.body.socketTicket},''),/session_expired/);
});

test('missing, forged and expired sessions cannot restore access',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const login=await app.signIn('Family Quiz',hostSecret,'host'),cookie=login.headers['set-cookie'];
 for(const invalid of ['',`scorescan_session=${'a'.repeat(43)}`]){
  assert.equal((await app.request('GET','/api/session?role=host',{}, {cookie:invalid})).statusCode,401);
  await assert.rejects(app.authenticate({role:'host'}),/session_expired/);
 }
 for(const session of app.sessions.values())session.expires_at=Date.now()-1;
 assert.equal((await app.request('GET','/api/session?role=display',{}, {cookie})).statusCode,401);
 await assert.rejects(app.authenticate({role:'display'}),/session_expired/);
});

test('session login rejects wrong passwords and cross-origin login or logout',async()=>{
 const app=application();
 await app.create({roomName:'Family Quiz',hostSecret:'a long host password'});
 const body={roomName:'Family Quiz',secret:'wrong password xx'};
 assert.equal((await app.request('POST','/api/session?role=host',body)).statusCode,401);
 for(const method of ['POST','DELETE']){
  assert.equal((await app.request(method,'/api/session?role=host',body,{origin:'https://evil.example'})).statusCode,403);
 }
 assert.equal(app.sessions.size,0);
});

test('database login limits throttle brute force attempts independently of socket limits',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 for(let i=0;i<8;i++)assert.equal((await app.signIn('Family Quiz','incorrect password','host')).statusCode,401);
 assert.equal((await app.signIn('Family Quiz','incorrect password','host')).statusCode,429);
 assert.ok([...app.attempts.values()].some(entry=>entry.attempts>=8));
});

test('password rotation revokes every room session and issues a fresh host session',async()=>{
 const app=application(),oldPassword='a long host password',newPassword='violet orchard rain 47!';
 await app.create({roomName:'Family Quiz',hostSecret:oldPassword});
 const host=await app.signIn('Family Quiz',oldPassword,'host'),display=await app.signIn('Family Quiz',oldPassword,'display');
 const before=Date.now(),changed=await app.rotatePassword('Family Quiz',oldPassword,newPassword,host.headers['set-cookie']);
 assert.equal(changed.statusCode,200);
 assert.match(changed.headers['set-cookie'],/scorescan_session=/);
 assert.match(changed.headers['set-cookie'],/Max-Age=86400/);
 const freshSession=[...app.sessions.values()].at(-1);
 assert.equal(freshSession.role,'host');
 assert.ok(freshSession.expires_at>=before+24*60*60e3);
 assert.ok(freshSession.expires_at<=Date.now()+24*60*60e3);
 assert.equal((await app.request('GET','/api/session?role=host',{}, {cookie:host.headers['set-cookie']})).statusCode,401);
 assert.equal((await app.request('GET','/api/session?role=display',{}, {cookie:display.headers['set-cookie']})).statusCode,401);
 assert.equal((await app.signIn('Family Quiz',oldPassword,'host')).statusCode,401);
 assert.equal((await app.signIn('Family Quiz',newPassword,'host')).statusCode,200);
});

test('all-sessions logout revokes host and display sessions for the room',async()=>{
 const app=application(),hostSecret='a long host password';
 await app.create({roomName:'Family Quiz',hostSecret});
 const host=await app.signIn('Family Quiz',hostSecret,'host'),display=await app.signIn('Family Quiz',hostSecret,'display');
 const revoked=await app.revokeAll(host.headers['set-cookie']);
 assert.equal(revoked.statusCode,200);
 assert.equal((await app.request('GET','/api/session?role=host',{}, {cookie:host.headers['set-cookie']})).statusCode,401);
 assert.equal((await app.request('GET','/api/session?role=display',{}, {cookie:display.headers['set-cookie']})).statusCode,401);
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
