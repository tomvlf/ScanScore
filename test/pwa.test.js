'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{Writable}=require('node:stream');

function application(){
 let handle;
 class Pool{on(){}}
 class WebSocketServer extends EventEmitter{}
 vm.runInNewContext(fs.readFileSync('server.js','utf8'),{
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
 return url=>new Promise((resolve,reject)=>{
  const chunks=[],headers={},response=new Writable({write(chunk,_encoding,done){chunks.push(Buffer.from(chunk));done()}});
  response.statusCode=200;response.setHeader=(name,value)=>{headers[name.toLowerCase()]=value};
  response.writeHead=status=>{response.statusCode=status};
  response.on('error',reject);response.on('finish',()=>resolve({status:response.statusCode,headers,body:Buffer.concat(chunks)}));
  handle({method:'GET',url,headers:{},socket:{remoteAddress:'test-client'}},response).catch(reject);
 });
}

test('both screens serve a Chrome-installable manifest and correctly sized PNG icons',async()=>{
 const request=application();
 for(const url of ['/','/scoreboard.html']){
  const page=await request(url);
  assert.equal(page.status,200);
  assert.match(page.body.toString(),/<link rel="manifest" href="\/manifest.webmanifest">/);
 }
 const response=await request('/manifest.webmanifest');
 assert.equal(response.status,200);
 assert.match(response.headers['content-type'],/^application\/manifest\+json/);
 const manifest=JSON.parse(response.body);
 assert.ok(manifest.name||manifest.short_name);
 assert.equal(manifest.display,'standalone');
 assert.notEqual(manifest.prefer_related_applications,true);
 const origin='https://quiz.example.test',start=new URL(manifest.start_url,origin),scope=new URL(manifest.scope,origin);
 assert.equal(start.origin,origin);assert.ok(start.pathname.startsWith(scope.pathname));
 assert.equal((await request(start.pathname)).status,200);
 for(const size of [192,512]){
  const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`&&icon.type==='image/png');
  assert.ok(icon,`Missing ${size}px PNG installation icon`);
  const image=await request(icon.src);
  assert.equal(image.status,200);assert.equal(image.headers['content-type'],'image/png');
  assert.equal(image.body.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.body.readUInt32BE(16),size);assert.equal(image.body.readUInt32BE(20),size);
 }
});
