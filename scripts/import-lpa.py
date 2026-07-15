# ============================================================================
# Importador de LPA → certificación (Kenzly CASFA)
# ----------------------------------------------------------------------------
# Lee los archivos LPA .xlsx (entregables anuales a MAYACERT) y extrae, por
# CÓDIGO de productor, el nivel de certificación de cada año (T1→T2→T3→O) y las
# bajas. Puebla certificacion_estatus y productor_baja SIN crear productores:
# hace match por código contra el padrón ya existente en Supabase.
#
# Modos (seguros por defecto):
#   python scripts/import-lpa.py                 # parsea + reporte (SIN red)
#   python scripts/import-lpa.py --fetch         # + lee padrón y reporta match
#   python scripts/import-lpa.py --commit        # + upsert idempotente (ESCRIBE)
#
# Enfoque: estatus de certificación + bajas (la espina del LPA). La producción
# por cultivo es un segundo pase.
# ============================================================================
import sys, os, re, json, zipfile, urllib.request, urllib.error
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = r'C:\Users\jorge\Documents\CASFA SIC FILES'
SCRATCH = os.environ.get('LPA_OUT', os.path.join(HERE, 'lpa_import.json'))

# --- Config por archivo: dónde están el código y las columnas de estatus -----
# codigo_col / status_cols son índices de columna 0-based (como en el dump).
FUENTES = [
    {
        'archivo': 'LPA FINAL C. T  25 - 26 (4).xlsx',
        'hoja': 'LPA 24-25',
        'codigo_col': 6,
        'status_cols': {2023: 1, 2024: 2, 2025: 3, 2026: 4},
        'curp_col': 50, 'ine_col': 51,
        'bajas': {'hoja': ' BAJAS 25-26', 'codigo_col': 4, 'tipo_col': 0},
        # Hoja "Reducción de Superficie": código col2, ha 24-25 col4, ha 25-26 col5, redujo col6.
        'reduccion': {'match': 'educci', 'codigo_col': 2, 'ha_ant_col': 4, 'ha_act_col': 5,
                      'redujo_col': 6, 'data_row': 2, 'ciclo_ant': '2024-2025', 'ciclo_act': '2025-2026'},
    },
    {
        'archivo': 'LPA 2025-2026 CAFE ROBUSTA FINCA CHULA VISTA(Recuperado automáticamente)(Recuperado automáticamente).xlsx',
        'hoja': 'LPA ROBUSTEROS 2025',
        'codigo_col': 6,
        'status_cols': {2022: 1, 2023: 2, 2024: 3, 2025: 4},
        'curp_col': 8, 'ine_col': 7,
        'bajas': None,
    },
]

NIVEL_MAP = {'O': 'organico', 'ORGANICO': 'organico', 'ORGÁNICO': 'organico',
             'T1': 't1', 'T-1': 't1', 'T2': 't2', 'T-2': 't2', 'T3': 't3', 'T-3': 't3',
             'NUEVO': 'nuevo', 'N': 'nuevo'}

def norm_nivel(v):
    if not v:
        return None
    return NIVEL_MAP.get(str(v).strip().upper().replace(' ', ''))

def norm_codigo(v):
    if not v:
        return None
    c = str(v).strip().upper()
    m = re.match(r'^([A-Z]{2}\d+)', c)  # MX037003 / CR089001 (ignora sufijos -a)
    return m.group(1) if m else None

def to_float(v):
    try: return round(float(str(v).replace(',', '.')), 2)
    except Exception: return None

def tipo_baja(txt):
    t = (txt or '').upper()
    if 'DEFUN' in t: return 'defuncion'
    if 'SANCI' in t: return 'sancion'
    if 'VOLUNT' in t: return 'voluntaria'
    return 'otro'

# --- Lector xlsx (stdlib) ----------------------------------------------------
def col_idx(ref):
    m = re.match(r'([A-Z]+)', ref); n = 0
    for ch in m.group(1): n = n * 26 + (ord(ch) - 64)
    return n - 1

