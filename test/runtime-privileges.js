'use strict';
const assert=require('node:assert/strict'),{Client}=require('pg');
const url=process.env.DATABASE_URL;
if(!url)throw new Error('DATABASE_URL is required');
const client=new Client({connectionString:url,application_name:'runtime-privilege-test'});
async function denied(sql){try{await client.query(sql);throw new Error(`Unexpectedly allowed: ${sql}`)}catch(e){if(e.message.startsWith('Unexpectedly allowed'))throw e;assert(['42501','42P01'].includes(e.code),`Expected privilege denial for ${sql}, got ${e.code}: ${e.message}`)}}
(async()=>{await client.connect();
 const role=(await client.query('select current_user u')).rows[0].u;assert.equal(role,'scanscore_runtime');
 const schema=(await client.query('select current_schema() s')).rows[0].s;assert.equal(schema,'public','runtime queries must resolve the public schema');
 const checks=(await client.query(`select
 has_database_privilege(current_user,'scanscore','CONNECT') connect,
 has_schema_privilege(current_user,'public','USAGE') usage,
 has_schema_privilege(current_user,'public','CREATE') create_schema,
 has_table_privilege(current_user,'rooms','SELECT') select_rooms,
 has_table_privilege(current_user,'rooms','INSERT') insert_rooms,
 has_table_privilege(current_user,'rooms','UPDATE') update_rooms,
 has_table_privilege(current_user,'rooms','DELETE') delete_rooms,
 has_table_privilege(current_user,'rooms','TRUNCATE') truncate_rooms,
 has_table_privilege(current_user,'rooms','REFERENCES') references_rooms,
 has_table_privilege(current_user,'rooms','TRIGGER') trigger_rooms`)).rows[0];
 for(const k of ['connect','usage','select_rooms','insert_rooms','update_rooms','delete_rooms'])assert.equal(checks[k],true,`${k} should be true`);
 for(const k of ['create_schema','truncate_rooms','references_rooms','trigger_rooms'])assert.equal(checks[k],false,`${k} should be false`);
 await client.query('BEGIN');await client.query("INSERT INTO audit_events(severity,event_type,outcome,correlation_id,metadata) VALUES('info','runtime_privilege_test','ok',gen_random_uuid(),'{}')");await client.query('ROLLBACK');
 await denied('CREATE TABLE runtime_forbidden(id integer)');
 await denied('TRUNCATE rooms');
 await denied('ALTER TABLE rooms ADD COLUMN runtime_forbidden integer');
 await denied('DROP TABLE rooms');
 const attrs=(await client.query("select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconnlimit from pg_roles where rolname=current_user")).rows[0];
 for(const k of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'])assert.equal(attrs[k],false,`${k} should be false`);assert.equal(attrs.rolconnlimit,20);
 console.log('Runtime privilege integration test passed');
})().finally(()=>client.end()).catch(e=>{console.error(e);process.exit(1)});
