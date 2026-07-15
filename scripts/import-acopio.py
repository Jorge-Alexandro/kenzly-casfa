# ============================================================================
# Importador de Acopio (AppSheet → Kenzly CASFA)
# ----------------------------------------------------------------------------
# Lee "CASFA (1).xlsx", el export de la app de AppSheet "Cspa Acopio", y carga
# sus 311 entradas y 939 pesadas en las tablas `entradas` y `pesadas`.
#
# Decisiones:
#  · El FOLIO se conserva tal cual (el "ID de Entrada" de AppSheet es el folio
#    que salió impreso en las 311 boletas en PDF). Al terminar se deja el
#    contador de folios en el máximo, para que las entradas nuevas sigan la
#    numeración sin repetir ninguna.
#  · La CALIDAD histórica llega en fracciones ya calculadas (AppSheet no guardó
#    los gramos). Se reconstruyen los gramos con el mismo motor del manual
#    (lib/acopio/calidad.mjs) para que el histórico y lo nuevo se vean igual en
#    la pantalla de captura, y se guardan AMBOS.
#  · Los costales vienen separados por máquina (Plástico M1 / M2 …). Se guardan
#    por máquina y también sumados (que es lo que usa el cálculo de tara).
#  · El proveedor se liga al padrón por nombre cuando existe; si no, queda sólo
#    el nombre (hay proveedores que son empresas, no socios del padrón).
#  · Las fotos y firmas de AppSheet son rutas de SU almacenamiento
#    ("Entrada_Images/2.Firma Receptor.183832.png"): no tenemos los binarios,
#    así que NO se inventan URLs. Se dejan nulas; el PDF de esas 311 boletas ya
#    existe en CASFA ACOPIO FILES.
#
# Modos (seguros por defecto):
#   python scripts/import-acopio.py            # parsea + reporte (SIN red)
#   python scripts/import-acopio.py --fetch    # + lee padrón/catálogo y valida
#   python scripts/import-acopio.py --commit   # + inserta (ESCRIBE)
# ============================================================================
import sys, os, re, json, zipfile, datetime, unicodedata, urllib.request, urllib.error
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = r'C:\Users\jorge\Documents\CASFA SIC FILES\CASFA (1).xlsx'

# Excel guarda las fechas como días desde 1899-12-30.
EPOCH = datetime.date(1899, 12, 30)

# --- Lectura del xlsx (stdlib) ----------------------------------------------
def col_idx(ref):
    s = ''.join(c for c in ref if c.isalpha())
    n = 0
    for c in s:
        n = n * 26 + (ord(c) - 64)
    return n - 1

def leer(path):
    z = zipfile.ZipFile(path)
    ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
    shared = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ss]
    hojas = {}
    for nombre, sheet in (('Entrada', 'sheet1'), ('Pesada', 'sheet2')):
        root = ET.fromstring(z.read(f'xl/worksheets/{sheet}.xml'))
        filas = []
        for r in root.find(NS + 'sheetData'):
            celdas = {}
            for c in r.findall(NS + 'c'):
                v = c.find(NS + 'v')
                if c.get('t') == 's':
                    val = shared[int(v.text)] if v is not None else None
                else:
                    val = v.text if v is not None else None
                celdas[col_idx(c.get('r'))] = val
            filas.append([celdas.get(i) for i in range(max(celdas) + 1)] if celdas else [])
        hojas[nombre] = filas
    return hojas

