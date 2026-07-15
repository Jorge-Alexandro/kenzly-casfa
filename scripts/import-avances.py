# ============================================================================
# Importador de AVANCES (Agroecología) → agro_programa/tipo_taller/comunidad/avance
# ----------------------------------------------------------------------------
# Lee los xlsx de "AVANCES" (café y cultivos tropicales) y puebla la matriz de
# asistencia por comunidad × tipo de taller (F/M/Avance) + KPIs.
#
#   python scripts/import-avances.py            # parsea + reporte (SIN red)
#   python scripts/import-avances.py --commit   # + upsert idempotente (ESCRIBE)
# ============================================================================
import sys, os, re, json, zipfile, urllib.request
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = r'C:\Users\jorge\Documents\CASFA SIC FILES'

# --- Config por archivo (grupos de columnas distintos entre café y tropicales) -
FUENTES = [
    {
        'archivo': r'PROGRAMA CAFE\AVANCES CAFE 2023.2024.xlsx',
        'hoja': 'AVANCES 2023-2024',
        'programa': 'Café', 'ciclo': '2023-2024',
        'comunidad_col': 1, 'municipio_col': 2, 'socios_col': 3, 'data_row': 2,
        # Hoja aparte con hectáreas por comunidad (Has en col 4).
        'comunidades': {'hoja': 'COMUNIDADES', 'comunidad_col': 1, 'has_col': 4, 'data_row': 1},
        'tipos': [
            {'clave': 'bitacora', 'nombre': 'Bitácora', 'f': 4, 'm': 5, 'av': 6},
            {'clave': 'conservacion_suelo', 'nombre': 'Conservación de Suelo', 'f': 7, 'm': 8, 'av': 9},
            {'clave': 'zona_amortiguamiento', 'nombre': 'Zona Amort. y Rotulación', 'f': 10, 'm': 11, 'av': 12},
            {'clave': 'produccion_plantas', 'nombre': 'Producción de Plantas', 'f': 13, 'm': 14, 'av': 15},
            {'clave': 'control_plagas', 'nombre': 'Control de Plagas', 'f': 16, 'm': 17, 'av': 18},
        ],
    },
    {
        'archivo': r'PROGRAMACULTIVOSTROPICALES\Avances CT  2023.xlsx',
        'hoja': 'Avances CT',
        'programa': 'Cultivos Tropicales', 'ciclo': '2023',
        'comunidad_col': 0, 'municipio_col': 1, 'socios_col': 2, 'data_row': 2,
        'tipos': [
            {'clave': 'mip', 'nombre': 'MIP', 'marca': 3, 'f': 4, 'm': 5, 'av': 6},
            {'clave': 'bitacora', 'nombre': 'Bitácora', 'marca': 7, 'f': 8, 'm': 9, 'av': 10},
            {'clave': 'postcosecha', 'nombre': 'Manejo Postcosecha', 'marca': 11, 'f': 12, 'm': 13, 'av': 14},
            {'clave': 'poda', 'nombre': 'Poda', 'marca': 15, 'f': 16, 'm': 17, 'av': 18},
        ],
    },
]

def to_int(v):
    try: return int(float(str(v).replace(',', '.')))
    except Exception: return 0

def to_float(v):
    try: return float(str(v).replace(',', '.'))
    except Exception: return None

# --- Lector xlsx (stdlib) ----------------------------------------------------
def col_idx(ref):
    m = re.match(r'([A-Z]+)', ref); n = 0
    for ch in m.group(1): n = n * 26 + (ord(ch) - 64)
    return n - 1

def abrir(archivo):
    zf = zipfile.ZipFile(os.path.join(DATA_DIR, archivo))
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        t = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in t.findall(f'{NS}si'):
            shared.append(''.join(n.text or '' for n in si.iter(f'{NS}t')))
    return zf, shared

def leer_hoja(zf, shared, nombre):
    wb = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    relmap = {r.get('Id'): r.get('Target') for r in rels}
    target = None
    for sh in wb.find(f'{NS}sheets'):
        if sh.get('name') == nombre:
            t = relmap.get(sh.get(f'{RNS}id'), '')
            target = t if t.startswith('xl/') else 'xl/' + t
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

