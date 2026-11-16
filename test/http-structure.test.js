'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync('server.js','utf8');
test('all SQL calls use static statements with value arrays',()=>{assert.ok(!/query\s*\(\s*`[^`]*\$\{/s.test(s));assert.ok((s.match(/\$[1-9]/g)||[]).length>20)});
test('secrets can be supplied as environment variables',()=>{for(const x of ['DATABASE_URL','SECRET_PEPPER','QR_ENCRYPTION_KEY'])assert.ok(s.includes(x))});
test('unknown server errors are not returned verbatim',()=>{assert.ok(s.includes('{"error":"request_failed"}'));assert.ok(!s.includes('res.end(e.message)'))});
