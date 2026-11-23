'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const schema=fs.readFileSync('postgres-init/003-schema.sql','utf8'),server=fs.readFileSync('server.js','utf8');

test('fresh schema covers final application model and public auth controls',()=>{
 for(const x of ['CREATE TABLE rooms','CREATE TABLE games','CREATE TABLE quiz_images','CREATE TABLE host_sessions','socket_role','CREATE TABLE socket_tickets','CREATE TABLE login_attempts','display_mode'])assert(schema.includes(x));
 assert(!schema.includes('CREATE TABLE display_tokens'));
});

test('server parameterizes SQL and hardens websocket',()=>{
 assert(server.includes('perMessageDeflate:false'));
 assert(server.includes('maxPayload:16384'));
 assert(server.includes('FOR UPDATE'));
 assert(!server.includes('SELECT * FROM '+"${"));
});