def leer_hoja(zf, shared, nombre_hoja):
    wb = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    relmap = {r.get('Id'): r.get('Target') for r in rels}
    target = None
    for sh in wb.find(f'{NS}sheets'):
        if sh.get('name') == nombre_hoja:
            t = relmap.get(sh.get(f'{RNS}id'), '')
            target = t if t.startswith('xl/') else 'xl/' + t
    if not target:
        return []
    root = ET.fromstring(zf.read(target))
    filas = []
    for row in root.iter(f'{NS}row'):
        celdas = {}
        for c in row.findall(f'{NS}c'):
            idx = col_idx(c.get('r', 'A1'))
            t = c.get('t'); v = c.find(f'{NS}v'); istr = c.find(f'{NS}is')
            if t == 's' and v is not None:
                val = shared[int(v.text)] if v.text and int(v.text) < len(shared) else ''
            elif t == 'inlineStr' and istr is not None:
                val = ''.join(n.text or '' for n in istr.iter(f'{NS}t'))
            elif v is not None:
                val = v.text
            else:
                val = ''
            celdas[idx] = (val or '').strip()
        filas.append(celdas)
    return filas

def find_hoja(zf, match):
    # Devuelve el nombre de la 1ª hoja que contenga `match` (case-insensitive).
    wb = ET.fromstring(zf.read('xl/workbook.xml'))
    for sh in wb.find(f'{NS}sheets'):
        nom = sh.get('name') or ''
        if match.lower() in nom.lower():
            return nom
    return None

def abrir(archivo):
    zf = zipfile.ZipFile(os.path.join(DATA_DIR, archivo))
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        t = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in t.findall(f'{NS}si'):
            shared.append(''.join(n.text or '' for n in si.iter(f'{NS}t')))
    return zf, shared

# --- Extracción --------------------------------------------------------------
def extraer():
    # por codigo: { 'estatus': {anio:nivel}, 'baja': {tipo} }
    reg = {}
    for f in FUENTES:
        zf, shared = abrir(f['archivo'])
        filas = leer_hoja(zf, shared, f['hoja'])
        for celdas in filas:
            cod = norm_codigo(celdas.get(f['codigo_col']))
            if not cod:
                continue
            entry = reg.setdefault(cod, {'estatus': {}, 'baja': None, 'curp': None, 'ine': None, 'fuentes': set()})
            entry['fuentes'].add(f['archivo'][:18])
            for anio, col in f['status_cols'].items():
                niv = norm_nivel(celdas.get(col))
                if niv:
                    entry['estatus'][anio] = niv  # último archivo gana si repite
            curp = (celdas.get(f.get('curp_col', -1), '') or '').strip()
            ine = (celdas.get(f.get('ine_col', -1), '') or '').strip()
            if curp: entry['curp'] = curp.upper()
            if ine: entry['ine'] = ine
        if f.get('bajas'):
            bf = f['bajas']
            for celdas in leer_hoja(zf, shared, bf['hoja']):
                cod = norm_codigo(celdas.get(bf['codigo_col']))
                if not cod:
                    continue
                reg.setdefault(cod, {'estatus': {}, 'baja': None, 'curp': None, 'ine': None, 'fuentes': set()})
                reg[cod]['baja'] = tipo_baja(celdas.get(bf['tipo_col']))
        if f.get('reduccion'):
            rf = f['reduccion']
            hoja = find_hoja(zf, rf['match'])
            if hoja:
                for celdas in leer_hoja(zf, shared, hoja)[rf['data_row']:]:
                    cod = norm_codigo(celdas.get(rf['codigo_col']))
                    if not cod:
                        continue
                    ha_ant = to_float(celdas.get(rf['ha_ant_col']))
                    ha_act = to_float(celdas.get(rf['ha_act_col']))
                    if ha_ant is None and ha_act is None:
                        continue
                    entry = reg.setdefault(cod, {'estatus': {}, 'baja': None, 'curp': None, 'ine': None, 'fuentes': set()})
                    entry['reduccion'] = {
                        'ha_ant': ha_ant, 'ha_act': ha_act,
                        'redujo': to_float(celdas.get(rf['redujo_col'])),
                        'ciclo_ant': rf['ciclo_ant'], 'ciclo_act': rf['ciclo_act'],
                    }
    return reg

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
        body = e.read().decode(errors='replace')
        print(f'\n!! {method} {path} → {e.code}: {body[:400]}')
        raise

def fetch_padron():
    # {codigo: (id, org_id)}
    filas = rest('GET', 'productores?select=id,codigo,org_id&limit=10000')
    return {p['codigo'].strip().upper(): (p['id'], p['org_id']) for p in filas if p.get('codigo')}

