# ============================================================================
# Repara los GRAMOS del análisis de calidad de las boletas importadas.
# ----------------------------------------------------------------------------
# Al importar de AppSheet sólo había porcentajes, así que reconstruí los gramos
# usando una base fija de 100 g. Las tarjetas reales de CASFA demostraron que la
# base es el ORO OBTENIDO (boleta 313: 179+14+11+33 = 237 g = el oro), no 100.
#
# Las FRACCIONES guardadas están bien y no se tocan: son las que salen impresas
# en el recibo. Lo que se corrige son los gramos derivados y su base, para que
# la pantalla de captura muestre lo mismo que la tarjeta de papel.
#
#   zaranda_16_g = zaranda_16 × oro_g      (y z15, caracol, mancha)
#   analisis_g   = oro_g
#
# Sólo aplica a boletas con rendimiento medido (pergamino/cereza). El café que
# entró en oro y el cacao no llevan trilla, así que se quedan como están.
#
#   python scripts/reparar-gramos-calidad.py            # reporte, sin escribir
#   python scripts/reparar-gramos-calidad.py --commit   # escribe
# ============================================================================
import sys, os, re, json, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CAT = [('zaranda_16', 'zaranda_16_g'), ('zaranda_15', 'zaranda_15_g'),
       ('caracol', 'caracol_g'), ('mancha', 'mancha_g')]


def env(k):
    txt = open(os.path.join(ROOT, '.env.local'), encoding='utf8').read()
    m = re.search(rf'^{k}=(.*)$', txt, re.M)
    return m.group(1).strip() if m else None


URL = env('NEXT_PUBLIC_SUPABASE_URL').rstrip('/') + '/rest/v1/'
KEY = env('SUPABASE_SERVICE_ROLE_KEY')


def rest(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=h, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else []


def main():
    commit = '--commit' in sys.argv
    filas = rest('GET', 'entradas?select=id,folio,rendimiento,zaranda_16,zaranda_15,caracol,'
                        'mancha,oro_g,analisis_g,muestra_g&order=folio&limit=5000')

    arreglar, ok = [], 0
    for e in filas:
        if e['rendimiento'] is None or e['oro_g'] is None:
            continue                       # oro / cacao: no llevan trilla
        oro = float(e['oro_g'])
        if oro <= 0:
            continue
        base = e['analisis_g']
        if base is not None and abs(float(base) - oro) < 0.5:
            ok += 1
            continue                       # ya tiene la base correcta
        nuevo = {'analisis_g': round(oro)}
        for frac, gr in CAT:
            if e[frac] is not None:
                nuevo[gr] = round(float(e[frac]) * oro, 2)
        arreglar.append((e, nuevo))

    print(f'Boletas con rendimiento medido: {len(arreglar) + ok}')
    print(f'  ya correctas          : {ok}')
    print(f'  por reparar           : {len(arreglar)}')
    for e, n in arreglar[:5]:
        print(f"   #{e['folio']}: base {e['analisis_g']} → {n['analisis_g']} g "
              f"| z16 {e['zaranda_16_g'] if 'zaranda_16_g' in e else '?'} → {n.get('zaranda_16_g')}")

    if not commit:
        print('\n(dry-run — usa --commit para escribir)')
        return

    for i, (e, n) in enumerate(arreglar, start=1):
        rest('PATCH', f"entradas?id=eq.{e['id']}", n, 'return=minimal')
        if i % 50 == 0 or i == len(arreglar):
            print(f'  reparadas {i}/{len(arreglar)}')

    # Comprobación: los 4 montones deben sumar el oro obtenido.
    print('\nComprobación tras reparar:')
    v = rest('GET', 'entradas?select=folio,oro_g,analisis_g,zaranda_16_g,zaranda_15_g,caracol_g,'
                    'mancha_g&rendimiento=not.is.null&oro_g=not.is.null&limit=5000')
    malas = []
    for e in v:
        gs = [e[g] for _, g in CAT]
        if any(x is None for x in gs):
            continue
        suma = sum(float(x) for x in gs)
        if abs(suma - float(e['oro_g'])) > 1.0:
            malas.append((e['folio'], round(suma, 2), e['oro_g']))
    print(f'  revisadas {len(v)} · cuadran con el oro: {len(v) - len(malas)} · no cuadran: {len(malas)}')
    for m in malas[:8]:
        print(f'    #{m[0]}: suman {m[1]} g vs oro {m[2]} g')


if __name__ == '__main__':
    main()
