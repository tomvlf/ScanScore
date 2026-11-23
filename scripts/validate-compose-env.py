import json,sys
cfg=json.load(sys.stdin); services=cfg['services']
expected={
'db':{'POSTGRES_PASSWORD','DB_RUNTIME_PASSWORD'},
'schema-upgrade':{'PGPASSWORD'},
'app':{'DATABASE_URL','SECRET_PEPPER','QR_ENCRYPTION_KEY'},
'privilege-test':{'DATABASE_URL'},
'functional-test':set()}
for svc,want in expected.items():
    env=services[svc].get('environment',{})
    missing=want-set(env)
    if missing: raise SystemExit(f'{svc}: missing environment variables {sorted(missing)}')
    if any(not env[x] for x in want): raise SystemExit(f'{svc}: empty environment variable')
    if any(k.endswith('_FILE') for k in env): raise SystemExit(f'{svc}: file-based secret variable found')
if 'secrets' in cfg: raise SystemExit('Compose must not configure file-based secrets')
if 'scanscore_runtime:' not in services['app']['environment']['DATABASE_URL']:
    raise SystemExit('app must receive the runtime database URL')
if services['db'].get('ports'): raise SystemExit('database must not publish ports')
if not cfg.get('networks',{}).get('backend',{}).get('internal'): raise SystemExit('backend network must be internal')
print('Compose environment validation passed')