# --- Main --------------------------------------------------------------------
def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')  # consola cp1252 → evita crash con →/á
    except Exception:
        pass
    commit = '--commit' in sys.argv
    fetch = commit or '--fetch' in sys.argv

    reg = extraer()
    n_estatus = sum(len(e['estatus']) for e in reg.values())
    n_bajas = sum(1 for e in reg.values() if e['baja'])
    anios = sorted({a for e in reg.values() for a in e['estatus']})
    dist = {}
    for e in reg.values():
        for niv in e['estatus'].values():
            dist[niv] = dist.get(niv, 0) + 1

    n_curp = sum(1 for e in reg.values() if e.get('curp'))
    n_ine = sum(1 for e in reg.values() if e.get('ine'))
    n_red = sum(1 for e in reg.values() if e.get('reduccion'))
    print(f'Con reducción de superficie: {n_red}')
    print(f'Códigos en LPA: {len(reg)} | filas de estatus: {n_estatus} | bajas: {n_bajas}')
    print(f'Años detectados: {anios}')
    print(f'Distribución de niveles: {dist}')
    print(f'Con CURP: {n_curp} | con INE: {n_ine}')

    # Guarda JSON normalizado para inspección.
    out = {c: {'estatus': e['estatus'], 'baja': e['baja'], 'fuentes': sorted(e['fuentes'])}
           for c, e in reg.items()}
    with open(SCRATCH, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f'JSON normalizado → {SCRATCH}')

    if not fetch:
        print('\n(Modo reporte. Usa --fetch para ver match contra el padrón, --commit para escribir.)')
        return

    padron = fetch_padron()
    print(f'\nPadrón en Supabase: {len(padron)} productores')
    matched = [c for c in reg if c in padron]
    unmatched = [c for c in reg if c not in padron]
    print(f'Match por código: {len(matched)} | sin match: {len(unmatched)}')
    if unmatched:
        print('  Sin match (primeros 25):', ', '.join(sorted(unmatched)[:25]))

    if not commit:
        print('\n(Modo --fetch: sólo lectura. Usa --commit para escribir.)')
        return

    # Upsert idempotente.
    est_rows, baja_rows, red_rows = [], [], []
    curp_ine = 0
    for cod in matched:
        pid, org = padron[cod]
        for anio, niv in reg[cod]['estatus'].items():
            est_rows.append({'org_id': org, 'productor_id': pid, 'anio': anio,
                             'nivel': niv, 'origen': 'importacion'})
        if reg[cod]['baja']:
            baja_rows.append({'org_id': org, 'productor_id': pid,
                              'tipo': reg[cod]['baja'], 'motivo': 'Importado del LPA'})
        r = reg[cod].get('reduccion')
        if r:
            red_rows.append({'org_id': org, 'productor_id': pid,
                             'ciclo_anterior': r['ciclo_ant'], 'ciclo_actual': r['ciclo_act'],
                             'ha_anterior': r['ha_ant'], 'ha_actual': r['ha_act'], 'redujo': r['redujo']})
        # CURP/INE → PATCH productor (sólo campos con valor, no pisa con vacío)
        patch = {}
        if reg[cod].get('curp'): patch['curp'] = reg[cod]['curp']
        if reg[cod].get('ine'): patch['ine'] = reg[cod]['ine']
        if patch:
            rest('PATCH', f'productores?id=eq.{pid}', patch, {'Prefer': 'return=minimal'})
            curp_ine += 1

    def upsert(path, rows, conflict):
        for i in range(0, len(rows), 500):
            rest('POST', f'{path}?on_conflict={conflict}', rows[i:i + 500],
                 {'Prefer': 'resolution=merge-duplicates,return=minimal'})

    print(f'\nEscribiendo {len(est_rows)} estatus, {len(baja_rows)} bajas, {len(red_rows)} reducciones y CURP/INE de {curp_ine} productores…')
    upsert('certificacion_estatus', est_rows, 'productor_id,anio')
    upsert('productor_baja', baja_rows, 'productor_id')
    upsert('reduccion_superficie', red_rows, 'productor_id')
    print('Listo. Importación idempotente completada.')

if __name__ == '__main__':
    main()