def f(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except ValueError:
        return None

def i(v):
    x = f(v)
    return None if x is None else int(round(x))

def s(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None

def red(x, d):
    return None if x is None else round(x, d)

# --- Motor de calidad (mismas fórmulas que lib/acopio/calidad.mjs) -----------
MUESTRA_G, ANALISIS_G = 300, 100

def aplica_rendimiento(especie, tipo):
    """El café que entró ya en ORO no se acopió en pergamino/cereza: no hay
    rendimiento que medir. Al CACAO no se le hace análisis, sólo humedad."""
    return tipo != 'ORO' and especie != 'CACAO'

def gramos_desde_fracciones(e, especie, tipo):
    """Camino inverso del manual: de % guardado a los gramos que se pesaron."""
    con_rend = aplica_rendimiento(especie, tipo)
    g = lambda fr, base: None if fr is None else round(fr * base, 2)
    return {
        'oro_g': g(e['rendimiento'], MUESTRA_G) if con_rend else None,
        'zaranda_16_g': g(e['zaranda_16'], ANALISIS_G),
        'zaranda_15_g': g(e['zaranda_15'], ANALISIS_G),
        'caracol_g': g(e['caracol'], ANALISIS_G),
        'mancha_g': g(e['mancha'], ANALISIS_G),
        'muestra_g': MUESTRA_G if con_rend else None,
        'analisis_g': ANALISIS_G if e['zaranda_16'] is not None else None,
    }

# --- Parseo ------------------------------------------------------------------
def parsear():
    h = leer(XLSX)
    entradas, pesadas = {}, []

    for r in h['Entrada'][1:]:
        r = r + [None] * (31 - len(r))
        folio = i(r[0])
        if folio is None:
            continue
        fecha = r[1]
        fecha_iso = (EPOCH + datetime.timedelta(days=int(float(fecha)))).isoformat() if f(fecha) else None
        especie, tipo = s(r[5]), s(r[6])

        cal = {
            'rendimiento': f(r[12]), 'zaranda_16': f(r[13]), 'zaranda_15': f(r[14]),
            'caracol': f(r[15]), 'mancha': f(r[16]), 'humedad': f(r[17]),
        }
        # AppSheet guardaba rendimiento = 1.0 en el café oro y en el cacao. Eso
        # es relleno, no una medición: al oro no se le mide rendimiento (entró ya
        # trillado) y al cacao no se le hace análisis. Entra como NULL = no aplica.
        if not aplica_rendimiento(especie, tipo):
            cal['rendimiento'] = None
        gramos = gramos_desde_fracciones(cal, especie, tipo)

        loc = s(r[24]) or ''
        m = re.match(r'\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)', loc)

        entradas[folio] = {
            'folio': folio,
            'fecha_acopio': fecha_iso,
            'proveedor_nombre': s(r[2]) or 'SIN NOMBRE',
            'comunidad': s(r[3]),
            'municipio': s(r[4]),
            'especie': especie,
            'tipo': tipo,
            **cal,
            **gramos,
            'cosecha': s(r[18]),
            'comentarios': s(r[22]),
            'elaborado_por_nombre': s(r[23]),
            'lat': float(m.group(1)) if m else None,
            'lng': float(m.group(2)) if m else None,
            # Totales: NO los mandamos; el trigger los recalcula desde las pesadas.
            'estado': 'completada',
        }

    for r in h['Pesada'][1:]:
        r = r + [None] * (22 - len(r))
        folio = i(r[0])
        if folio is None or folio not in entradas:
            continue
        p = {
            'folio': folio,
            'numero_pesada': i(r[1]) or 1,
            'm1_sacos': i(r[3]) or 0,
            'm1_plastico': i(r[4]) or 0,
            'm1_yute': i(r[5]) or 0,
            'm1_henequen': i(r[6]) or 0,
            'm1_kgs': red(f(r[7]) or 0, 2),
            'm2_sacos': i(r[8]) or 0,
            'm2_plastico': i(r[9]) or 0,
            'm2_yute': i(r[10]) or 0,
            'm2_henequen': i(r[11]) or 0,
            'm2_kgs': red(f(r[12]) or 0, 2),
            'sacos_total': i(r[13]) or 0,
            'kg_brutos': red(f(r[14]) or 0, 2),
            'tara_kg': red(f(r[18]) or 0, 2),
            'kg_netos': red(f(r[19]) or 0, 2),
            'quintales': red(f(r[20]), 2),
        }
        p['plastico'] = p['m1_plastico'] + p['m2_plastico']
        p['yute'] = p['m1_yute'] + p['m2_yute']
        p['henequen'] = p['m1_henequen'] + p['m2_henequen']
        # El cacao no lleva quintal (factor null) → N/A, no 0.
        if entradas[folio]['especie'] == 'CACAO' or not p['quintales']:
            p['quintales'] = None if entradas[folio]['especie'] == 'CACAO' else p['quintales']
        pesadas.append(p)

    return entradas, pesadas

# --- Supabase REST -----------------------------------------------------------
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
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print(f'\n!! {method} {path} → {e.code}: {e.read().decode(errors="replace")[:500]}')
        raise

def norm_nombre(n):
    """Liga el proveedor de Acopio con el padrón. Los dos escriben el mismo
    nombre distinto, siempre de la misma manera:

      · acentos    — 'Angelina Sánchez Velázquez'  vs  'ANGELINA SANCHEZ VELAZQUEZ'
      · s/z        — 'Lasaro Lopez Moralez'        vs  'LAZARO LOPEZ MORALES'
      · h muda     — 'Ermelindo'                   vs  'HERMELINDO'
      · espacios   — 'Morales  Velázquez'

    Plegamos las tres cosas. NO usamos coincidencia difusa: con nombres tan
    parecidos ('Angel Perez Garcia' vs 'Elia Pérez García', 0.86 de similitud)
    ligaría al productor equivocado, y una entrega mal atribuida es peor que una
    sin atribuir.
    """
    n = unicodedata.normalize('NFD', (n or '').upper())
    n = ''.join(c for c in n if unicodedata.category(c) != 'Mn')  # acentos
    n = n.replace('Ñ', 'N')
    n = re.sub(r'[^A-Z ]', ' ', n)
    n = n.replace('Z', 'S').replace('H', '')                      # s/z y h muda
    return re.sub(r'\s+', ' ', n).strip()

# --- Main --------------------------------------------------------------------
def main():
    fetch = '--fetch' in sys.argv or '--commit' in sys.argv
    commit = '--commit' in sys.argv

    entradas, pesadas = parsear()
    print(f'Parseado: {len(entradas)} entradas, {len(pesadas)} pesadas')
    from collections import Counter
    print('  por producto:', dict(Counter(f"{e['especie']} {e['tipo']}" for e in entradas.values())))
    print('  folios:', min(entradas), '→', max(entradas))
    sin_pesada = set(entradas) - {p['folio'] for p in pesadas}
    if sin_pesada:
        print(f'  ¡{len(sin_pesada)} entradas sin pesadas!: {sorted(sin_pesada)[:10]}')

    if not fetch:
        print('\n(sin red — usa --fetch para validar contra la base, --commit para escribir)')
        return

    org = rest('GET', 'organizaciones?select=id,slug&slug=eq.casfa')
    if not org:
        print('!! no existe la organización casfa'); return
    org_id = org[0]['id']

    # Padrón: match por nombre normalizado.
    padron = rest('GET', 'productores?select=id,nombre_completo&limit=5000')
    por_nombre = {}
    for p in padron:
        por_nombre.setdefault(norm_nombre(p['nombre_completo']), p['id'])

    ligados = 0
    for e in entradas.values():
        pid = por_nombre.get(norm_nombre(e['proveedor_nombre']))
        e['productor_id'] = pid
        e['org_id'] = org_id
        if pid:
            ligados += 1
    print(f'\nProveedores ligados al padrón: {ligados}/{len(entradas)}'
          f' ({len(entradas) - ligados} son empresas/acopiadores fuera del padrón)')

    # Combos especie/tipo que no estén en el catálogo romperían el cálculo.
    cat = rest('GET', f'acopio_producto?select=especie,tipo&org_id=eq.{org_id}')
    combos = {(c['especie'], c['tipo']) for c in cat}
    faltan = {(e['especie'], e['tipo']) for e in entradas.values()} - combos
    if faltan:
        print(f'!! combos fuera del catálogo acopio_producto: {faltan}')
        return
    print('Catálogo de productos: todos los combos existen ✓')

    ya = rest('GET', f'entradas?select=folio&org_id=eq.{org_id}&limit=5000')
    if ya:
        print(f'\n!! Ya hay {len(ya)} entradas en la base (folios {sorted(y["folio"] for y in ya)}).')
        if not commit:
            print('   Con --commit se BORRAN antes de importar (--purgar) o se aborta.')
            return
        if '--purgar' not in sys.argv:
            print('   Este importador NO reescribe. Añade --purgar para borrarlas primero.')
            return
        # Las pesadas se van solas (on delete cascade).
        rest('DELETE', f'entradas?org_id=eq.{org_id}', headers={'Prefer': 'return=minimal'})
        print(f'   Borradas las {len(ya)} entradas previas (eran pruebas de desarrollo).')

    if not commit:
        print('\n(dry-run — usa --commit para escribir)')
        return

    # 1) entradas
    filas = list(entradas.values())
    ids = {}
    for k in range(0, len(filas), 100):
        lote = filas[k:k + 100]
        res = rest('POST', 'entradas?select=id,folio', lote, {'Prefer': 'return=representation'})
        for r in res:
            ids[r['folio']] = r['id']
        print(f'  entradas {k + len(lote)}/{len(filas)}')

    # 2) pesadas (el trigger recalcula los totales de cada entrada)
    filas_p = []
    for p in pesadas:
        q = dict(p)
        folio = q.pop('folio')
        q['entrada_id'] = ids[folio]
        q['org_id'] = org_id
        filas_p.append(q)
    for k in range(0, len(filas_p), 200):
        lote = filas_p[k:k + 200]
        rest('POST', 'pesadas', lote, {'Prefer': 'return=minimal'})
        print(f'  pesadas {k + len(lote)}/{len(filas_p)}')

    # 3) el contador de folios continúa donde se quedó AppSheet
    ultimo = max(entradas)
    rest('POST', 'acopio_contador',
         [{'org_id': org_id, 'ultimo_folio': ultimo}],
         {'Prefer': 'resolution=merge-duplicates'})
    print(f'\nContador de folio → {ultimo} (la próxima entrada será la #{ultimo + 1})')

    tot = rest('GET', f'entradas?select=folio,kg_netos,quintales&org_id=eq.{org_id}&limit=5000')
    print(f'\nEn la base: {len(tot)} entradas · '
          f'{sum(float(t["kg_netos"] or 0) for t in tot):,.2f} kg netos · '
          f'{sum(float(t["quintales"] or 0) for t in tot):,.2f} quintales')

if __name__ == '__main__':
    main()
