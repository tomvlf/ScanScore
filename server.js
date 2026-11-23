'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{URL}=require('url'),{Pool}=require('pg'),{WebSocketServer}=require('ws');
function secret(fileEnv,valueEnv){const file=process.env[fileEnv];if(file)return fs.readFileSync(file,'utf8').trim();return process.env[valueEnv]}
const DATABASE_URL=secret('DATABASE_URL_FILE','DATABASE_URL'),PEPPER=secret('SECRET_PEPPER_FILE','SECRET_PEPPER'),QR_SECRET=secret('QR_ENCRYPTION_KEY_FILE','QR_ENCRYPTION_KEY');
const PORT=+(process.env.PORT||8080),PUBLIC=path.join(__dirname,'public'),ORIGINS=(process.env.ALLOWED_ORIGINS||'http://localhost:8080').split(',').map(s=>s.trim()).filter(Boolean),QR_KEY=Buffer.from(QR_SECRET||'','base64'),TRUST_PROXY_HOPS=proxyHops();if(!DATABASE_URL||!PEPPER||QR_KEY.length!==32)throw new Error('Database URL, secret pepper and 32-byte QR encryption key are required');
const SESSION_TTL_SECONDS=24*60*60,LOGIN_CLIENT_LIMIT=8,LOGIN_ROOM_LIMIT=30;
const db=new Pool({connectionString:DATABASE_URL,max:+process.env.DB_POOL_MAX||10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,ssl:process.env.DB_SSL==='1'?{rejectUnauthorized:true,ca:process.env.DB_CA}:false,application_name:'scorescan-v1'});db.on('error',e=>log('critical','db_pool_error',{message:e.message}));
const ipBuckets=new Map(),authBuckets=new Map(),connections=new Map(),imageBuckets=new Map(),quizBuckets=new Map(),hashQueue=[];let hashActive=false;
const b64=n=>crypto.randomBytes(n).toString('base64url'),safeEq=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(a,b);function hmac(x){return crypto.createHmac('sha256',PEPPER).update(x).digest()}
function proxyHops(){const raw=process.env.TRUST_PROXY_HOPS??(process.env.TRUST_PROXY==='1'?'1':'0'),value=Number(raw);return Number.isInteger(value)&&value>=0&&value<=8?value:0}
function drainHashes(){
 if(hashActive||!hashQueue.length)return;hashActive=true;const job=hashQueue.shift();
 crypto.scrypt(job.secret+PEPPER,job.salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>{hashActive=false;if(error)job.reject(error);else job.resolve(key.toString('base64'));drainHashes()});
}
function scrypt(secret,salt){return new Promise((resolve,reject)=>{if(hashQueue.length>=8){const error=Error('hash queue full');error.code='RESOURCE_BUSY';reject(error);return}hashQueue.push({secret,salt,resolve,reject});drainHashes()})}
async function passHash(secret,roomName){if(!strongPassword(secret,roomName))throw Object.assign(Error('weak_password'),{status:400});const salt=b64(16);return `scrypt$${salt}$${await scrypt(secret,salt)}`}
async function passOk(secret,hash){try{const[,salt,expected]=hash.split('$');return safeEq(Buffer.from(await scrypt(secret,salt)),Buffer.from(expected))}catch(error){if(error.code==='RESOURCE_BUSY')throw error;return false}}
const DUMMY_PASSWORD_HASH=`scrypt$${'A'.repeat(22)}$${Buffer.alloc(64).toString('base64')}`;
function strongPassword(value,roomName=''){
 if(typeof value!=='string'||value.length<16||value.length>128)return false;
 const normalized=value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'');
 const common=['password','passwordpassword','1234567890','1234567890123456','qwertyqwerty','qwertyuiopqwerty','letmeinletmein','welcomewelcome','changemechangeme','scorescanscorescan','adminadminadmin','iloveyouiloveyou','footballfootball','monkeymonkeymonkey'];
 if(common.some(value=>normalized===value)||/(.)\1{5,}/u.test(value)||/(0123456789|9876543210|abcdefghijklmnopqrstuvwxyz|qwertyuiopasdfghjkl)/.test(normalized))return false;
 if(roomName&&normalized.includes(roomName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'')))return false;
 const groups=[/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(pattern=>pattern.test(value)).length;
 return new Set(value).size>=8&&groups>=2;
}
function encQr(s){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',QR_KEY,iv),ct=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),ct])}function txt(x,n=80){return typeof x==='string'&&x.trim().length&&x.trim().length<=n?x.trim():null}function integer(x,a,b){return Number.isSafeInteger(x)&&x>=a&&x<=b?x:null}
function ip(req){const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(value=>value.trim()).filter(Boolean);return TRUST_PROXY_HOPS&&forwarded.length>=TRUST_PROXY_HOPS?forwarded[forwarded.length-TRUST_PROXY_HOPS]:(req.socket.remoteAddress||'unknown')}
function limited(map,key,max,ms){const now=Date.now(),a=(map.get(key)||[]).filter(t=>now-t<ms);a.push(now);map.set(key,a);if(map.size>10000)for(const[name,times]of map)if(!times.some(t=>now-t<ms))map.delete(name);return a.length>max}function log(level,event,meta={}){process.stdout.write(JSON.stringify({ts:new Date().toISOString(),level,event,...meta})+'\n')}
function sec(res,type='application/json; charset=utf-8'){
 const headers={
  'Content-Type':type,
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Frame-Options':'DENY',
  'X-Content-Type-Options':'nosniff',
  'X-Permitted-Cross-Domain-Policies':'none',
  'Origin-Agent-Cluster':'?1',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy':'same-origin',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Cache-Control':'no-store'
 };
 for(const[k,v]of Object.entries(headers))res.setHeader(k,v);
 if(process.env.NODE_ENV==='production')res.setHeader('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
}
function read(req,max=4096){return new Promise((ok,no)=>{let s='',n=0;req.on('data',c=>{n+=c.length;if(n>max){no(Error('large'));req.destroy()}else s+=c});req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch{no(Error('json'))}});req.on('error',no)})}

