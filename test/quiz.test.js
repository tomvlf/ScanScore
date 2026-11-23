'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events');

function helpers(){
 const context=vm.createContext({
  require(name){
   if(name==='pg')return {Pool:class{on(){}}};
   if(name==='ws')return {WebSocketServer:class extends EventEmitter{}};
   if(name==='http')return {createServer(){const server=new EventEmitter();server.listen=()=>{};return server}};
   return require(name);
  },
  __dirname:process.cwd(),Buffer,URL,
  process:{env:{DATABASE_URL:'postgresql://test.invalid/test',SECRET_PEPPER:'test-only-pepper',QR_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')},stdout:{write(){}}},
  setInterval(){return {unref(){}}}
 });
 vm.runInContext(fs.readFileSync('server.js','utf8'),context);
 return context;
}

test('image uploads are accepted only for real JPEG, PNG and WebP bytes',()=>{
 const c=helpers();
 const mime=bytes=>vm.runInContext(`imageMime(Buffer.from(${JSON.stringify(bytes)},'hex'))`,c);
 assert.equal(mime('ffd8ffe000104a46494600010100'),'image/jpeg');
 assert.equal(mime('89504e470d0a1a0a0000000d'),'image/png');
 assert.equal(mime('524946460000000057454250'),'image/webp');
 assert.equal(mime('3c73766720786d6c6e733d'),null);
 assert.equal(mime('000000000000'),null);
});

test('quiz image references require a UUID',()=>{
 const c=helpers();
 const valid=value=>vm.runInContext(`validUuid(${JSON.stringify(value)})`,c);
 assert.equal(valid('a3c0f0d4-1b2c-4d5e-8f90-123456789abc'),true);
 assert.equal(valid('../../etc/passwd'),false);
 assert.equal(valid('a3c0f0d4-1b2c-4d5e-8f90'),false);
 assert.equal(valid(42),false);
});
