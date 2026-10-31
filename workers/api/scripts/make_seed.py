"""Build workers/api/seed.sql from the versioned seed JSONs (stdlib only)."""
import json

R = '/Users/peter/Developer/injectivity'
ofac = json.load(open(R + '/data/seeds/ofac.json'))
ex = json.load(open(R + '/data/seeds/exploits.json'))
ofac_v = ofac['meta']['lists_branch_commit']
ex_v = ex['meta']['generated']


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


out = []
rows_ofac = []
rows_ex = []
for r in ofac['sanctioned']:
    rows_ofac.append(
        'INSERT OR REPLACE INTO risk_lists VALUES ('
        f"'OFAC SDN',{q(r['address'].lower())},{q(json.dumps(r['chains']))},'sanctioned',"
        f"{q('|'.join(r['assets']))},{q(r['source_url'])},{q(ofac_v)});"
    )
for e in ex['exploits']:
    src = (e.get('sources') or [''])[0]
    for h in e['hacker_addresses']:
        rows_ex.append(
            'INSERT OR REPLACE INTO risk_lists VALUES ('
            f"'exploit',{q(h['address'].lower())},{q(json.dumps([h['chain']]))},'attacker',"
            f"{q(e['protocol'] + ' / ' + h['label'])},{q(src)},{q(ex_v)});"
        )
    for v in e['victim_addresses']:
        rows_ex.append(
            'INSERT OR REPLACE INTO risk_lists VALUES ('
            f"'exploit',{q(v['address'].lower())},{q(json.dumps([v['chain']]))},'victim',"
            f"{q(e['protocol'] + ' / ' + v['label'])},{q(src)},{q(ex_v)});"
        )
out.append(f"INSERT OR REPLACE INTO seed_versions VALUES ('OFAC SDN',{q(ofac_v)},{q(ofac['meta']['fetched'])},{len(rows_ofac)});")
out.append(f"INSERT OR REPLACE INTO seed_versions VALUES ('exploit',{q(ex_v)},{q(ex_v)},{len(rows_ex)});")
out.extend(rows_ofac)
out.extend(rows_ex)
open(R + '/workers/api/sql/seed.sql', 'w').write('\n'.join(out) + '\n')
print(f'seed.sql: {len(rows_ofac)} ofac + {len(rows_ex)} exploit rows')