const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']),MAX_IMAGE_BYTES=5*1024*1024;
function validUuid(x){return typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)}
function imageMime(data){if(!Buffer.isBuffer(data)||data.length<12)return null;if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return'image/jpeg';if(data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return'image/png';if(data.subarray(0,4).toString('latin1')==='RIFF'&&data.subarray(8,12).toString('latin1')==='WEBP')return'image/webp';return null}
function readBuffer(req,max){return new Promise((ok,no)=>{const chunks=[];let n=0;req.on('data',c=>{n+=c.length;if(n>max){no(Error('large'));req.destroy()}else chunks.push(c)});req.on('end',()=>ok(Buffer.concat(chunks)));req.on('error',no)})}
async function imageUpload(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(!IMAGE_TYPES.has(type)){res.writeHead(415);res.end('{"error":"unsupported_image"}');return}
 if(limited(imageBuckets,ip(req),30,15*60e3)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
 const c=await db.connect();
 try{
  const room=await savedSession(c,req,'host');
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  const data=await readBuffer(req,MAX_IMAGE_BYTES);
  if(!data.length||imageMime(data)!==type){res.writeHead(415);res.end('{"error":"unsupported_image"}');return}
  const image=(await c.query('INSERT INTO quiz_images(room_id,mime,bytes,data) VALUES($1,$2,$3,$4) RETURNING id',[room.id,type,data.length,data])).rows[0];
  await audit(c,room.id,room.session_id,'image_uploaded','ok',reqId,req,{imageId:image.id,bytes:data.length,mime:type});
  res.writeHead(201);res.end(JSON.stringify({id:image.id,mime:type,bytes:data.length}));
 }catch(e){
  log('warning','image_rejected',{reason:e.code||e.message});
  if(!res.headersSent)res.writeHead(e.message==='large'?413:400);
  res.end('{"error":"image_upload_failed"}');
 }finally{c.release()}
}
async function imageThumb(req,res,id,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(!IMAGE_TYPES.has(type)){res.writeHead(415);res.end('{"error":"unsupported_image"}');return}
 if(limited(imageBuckets,ip(req),60,15*60e3)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
 const c=await db.connect();
 try{
  const room=await savedSession(c,req,'host');
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  const data=await readBuffer(req,512*1024);
  if(!data.length||imageMime(data)!==type){res.writeHead(415);res.end('{"error":"unsupported_image"}');return}
  if(!(await c.query('UPDATE quiz_images SET thumb_mime=$1,thumb_bytes=$2,thumb_data=$3 WHERE id=$4 AND room_id=$5 RETURNING id',[type,data.length,data,id,room.id])).rowCount){res.writeHead(404);res.end('{"error":"not_found"}');return}
  await audit(c,room.id,room.session_id,'image_thumbnail','ok',reqId,req,{imageId:id,bytes:data.length});
  res.writeHead(200);res.end('{"ok":true}');
 }catch(e){log('warning','thumbnail_rejected',{reason:e.code||e.message});if(!res.headersSent)res.writeHead(e.message==='large'?413:400);res.end('{"error":"thumbnail_failed"}')}finally{c.release()}
}
async function imageGet(req,res){
 sec(res);
 const parsed=new URL(req.url,'http://x'),id=(/^\/api\/images\/([0-9a-f-]{36})$/.exec(parsed.pathname)||[])[1],thumb=parsed.searchParams.get('thumb')==='1';
 if(!id){res.writeHead(404);res.end();return}
 const c=await db.connect();
 try{
  const room=await savedSession(c,req);
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  let image=thumb?(await c.query('SELECT thumb_mime AS mime,thumb_data AS data FROM quiz_images WHERE id=$1 AND room_id=$2 AND thumb_data IS NOT NULL',[id,room.id])).rows[0]:null;
  if(!image)image=(await c.query('SELECT mime,data FROM quiz_images WHERE id=$1 AND room_id=$2',[id,room.id])).rows[0];
  if(!image){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',image.mime);res.setHeader('Content-Length',image.data.length);res.setHeader('Cache-Control','private, max-age=31536000, immutable');res.setHeader('Content-Disposition','inline');
  res.writeHead(200);res.end(image.data);
 }catch(e){log('warning','image_read_failed',{reason:e.code||e.message});if(!res.headersSent)res.writeHead(404);res.end()}finally{c.release()}
}
async function broadcastState(slug){
 const c=await db.connect();
 try{for(const x of wss.clients)if(x.authed&&x.roomSlug===slug&&x.readyState===1){try{x.send(JSON.stringify({type:'state',state:await state(c,slug,x.gameId,x.role==='host')}))}catch(error){log('warning','state_send_failed',{reason:error.message})}}}finally{c.release()}
}
async function quizSave(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const c=await db.connect();let started=false;
 try{
  const room=await savedSession(c,req,'host');
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  if(limited(quizBuckets,ip(req),30,15*60e3)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
  const body=await read(req,262144),title=txt(body.title,120),input=Array.isArray(body.questions)?body.questions:[];
  if(!title||!input.length||input.length>100){res.writeHead(400);res.end('{"error":"invalid_input"}');return}
  const questions=[];
  for(const item of input){
   const prompt=txt(item&&item.prompt,500),points=integer(item&&item.points,1,1000000),imageId=item&&validUuid(item.imageId)?item.imageId:null;
   if(!prompt||points===null||!imageId){res.writeHead(400);res.end('{"error":"invalid_input"}');return}
   questions.push({prompt,points,imageId});
  }
  const ids=[...new Set(questions.map(q=>q.imageId))];
  const owned=(await c.query('SELECT id FROM quiz_images WHERE room_id=$1 AND id=ANY($2::uuid[])',[room.id,ids])).rows.map(row=>row.id);
  if(owned.length!==ids.length){res.writeHead(400);res.end('{"error":"invalid_image"}');return}
  const update=body.quizId!==undefined&&body.quizId!==null&&body.quizId!=='';
  if(update&&!validUuid(body.quizId)){res.writeHead(400);res.end('{"error":"invalid_input"}');return}
  await c.query('BEGIN');started=true;
  let quizId;
  if(update){
   if(!(await c.query('UPDATE quizzes SET title=$1,updated_at=clock_timestamp() WHERE room_id=$2 AND id=$3 RETURNING id',[title,room.id,body.quizId])).rowCount)throw Error('quiz');
   quizId=body.quizId;
   await c.query('DELETE FROM quiz_questions WHERE quiz_id=$1',[quizId]);
  }else{
   quizId=(await c.query('INSERT INTO quizzes(room_id,title) VALUES($1,$2) RETURNING id',[room.id,title])).rows[0].id;
  }
  for(let i=0;i<questions.length;i++)await c.query('INSERT INTO quiz_questions(quiz_id,ordinal,prompt,points,image_id) VALUES($1,$2,$3,$4,$5)',[quizId,i+1,questions[i].prompt,questions[i].points,questions[i].imageId]);
  await c.query('UPDATE rooms SET revision=revision+1,updated_at=now() WHERE id=$1',[room.id]);
  await audit(c,room.id,room.session_id,update?'quiz_updated':'quiz_created','ok',reqId,req,{quizId,questions:questions.length});
  await c.query('COMMIT');started=false;
  broadcastState(room.slug).catch(error=>log('warning','state_broadcast_failed',{reason:error.message}));
  res.writeHead(update?200:201);res.end(JSON.stringify({quizId}));
 }catch(e){
  if(started)await c.query('ROLLBACK').catch(()=>{});
  log('warning','quiz_rejected',{reason:e.code||e.message});
  if(!res.headersSent)res.writeHead(e.code==='23505'?409:e.message==='quiz'?404:400);
  res.end(JSON.stringify({error:e.code==='23505'?'duplicate_quiz':e.message==='quiz'?'not_found':'quiz_save_failed'}));
 }finally{c.release()}
}
async function quizDelete(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const id=(/^\/api\/quizzes\/([0-9a-f-]{36})$/.exec(req.url)||[])[1];
 if(!id){res.writeHead(404);res.end();return}
 const c=await db.connect();let started=false;
 try{
  const room=await savedSession(c,req,'host');
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  await c.query('BEGIN');started=true;
  if(!(await c.query('DELETE FROM quizzes WHERE room_id=$1 AND id=$2 RETURNING id',[room.id,id])).rowCount)throw Error('quiz');
  await c.query('UPDATE rooms SET revision=revision+1,updated_at=now() WHERE id=$1',[room.id]);
  await audit(c,room.id,room.session_id,'quiz_deleted','ok',reqId,req,{quizId:id});
  await c.query('COMMIT');started=false;
  broadcastState(room.slug).catch(error=>log('warning','state_broadcast_failed',{reason:error.message}));
  res.writeHead(200);res.end('{"ok":true}');
 }catch(e){
  if(started)await c.query('ROLLBACK').catch(()=>{});
  log('warning','quiz_delete_rejected',{reason:e.code||e.message});
  if(!res.headersSent)res.writeHead(e.message==='quiz'?404:400);
  res.end('{"error":"quiz_delete_failed"}');
 }finally{c.release()}
}
async function audit(c,room,session,event,outcome,reqId,req,meta={}){await c.query('INSERT INTO audit_events(room_id,actor_session_id,severity,event_type,outcome,ip_hash,correlation_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[room,session,outcome==='ok'?'info':'warning',event,outcome,hmac(ip(req)),reqId,JSON.stringify(meta)])}
async function state(c,slug,gameId,includeQuizzes=false){
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const r=(await c.query('SELECT * FROM rooms WHERE slug=$1',[slug])).rows[0];
  if(!r){await c.query('COMMIT');return null}
  const games=(await c.query('SELECT id,points_per_question,current_question,legacy,started_at,ended_at,quiz_id,quiz_title,question_count FROM games WHERE room_id=$1 ORDER BY started_at DESC,id',[r.id])).rows.map(g=>({id:g.id,pointsPerQuestion:g.points_per_question,question:g.current_question,legacy:g.legacy,startedAt:g.started_at,endedAt:g.ended_at,quizId:g.quiz_id,quizTitle:g.quiz_title,questionCount:g.question_count}));
  const activeGame=games.find(g=>!g.endedAt),game=games.find(g=>g.id===gameId)||activeGame||games[0]||null;
  const questions=game?(await c.query('SELECT id,ordinal,points,label,prompt,image_id FROM game_questions WHERE game_id=$1 ORDER BY ordinal',[game.id])).rows:[];
  const awards=game?(await c.query(`SELECT w.question_id,w.player_id,
   COALESCE(w.legacy_points::numeric,q.points::numeric/count(*) OVER(PARTITION BY q.id)) points
   FROM question_winners w JOIN game_questions q ON q.id=w.question_id WHERE q.game_id=$1`,[game.id])).rows:[];
  const players=(await c.query(`SELECT p.id,p.name,p.kind,p.deleted_at IS NOT NULL AS deleted
   FROM players p WHERE p.room_id=$1 AND (p.deleted_at IS NULL OR EXISTS(
    SELECT 1 FROM question_winners w JOIN game_questions q ON q.id=w.question_id
    WHERE w.player_id=p.id AND q.game_id=$2)) ORDER BY p.created_at,p.id`,[r.id,game?.id||null])).rows.map(p=>{
   const scores=Object.fromEntries(awards.filter(a=>a.player_id===p.id).map(a=>[a.question_id,Number(a.points)]));
   return {...p,scores,score:Object.values(scores).reduce((sum,points)=>sum+points,0)};
  });
  let quizzes=[];
  if(includeQuizzes){
   const quizRows=(await c.query('SELECT id,title,updated_at FROM quizzes WHERE room_id=$1 ORDER BY updated_at DESC,id',[r.id])).rows;
   const quizIds=quizRows.map(q=>q.id);
   const quizQuestions=quizIds.length?(await c.query('SELECT quiz_id,id,ordinal,prompt,points,image_id FROM quiz_questions WHERE quiz_id=ANY($1::uuid[]) ORDER BY quiz_id,ordinal',[quizIds])).rows:[];
   quizzes=quizRows.map(q=>({id:q.id,title:q.title,updatedAt:q.updated_at,questions:quizQuestions.filter(x=>x.quiz_id===q.id).map(x=>({id:x.id,ordinal:x.ordinal,prompt:x.prompt,points:x.points,imageId:x.image_id,imageUrl:x.image_id?'/api/images/'+x.image_id:null,thumbUrl:x.image_id?'/api/images/'+x.image_id+'?thumb=1':null}))}));
  }
  const result={title:r.title,displayMode:r.display_mode||'scores',games,activeGameId:activeGame?.id||null,game:game?{...game,questions:questions.map(q=>({...q,prompt:q.prompt,imageId:q.image_id,imageUrl:q.image_id?'/api/images/'+q.image_id:null,thumbUrl:q.image_id?'/api/images/'+q.image_id+'?thumb=1':null,winners:awards.filter(a=>a.question_id===q.id).map(a=>({playerId:a.player_id,points:Number(a.points)}))}))}:null,players,...(includeQuizzes?{quizzes}:{}),revision:Number(r.revision)};
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e}
}
function sessionCookie(req,token,maxAge){
 return `scorescan_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV==='production'||req.socket.encrypted?'; Secure':''}`;
}
async function savedSession(c,req,requiredRole){
 const token=/(?:^|;\s*)scorescan_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
 if(!token)return null;
 return (await c.query(`SELECT r.*,s.id AS session_id,s.expires_at AS session_expires_at
  FROM host_sessions s JOIN rooms r ON r.id=s.room_id
  WHERE s.token_hash=$1 AND ($2::text IS NULL OR s.socket_role=$2)
   AND s.revoked_at IS NULL AND s.expires_at>now()`,[hmac('browser-session:'+token),requiredRole||null])).rows[0]||null;
}
async function ticketSession(c,ticket,role){
 if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))return null;
 return (await c.query(`WITH claimed AS(
   DELETE FROM socket_tickets
   WHERE token_hash=$1 AND socket_role=$2 AND expires_at>now()
   RETURNING session_id)
  SELECT r.*,s.id AS session_id,s.expires_at AS session_expires_at
  FROM claimed t JOIN host_sessions s ON s.id=t.session_id
  JOIN rooms r ON r.id=s.room_id
  WHERE s.socket_role=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`,[hmac('socket-ticket:'+ticket),role])).rows[0]||null;
}
async function loginLimited(c,keyHashes){
 const rows=(await c.query(`INSERT INTO login_attempts(key_hash,attempts,expires_at)
  SELECT candidate,1,now()+interval '15 minutes' FROM unnest($1::bytea[]) AS hashes(candidate)
  ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.expires_at<=now() THEN 1 ELSE login_attempts.attempts+1 END,
   expires_at=CASE WHEN login_attempts.expires_at<=now() THEN now()+interval '15 minutes' ELSE login_attempts.expires_at END
  RETURNING key_hash,attempts`,[keyHashes])).rows;
 return rows.some(row=>(row.key_hash.equals(keyHashes[0])?LOGIN_CLIENT_LIMIT:LOGIN_ROOM_LIMIT)<row.attempts);
}
async function sessionRequest(req,res){
 sec(res);
 if(!['GET','POST','DELETE'].includes(req.method)){res.writeHead(405);res.end('{"error":"method_not_allowed"}');return}
 if(req.method!=='GET'&&!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const role=new URL(req.url,'http://localhost').searchParams.get('role');
 if(req.method!=='DELETE'&&!['host','display'].includes(role)){res.writeHead(400);res.end('{"error":"invalid_role"}');return}
 let body,name,loginKeys;
 if(req.method==='POST'){
  body=await read(req);name=txt(body.roomName);
  if(!name){res.writeHead(400);res.end('{"error":"invalid_input"}');return}
  if(!strongPassword(body.secret,name)){res.writeHead(400);res.end('{"error":"weak_password"}');return}
  if(limited(authBuckets,ip(req)+':'+name.toLowerCase(),8,15*60e3)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
  loginKeys=[hmac('login-client:'+ip(req)),hmac('login-room:'+name.toLowerCase())];
 }
 const c=await db.connect();
 try{
  let room;
  if(req.method==='POST'){
   if(await loginLimited(c,loginKeys)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
   room=(await c.query('SELECT * FROM rooms WHERE login_name=lower($1)',[name])).rows[0];
   const passwordMatches=await passOk(body.secret,room?.host_secret_hash||DUMMY_PASSWORD_HASH);
   if(!room||!passwordMatches){
    await audit(c,room?.id||null,null,'session_login','denied',crypto.randomUUID(),req);
    log('warning','session_login_rejected');res.writeHead(401);res.end('{"error":"denied"}');return;
   }
   await c.query('DELETE FROM login_attempts WHERE key_hash=ANY($1::bytea[])',[loginKeys]);
   const token=b64(32);
   const session=(await c.query(`INSERT INTO host_sessions(room_id,token_hash,socket_role,expires_at)
    VALUES($1,$2,$3,now()+($4 * interval '1 second')) RETURNING id,expires_at`,[room.id,hmac('browser-session:'+token),role,SESSION_TTL_SECONDS])).rows[0];
   await c.query(`UPDATE host_sessions SET revoked_at=now() WHERE id IN(
    SELECT id FROM host_sessions WHERE room_id=$1 AND revoked_at IS NULL AND expires_at>now()
    ORDER BY created_at DESC OFFSET 12)`,[room.id]);
   room={...room,session_id:session.id,session_expires_at:session.expires_at};
   res.setHeader('Set-Cookie',sessionCookie(req,token,SESSION_TTL_SECONDS));
  }else{
   room=await savedSession(c,req,req.method==='DELETE'?undefined:role);
   if(req.method==='DELETE'){
    if(room){
     await c.query('UPDATE host_sessions SET revoked_at=now() WHERE id=$1',[room.session_id]);
     await c.query('DELETE FROM socket_tickets WHERE session_id=$1',[room.session_id]);
     for(const socket of wss.clients)if(socket.session===room.session_id)socket.close(4401,'logout');
    }
    res.setHeader('Set-Cookie',sessionCookie(req,'',0));res.end('{"ok":true}');return;
   }
   if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  }
  const socketToken=b64(32);
  await c.query("INSERT INTO socket_tickets(session_id,token_hash,socket_role,expires_at) VALUES($1,$2,$3,now()+interval '30 seconds')",[room.session_id,hmac('socket-ticket:'+socketToken),role]);
  res.end(JSON.stringify({roomName:room.title,socketTicket:socketToken}));
 }finally{c.release()}
}
async function rotatePassword(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const body=await read(req),name=txt(body.roomName),oldPassword=body.currentPassword,newPassword=body.newPassword;
 if(!name||typeof oldPassword!=='string'||oldPassword.length<16||oldPassword.length>128||!strongPassword(newPassword,name)){
  res.writeHead(400);res.end('{"error":"invalid_input"}');return;
 }
 const keys=[hmac('login-client:'+ip(req)),hmac('login-room:'+name.toLowerCase())];
 const c=await db.connect();let started=false;
 try{
  const current=await savedSession(c,req,'host');
  if(!current||current.login_name!==name.toLowerCase()){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  if(await loginLimited(c,keys)){res.writeHead(429);res.end('{"error":"rate_limited"}');return}
  await c.query('BEGIN');started=true;
  const room=(await c.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[current.id])).rows[0];
  if(!room||!await passOk(oldPassword,room.host_secret_hash))throw Error('credentials');
  const hash=await passHash(newPassword,name),token=b64(32);
  await c.query('UPDATE rooms SET host_secret_hash=$1,updated_at=now() WHERE id=$2',[hash,room.id]);
  await c.query('UPDATE host_sessions SET revoked_at=now() WHERE room_id=$1 AND revoked_at IS NULL',[room.id]);
  await c.query('DELETE FROM socket_tickets WHERE session_id IN (SELECT id FROM host_sessions WHERE room_id=$1)',[room.id]);
  const session=(await c.query(`INSERT INTO host_sessions(room_id,token_hash,socket_role,expires_at)
   VALUES($1,$2,'host',now()+($3 * interval '1 second')) RETURNING id`,[room.id,hmac('browser-session:'+token),SESSION_TTL_SECONDS])).rows[0];
  await audit(c,room.id,session.id,'password_rotated','ok',reqId,req);
  await c.query('COMMIT');started=false;
  res.setHeader('Set-Cookie',sessionCookie(req,token,SESSION_TTL_SECONDS));
  for(const socket of wss.clients)if(socket.room?.id===room.id)socket.close(4401,'password_rotated');
  res.end('{"ok":true}');
 }catch(error){
  if(started)await c.query('ROLLBACK').catch(()=>{});
  if(error.message==='credentials'){
   log('warning','password_rotation_rejected',{reqId});res.writeHead(401);res.end('{"error":"denied"}');return;
  }
  throw error;
 }finally{c.release()}
}
async function revokeAllSessions(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const c=await db.connect();
 try{
  const room=await savedSession(c,req,'host');
  if(!room){res.writeHead(401);res.end('{"error":"session_expired"}');return}
  await c.query('BEGIN');
  await c.query('UPDATE host_sessions SET revoked_at=now() WHERE room_id=$1 AND revoked_at IS NULL',[room.id]);
  await c.query('DELETE FROM socket_tickets WHERE session_id IN (SELECT id FROM host_sessions WHERE room_id=$1)',[room.id]);
  await audit(c,room.id,room.session_id,'sessions_revoked','ok',reqId,req);
  await c.query('COMMIT');
  res.setHeader('Set-Cookie',sessionCookie(req,'',0));
  for(const socket of wss.clients)if(socket.room?.id===room.id)socket.close(4401,'logout_all');
  res.end('{"ok":true}');
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
}
 async function schemaReady(c){
  await c.query(`SELECT hs.socket_role,st.socket_role,la.key_hash
   FROM host_sessions hs CROSS JOIN socket_tickets st CROSS JOIN login_attempts la
   LIMIT 0`);
 }
async function createRoom(req,res,reqId){
 sec(res);
 if(!ORIGINS.includes(req.headers.origin)){res.writeHead(403);res.end('{"error":"origin_denied"}');return}
 const body=await read(req),title=txt(body.roomName),secret=body.hostSecret;
 if(!title){res.writeHead(400);res.end('{"error":"invalid_input"}');return}
 if(!strongPassword(secret,title)){res.writeHead(400);res.end('{"error":"weak_password"}');return}
 const keys=[hmac('room-create-client:'+ip(req)),hmac('room-create-global:all')],c=await db.connect();
 let started=false;
 try{
  const attempts=(await c.query(`INSERT INTO login_attempts(key_hash,attempts,expires_at)
    SELECT candidate,1,now()+interval '15 seconds' FROM unnest($1::bytea[]) AS hashes(candidate)
   ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.expires_at<=now() THEN 1 ELSE login_attempts.attempts+1 END,
     expires_at=CASE WHEN login_attempts.expires_at<=now() THEN now()+interval '15 seconds' ELSE login_attempts.expires_at END
   RETURNING key_hash,attempts`,[keys])).rows;
  if(attempts.some(row=>(row.key_hash.equals(keys[0])?5:30)<row.attempts)){
   log('warning','room_creation_rate_limited',{client:hmac('room-create-log:'+ip(req)).toString('hex').slice(0,16)});
   res.setHeader('Retry-After','15');res.writeHead(429);res.end('{"error":"rate_limited"}');return;
  }
  const slug=crypto.randomUUID(),hostSecretHash=await passHash(secret,title);
  await c.query('BEGIN');started=true;
  const room=(await c.query('INSERT INTO rooms(slug,title,login_name,host_secret_hash) VALUES($1,$2,lower($4),$3) RETURNING id',[slug,title,hostSecretHash,title])).rows[0];
  await audit(c,room.id,null,'room_created','ok',reqId,req);
  await c.query('COMMIT');started=false;
  res.writeHead(201);res.end(JSON.stringify({roomId:slug}));
 }catch(error){
  if(started)await c.query('ROLLBACK').catch(()=>{});
  throw error;
 }finally{c.release()}
}
const server=http.createServer(async(req,res)=>{
 const reqId=crypto.randomUUID();
 try{
  const route=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&route.startsWith('/api/images/'))return await imageGet(req,res);
  const thumbRoute=/^\/api\/images\/([0-9a-f-]{36})\/thumbnail$/.exec(route);
  if(req.method==='POST'&&thumbRoute)return await imageThumb(req,res,thumbRoute[1],reqId);
  if(limited(ipBuckets,ip(req),120,60000)){sec(res);res.writeHead(429);return res.end('{"error":"rate_limited"}')}
  if(req.method==='POST'&&route==='/api/session/password')return await rotatePassword(req,res,reqId);
  if(req.method==='DELETE'&&route==='/api/session/all')return await revokeAllSessions(req,res,reqId);
  if(route==='/api/session')return await sessionRequest(req,res);
  if(req.method==='POST'&&route==='/api/images')return await imageUpload(req,res,reqId);
  if(req.method==='POST'&&route==='/api/quizzes')return await quizSave(req,res,reqId);
  if(req.method==='DELETE'&&route.startsWith('/api/quizzes/'))return await quizDelete(req,res,reqId);
  if(req.method==='POST'&&route==='/api/rooms')return await createRoom(req,res,reqId);
if(req.url==='/healthz'||req.url==='/readyz'){const c=await db.connect();try{if(req.url==='/readyz')await schemaReady(c);else await c.query('SELECT 1');sec(res);res.end('{"ok":true}')}catch(error){log('error','readiness_failed',{code:error.code||error.message});sec(res);res.writeHead(503);res.end('{"error":"schema_unavailable"}')}finally{c.release()}return}let u=req.url.split('?')[0];if(u==='/')u='/index.html';if(u==='/vendor/html5-qrcode.min.js'){u='/vendor.js';const src=path.join(__dirname,'node_modules/html5-qrcode/html5-qrcode.min.js');sec(res,'text/javascript; charset=utf-8');return fs.createReadStream(src).pipe(res)}const f=path.normalize(path.join(PUBLIC,u));if(!f.startsWith(PUBLIC)){sec(res);res.writeHead(403);return res.end()}const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};sec(res,types[path.extname(f)]||'application/octet-stream');fs.stat(f,(e,s)=>{if(e||!s.isFile()){res.writeHead(404);res.end()}else fs.createReadStream(f).pipe(res)})}catch(e){log('error','http_error',{reqId,message:e.code||e.message});if(!res.headersSent)sec(res);const databaseUnavailable=/^(42|53|57)/.test(String(e.code||''))||['ECONNREFUSED','ETIMEDOUT','ENETUNREACH'].includes(e.code);
 const status=e.code==='23505'?409:e.code==='RESOURCE_BUSY'||databaseUnavailable?503:400;
 res.writeHead(status);res.end(status===503?'{"error":"temporarily_unavailable"}':'{"error":"request_failed"}')}});
const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});server.on('upgrade',(req,sock,head)=>{const client=ip(req);if(!ORIGINS.includes(req.headers.origin)||limited(connections,client,8,60000)||new URL(req.url,'http://x').pathname!=='/ws'){sock.write('HTTP/1.1 403 Forbidden\r\n\r\n');return sock.destroy()}wss.handleUpgrade(req,sock,head,ws=>{ws.clientIp=client;wss.emit('connection',ws,req)})});
async function auth(ws,m,req){
 if(m.type!=='auth'||!['host','display'].includes(m.role))throw Error('auth');
 const c=await db.connect();
 try{
  const room=await ticketSession(c,m.socketTicket,m.role),sid=room?.session_id;
  if(!room)throw Error('session_expired');
  ws.sessionExpiresAt=new Date(room.session_expires_at).getTime();
  ws.room=room;ws.role=m.role;ws.session=sid;ws.req=req;ws.roomSlug=room.slug;ws.authed=true;
  ws.send(JSON.stringify({type:'auth.ok',roomId:room.slug,state:await state(c,room.slug,undefined,m.role==='host')}));
 }finally{c.release()}
}
async function act(ws,m){
 if(m.type==='game.select'){
  const c=await db.connect();
  try{
   if(m.gameId!==null&&!(await c.query('SELECT 1 FROM games WHERE room_id=$1 AND id=$2',[ws.room.id,m.gameId])).rowCount)throw Error('game');
   ws.gameId=m.gameId;
   ws.send(JSON.stringify({type:'state',state:await state(c,ws.roomSlug,ws.gameId,ws.role==='host')}));
  }finally{c.release()}
  return;
 }
 if(ws.role!=='host')throw Error('forbidden');
 const reqId=crypto.randomUUID(),c=await db.connect();let result;
 try{
  await c.query('BEGIN');
  const room=(await c.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE',[ws.room.id])).rows[0];
  if(!room)throw Error('room');
  if(m.type==='player.add'){
   const name=txt(m.name,60),code=txt(m.code,256),kind=['person','team'].includes(m.playerType)?m.playerType:null;
   if(!name||!code||!kind)throw Error('input');
   await c.query('INSERT INTO players(room_id,name,kind,qr_hash,qr_ciphertext) VALUES($1,$2,$3,$4,$5)',[room.id,name,kind,hmac(code),encQr(code)]);
  }else if(m.type==='player.remove'){
   if(!(await c.query('UPDATE players SET deleted_at=clock_timestamp() WHERE room_id=$1 AND id=$2 AND deleted_at IS NULL',[room.id,m.playerId])).rowCount)throw Error('player');
  }else if(m.type==='display.mode'){
   const mode=['scores','question'].includes(m.mode)?m.mode:null;
   if(!mode)throw Error('mode');
   await c.query('UPDATE rooms SET display_mode=$1 WHERE id=$2',[mode,room.id]);
  }else if(m.type==='game.start'){
   const quizId=m.quizId===undefined||m.quizId===null||m.quizId===''?null:m.quizId;
   const points=integer(m.pointsPerQuestion,1,1000000);
   let quiz=null,quizQuestions=[];
   if(quizId!==null){
    if(!validUuid(quizId))throw Error('quiz');
    quiz=(await c.query('SELECT id,title FROM quizzes WHERE room_id=$1 AND id=$2',[room.id,quizId])).rows[0];
    if(!quiz)throw Error('quiz');
    quizQuestions=(await c.query('SELECT prompt,points,image_id FROM quiz_questions WHERE quiz_id=$1 ORDER BY ordinal',[quizId])).rows;
    if(!quizQuestions.length)throw Error('quiz_empty');
   }else if(points===null)throw Error('input');
   if((await c.query('SELECT 1 FROM games WHERE room_id=$1 AND ended_at IS NULL',[room.id])).rowCount)throw Error('game_running');
   if(quiz){
    const game=(await c.query('INSERT INTO games(room_id,points_per_question,quiz_id,quiz_title,question_count) VALUES($1,$2,$3,$4,$5) RETURNING id',[room.id,quizQuestions[0].points,quiz.id,quiz.title,quizQuestions.length])).rows[0];
    for(let i=0;i<quizQuestions.length;i++)await c.query('INSERT INTO game_questions(game_id,ordinal,points,label,prompt,image_id) VALUES($1,$2,$3,$4,$5,$6)',[game.id,i+1,quizQuestions[i].points,'Vraag '+(i+1),quizQuestions[i].prompt,quizQuestions[i].image_id]);
    ws.gameId=game.id;
   }else{
    const game=(await c.query('INSERT INTO games(room_id,points_per_question) VALUES($1,$2) RETURNING id',[room.id,points])).rows[0];
    await c.query('INSERT INTO game_questions(game_id,ordinal,points) VALUES($1,1,$2)',[game.id,points]);
    ws.gameId=game.id;
   }
  }else{
   const game=(await c.query('SELECT * FROM games WHERE room_id=$1 AND id=$2 AND ended_at IS NULL',[room.id,m.gameId])).rows[0];
   if(!game)throw Error('no_active_game');
   const question=(await c.query('SELECT * FROM game_questions WHERE game_id=$1 AND ordinal=$2',[game.id,game.current_question])).rows[0];
   if(!question||m.questionId!==question.id)throw Error('stale_question');
   if(m.type==='game.stop'){
    await c.query('UPDATE games SET ended_at=clock_timestamp() WHERE id=$1',[game.id]);
   }else if(m.type==='question.next'){
    if(game.question_count&&game.current_question>=game.question_count)throw Error('quiz_finished');
    const next=integer(game.current_question+1,1,10000);
    if(next===null)throw Error('question_limit');
    await c.query('INSERT INTO game_questions(game_id,ordinal,points) VALUES($1,$2,$3) ON CONFLICT(game_id,ordinal) DO NOTHING',[game.id,next,game.points_per_question]);
    await c.query('UPDATE games SET current_question=$1 WHERE id=$2',[next,game.id]);
   }else if(m.type==='question.select'){
    if(!(await c.query('SELECT 1 FROM game_questions WHERE game_id=$1 AND id=$2',[game.id,m.targetQuestionId])).rowCount)throw Error('question');
    await c.query('UPDATE games SET current_question=(SELECT ordinal FROM game_questions WHERE id=$1) WHERE id=$2',[m.targetQuestionId,game.id]);
   }else if(m.type==='scan.award'){
    const code=txt(m.code,256),key=m.idempotencyKey;
    if(!code||typeof key!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key))throw Error('input');
    if((await c.query('SELECT 1 FROM game_scans WHERE room_id=$1 AND idempotency_key=$2',[room.id,key])).rowCount)throw Error('duplicate_request');
    const p=(await c.query('SELECT * FROM players WHERE room_id=$1 AND qr_hash=$2 AND deleted_at IS NULL',[room.id,hmac(code)])).rows[0];
    if(!p){await c.query('ROLLBACK');ws.send(JSON.stringify({type:'scan.result',ok:false,code:'unknown'}));return}
    if(!(await c.query('INSERT INTO question_winners(question_id,player_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING player_id',[question.id,p.id])).rowCount){
     await c.query('ROLLBACK');ws.send(JSON.stringify({type:'scan.result',ok:false,code:'duplicate'}));return;
    }
    await c.query('INSERT INTO game_scans(room_id,idempotency_key,question_id,player_id) VALUES($1,$2,$3,$4)',[room.id,key,question.id,p.id]);
    const count=Number((await c.query('SELECT count(*) FROM question_winners WHERE question_id=$1',[question.id])).rows[0].count);
    result={type:'scan.result',ok:true,name:p.name,points:question.points/count,winnerCount:count};
   }else if(m.type==='winner.remove'||m.type==='award.undo'){
    const removed=await c.query(m.type==='winner.remove'?
     'DELETE FROM question_winners WHERE question_id=$1 AND player_id=$2 RETURNING player_id':
     'DELETE FROM question_winners WHERE question_id=$1 AND player_id=(SELECT player_id FROM question_winners WHERE question_id=$1 ORDER BY created_at DESC,player_id DESC LIMIT 1) RETURNING player_id',
    m.type==='winner.remove'?[question.id,m.playerId]:[question.id]);
    if(!removed.rowCount)throw Error('nothing');
   }else throw Error('action');
  }
  await c.query('UPDATE rooms SET revision=revision+1,updated_at=now() WHERE id=$1',[room.id]);
  await audit(c,room.id,ws.session,m.type,'ok',reqId,ws.req,{gameId:m.gameId,quizId:m.quizId,mode:m.mode,questionId:m.questionId,playerId:m.playerId,idempotencyKey:m.idempotencyKey});
  await c.query('COMMIT');
  if(result)ws.send(JSON.stringify(result));
  for(const x of wss.clients)if(x.authed&&x.room?.id===room.id&&x.readyState===1){try{x.send(JSON.stringify({type:'state',state:await state(c,ws.roomSlug,x.gameId,x.role==='host')}))}catch(error){log('warning','state_send_failed',{reason:error.message})}}
 }catch(e){
  await c.query('ROLLBACK');log('warning','action_rejected',{type:m.type,reason:e.code||e.message});
  const reasons=['input','player','game_running','no_active_game','stale_question','question_limit','question','duplicate_request','nothing','action','quiz','quiz_empty','quiz_finished','mode'];
  ws.send(JSON.stringify({type:'error',code:'action_rejected',reason:reasons.includes(e.message)?e.message:e.code==='23505'?'duplicate_qr':'request_failed'}));
 }finally{c.release()}
}
wss.on('connection',(ws,req)=>{
 ws.authed=false;ws.messageTask=Promise.resolve();
 const timer=setTimeout(()=>ws.close(4401,'timeout'),5000);
 ws.on('message',b=>{
  if(limited(ipBuckets,'ws:'+ws.clientIp,60,10000))return ws.close(4429,'rate');
  ws.messageTask=ws.messageTask.then(async()=>{
   if(ws.readyState!==1)return;
   const m=JSON.parse(b.toString());
   if(!ws.authed){await auth(ws,m,req);clearTimeout(timer)}else{
    if(Date.now()>=ws.sessionExpiresAt)throw Error('session_expired');
    await act(ws,m);
   }
  }).catch(e=>{
   log('warning','ws_rejected',{reason:e.message});
   if(e.message==='session_expired'||e.message==='denied')ws.close(4401,'authentication_expired');
   else if(e.message==='auth'||e.message==='blocked')ws.close(4403,'authentication_rejected');
   else ws.close(1011,'server_error');
  });
 });
 ws.on('error',e=>log('warning','ws_error',{reason:e.message}));
 ws.on('close',()=>clearTimeout(timer));
});setInterval(async()=>{try{await db.query("DELETE FROM host_sessions WHERE expires_at<now() OR revoked_at IS NOT NULL AND revoked_at<now()-interval '7 days'");await db.query("DELETE FROM socket_tickets WHERE expires_at<now()");await db.query("DELETE FROM login_attempts WHERE expires_at<now()");await db.query("DELETE FROM quiz_images i WHERE i.created_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM quiz_questions q WHERE q.image_id=i.id) AND NOT EXISTS(SELECT 1 FROM game_questions g WHERE g.image_id=i.id)")}catch{}},3600000).unref();server.listen(PORT,()=>log('info','started',{port:PORT}));
