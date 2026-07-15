# Normaliza el campo `sexo` del padrón a M/F (Masculino/Femenino).
#   café (código CR) usa H/M (Hombre/Mujer)  -> H→M, M→F
#   tropical (código MX) usa M/F (Masculino/Femenino) -> sin cambio
#   'H'→'M' y 'F'→'F' siempre (no ambiguos). Sólo la 'M' depende del grupo.
#   python scripts/normalize-sexo.py           # reporte (sin red... usa red sólo para leer)
#   python scripts/normalize-sexo.py --commit  # aplica
import sys, os, re, json, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def env(k):
    txt = open(os.path.join(ROOT, '.env.local'), encoding='utf8').read()
    m = re.search(rf'^{k}=(.*)$', txt, re.M)
    return m.group(1).strip() if m else None

def rest(method, path, body=None, headers=None):
    url = env('NEXT_PUBLIC_SUPABASE_URL').rstrip('/') + '/rest/v1/' + path
    key = env('SUPABASE_SERVICE_ROLE_KEY')
    h = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else []

def main():
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    commit = '--commit' in sys.argv

    prods = rest('GET', 'productores?select=id,codigo,sexo,tipo_productor&limit=10000')

    # Reporte: distribución por prefijo de código.
    dist = {}
    for p in prods:
        pref = (p['codigo'] or '')[:2].upper()
        s = (p.get('sexo') or '∅')
        dist.setdefault(pref, {}).setdefault(s, 0)
        dist[pref][s] += 1
    print('Distribución de sexo por prefijo de código:')
    for pref in sorted(dist):
        print(f'  {pref}: {dist[pref]}')

    # Contradicciones: ¿algún CR con F, o algún MX con H?
    cr_f = [p['codigo'] for p in prods if (p['codigo'] or '').startswith('CR') and p.get('sexo') == 'F']
    mx_h = [p['codigo'] for p in prods if (p['codigo'] or '').startswith('MX') and p.get('sexo') == 'H']
    print(f'\nCR con F (inesperado): {len(cr_f)} {cr_f[:10]}')
    print(f'MX con H (inesperado): {len(mx_h)} {mx_h[:10]}')

    # Plan de cambios: sólo CR con H→M y CR con M→F.
    cambios = []
    for p in prods:
        cod = p['codigo'] or ''
        s = p.get('sexo')
        nuevo = None
        if cod.startswith('CR'):
            if s == 'H': nuevo = 'M'
            elif s == 'M': nuevo = 'F'
        else:  # MX y otros: ya en M/F, sólo por si hay 'H' suelto
            if s == 'H': nuevo = 'M'
        if nuevo and nuevo != s:
            cambios.append((p['id'], cod, s, nuevo))
    print(f'\nCambios a aplicar: {len(cambios)} (ej. {[(c[1],c[2],"→",c[3]) for c in cambios[:6]]})')

    if not commit:
        print('\n(Reporte. Usa --commit para aplicar.)')
        return
    for pid, cod, viejo, nuevo in cambios:
        rest('PATCH', f'productores?id=eq.{pid}', {'sexo': nuevo},
             {'Prefer': 'return=minimal'})
    print(f'\nListo. {len(cambios)} productores normalizados a M/F.')

if __name__ == '__main__':
    main()
