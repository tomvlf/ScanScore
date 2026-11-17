'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const server=fs.readFileSync('server.js','utf8'),html=fs.readFileSync('public/index.html','utf8'),board=fs.readFileSync('public/scoreboard.html','utf8'),css=fs.readFileSync('public/app.css','utf8'),compose=fs.readFileSync('compose.yml','utf8'),schema=fs.readFileSync('migrations/001_init.sql','utf8'),grants=fs.readFileSync('migrations/002_runtime_permissions.sql','utf8');
const has=(s,x)=>assert.ok(s.includes(x),`Expected ${x}`);
test('all server actions have a UI trigger',()=>{for(const x of ['player.add','player.remove','game.start','game.stop','game.select','question.select','question.next','scan.award','winner.remove','award.undo'])has(server,`m.type==='${x}'`);for(const id of ['pair','playerCards','startGame','stopGame','gameHistory','questionSelect','previous','next','start','winners','undo'])has(html,`id="${id}"`)});
test('authentication roles and public display exist',()=>{for(const x of ["['host','display']",'display_tokens','host_sessions','auth.ok'])has(server,x);for(const x of ['id="roomName"','id="secret"','id="connect"','id="scoreList"'])has(board,x)});
test('database model covers rooms rounds players immutable score events and audit',()=>{for(const x of ['CREATE TABLE rooms','CREATE TABLE rounds','CREATE TABLE players','CREATE TABLE score_events','event_type','reverses_event_id','idempotency_key','CREATE TABLE audit_events'])has(schema,x)});
test('game model preserves legacy events and enforces a single active game and unique winners',()=>{
 const migration=fs.readFileSync('migrations/005_games.sql','utf8');
 for(const x of ['CREATE TABLE games','CREATE TABLE game_questions','CREATE TABLE question_winners','CREATE TABLE game_scans','one_active_game_per_room','WHERE ended_at IS NULL','PRIMARY KEY(question_id,player_id)','legacy_points'])has(migration,x);
 assert.ok(!migration.includes('DROP TABLE'));
});
test('runtime role is least privileged',()=>{for(const x of ['GRANT SELECT,INSERT,UPDATE,DELETE','REVOKE ALL ON schema_migrations','GRANT USAGE,SELECT ON SEQUENCE'])has(grants,x);assert.ok(!/GRANT ALL/i.test(grants))});
test('websocket and browser security controls are present',()=>{for(const x of ['maxPayload:16384','perMessageDeflate:false','Content-Security-Policy','X-Content-Type-Options','Strict-Transport-Security','ORIGINS.includes','timingSafeEqual'])has(server,x)});
test('operations and environment variable isolation are wired',()=>{for(const x of ['DATABASE_URL','SECRET_PEPPER','QR_ENCRYPTION_KEY','/healthz','/readyz'])has(server,x);for(const x of ['RUNTIME_DATABASE_URL','OWNER_DATABASE_URL','privilege-test','internal: true'])has(compose,x);assert.ok(!compose.includes('/run/secrets/'))});
test('responsive and accessible UI affordances exist',()=>{for(const x of ['aria-live','class="mobile','class="skip','id="feedback"'])has(html,x);for(const x of ['prefers-reduced-motion','prefers-color-scheme','focus-visible','@media(max-width:650px)'])has(css,x)});
test('feature matrix is non-empty and categorized',()=>{const m=JSON.parse(fs.readFileSync('test/feature-matrix.json'));assert.ok(Object.keys(m).length>=8);for(const [k,v] of Object.entries(m))assert.ok(v.length>0,`${k} empty`)});