# --- Extracción --------------------------------------------------------------
def extraer(f):
    zf, shared = abrir(f['archivo'])
    filas = leer_hoja(zf, shared, f['hoja'])
    comunidades = []
    for celdas in filas[f['data_row']:]:
        com = celdas.get(f['comunidad_col'], '').strip()
        socios_raw = celdas.get(f['socios_col'], '')
        if not com or to_float(socios_raw) is None:
            continue
        socios = to_int(socios_raw)
        muni = celdas.get(f['municipio_col'], '').strip() or None
        celdas_taller = []
        for t in f['tipos']:
            fem = to_int(celdas.get(t['f'], 0))
            masc = to_int(celdas.get(t['m'], 0))
            av = to_float(celdas.get(t['av'], ''))
            if av is None:
                av = round((fem + masc) / socios, 4) if socios else 0
            marca = celdas.get(t.get('marca', -1), '') if 'marca' in t else ''
            impartido = bool(marca) or (fem + masc) > 0 or (av or 0) > 0
            celdas_taller.append({'clave': t['clave'], 'f': fem, 'm': masc,
                                  'avance': round(av, 4), 'impartido': impartido})
        comunidades.append({'comunidad': com, 'municipio': muni, 'socios': socios,
                            'tallers': celdas_taller})
    return comunidades

def extraer_hectareas(f):
    # {comunidad: hectareas} desde la hoja COMUNIDADES si existe.
    cfg = f.get('comunidades')
    if not cfg:
        return {}
    zf, shared = abrir(f['archivo'])
    out = {}
    for celdas in leer_hoja(zf, shared, cfg['hoja'])[cfg['data_row']:]:
        com = celdas.get(cfg['comunidad_col'], '').strip()
        has = to_float(celdas.get(cfg['has_col'], ''))
        if com and has is not None:
            out[com] = round(has, 2)
    return out

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
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else []

def upsert(path, rows, conflict):
    if not rows: return
    rest('POST', f'{path}?on_conflict={conflict}', rows,
         {'Prefer': 'resolution=merge-duplicates,return=minimal'})

# --- Main --------------------------------------------------------------------
def main():
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
    commit = '--commit' in sys.argv

    parsed = [(f, extraer(f)) for f in FUENTES]
    for f, coms in parsed:
        personas = sum(t['f'] + t['m'] for c in coms for t in c['tallers'])
        socios = sum(c['socios'] for c in coms)
        talleres = sum(1 for c in coms for t in c['tallers'] if t['impartido'])
        print(f"[{f['programa']} {f['ciclo']}] comunidades={len(coms)} socios={socios} "
              f"talleres_impartidos={talleres} asistencias(F+M)={personas}")

    if not commit:
        print('\n(Modo reporte. Usa --commit para escribir a Supabase.)')
        return

    org = rest('GET', 'organizaciones?select=id&slug=eq.casfa')[0]['id']
    for f, coms in parsed:
        # 1) programa
        upsert('agro_programa', [{'org_id': org, 'nombre': f['programa'], 'ciclo': f['ciclo']}],
               'org_id,nombre,ciclo')
        prog = rest('GET', f"agro_programa?select=id&nombre=eq.{urlq(f['programa'])}&ciclo=eq.{urlq(f['ciclo'])}")[0]['id']

        # 2) tipos de taller
        upsert('agro_tipo_taller',
               [{'org_id': org, 'programa_id': prog, 'clave': t['clave'], 'nombre': t['nombre'], 'orden': i}
                for i, t in enumerate(f['tipos'])], 'programa_id,clave')
        tipos = {r['clave']: r['id'] for r in rest('GET', f'agro_tipo_taller?select=id,clave&programa_id=eq.{prog}')}

        # 3) comunidades (+ hectáreas sólo si el programa tiene hoja COMUNIDADES;
        #    para los que no, se OMITE hectareas para no pisar ediciones manuales)
        has_map = extraer_hectareas(f)
        com_rows = []
        for i, c in enumerate(coms):
            row = {'org_id': org, 'programa_id': prog, 'comunidad': c['comunidad'],
                   'municipio': c['municipio'], 'socios': c['socios'], 'orden': i}
            if has_map:
                row['hectareas'] = has_map.get(c['comunidad'], 0)
            com_rows.append(row)
        upsert('agro_comunidad', com_rows, 'programa_id,comunidad')
        comid = {r['comunidad']: r['id'] for r in rest('GET', f'agro_comunidad?select=id,comunidad&programa_id=eq.{prog}&limit=5000')}

        # 4) avances
        rows = []
        for c in coms:
            cid = comid.get(c['comunidad'])
            if not cid: continue
            for t in c['tallers']:
                rows.append({'org_id': org, 'programa_id': prog, 'comunidad_id': cid,
                             'tipo_taller_id': tipos[t['clave']], 'impartido': t['impartido'],
                             'f': t['f'], 'm': t['m'], 'avance': t['avance']})
        upsert('agro_avance', rows, 'comunidad_id,tipo_taller_id')
        print(f"  → {f['programa']}: {len(coms)} comunidades, {len(rows)} avances escritos")
    print('Listo. Importación de avances completada.')

def urlq(s):
    return urllib.parse.quote(s)

import urllib.parse
if __name__ == '__main__':
    main()
