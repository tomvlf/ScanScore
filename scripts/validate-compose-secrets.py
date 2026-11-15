import json,sys
cfg=json.load(open(sys.argv[1])); services=cfg['services']
def names(service):
    out=set()
    for x in services[service].get('secrets',[]): out.add(x if isinstance(x,str) else x.get('source'))
    return out
expected={
'db':{'db_owner_password','db_runtime_password'},
'migrate':{'owner_database_url'},
'app':{'runtime_database_url','secret_pepper','qr_encryption_key'},
'privilege-test':{'runtime_database_url'},
'functional-test':set()}
for svc,want in expected.items():
    got=names(svc)
    if got!=want: raise SystemExit(f'{svc}: secrets {sorted(got)} != expected {sorted(want)}')
if 'owner_database_url' in names('app') or 'db_owner_password' in names('app'):
    raise SystemExit('app must never receive owner credentials')
if 'runtime_database_url' in names('migrate'):
    raise SystemExit('migrate must not receive runtime credentials')
if services['db'].get('ports'): raise SystemExit('database must not publish ports')
if not cfg.get('networks',{}).get('backend',{}).get('internal'): raise SystemExit('backend network must be internal')
print('Compose secrets validation passed')
