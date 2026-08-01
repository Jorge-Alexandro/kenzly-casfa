# ============================================================================
# Importador de Agroecología: plantillas de taller + los 117 talleres históricos
# ----------------------------------------------------------------------------
# Lee los reportes .docx que hoy se escriben a mano y carga DOS cosas:
#
#   1. agro_plantilla_taller — el texto fijo, una por (programa, tipo de taller).
#      Se toma el reporte MÁS COMPLETO de cada tipo (el que trae más secciones
#      llenas) como canónico y se le sustituyen los datos del evento por
#      marcadores: {comunidad} {municipio} {fecha_larga} {tecnico}
#      {hora_inicio} {hora_fin}. Así el 63–80% que hoy se reescribe queda una
#      sola vez.
#
#   2. agro_taller — los 117 eventos: comunidad, municipio, fecha, horas,
#      técnico. Marcados historico=true; su lista de asistencia se firmó en
#      papel y vive escaneada en los PDF viejos, por eso lista_id va en null.
#
# Modos:
#   python scripts/import-agro-talleres.py            # parsea + reporte (sin red)
#   python scripts/import-agro-talleres.py --fetch    # + valida contra la base
#   python scripts/import-agro-talleres.py --commit   # + escribe
# ============================================================================
import sys, os, re, json, glob, zipfile, unicodedata, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = r'C:/Users/jorge/Documents/CASFA SIC FILES'

RAICES = {
    'PROGRAMA CAFE': ('Café', '2023-2024'),
    'PROGRAMACULTIVOSTROPICALES': ('Cultivos Tropicales', '2023'),
}

# Carpetas que NO son reportes de taller aunque su nombre lo parezca:
# MATERIALES DE CAPACITACION guarda el material didáctico (folletos, guías),
# no las actas de las reuniones. Ahí vive "PLAGAS Y ENFERMEDADES/MIP.docx",
# que es un folleto de 4 párrafos y se colaba como si fuera un reporte.
CARPETAS_EXCLUIDAS = ('MATERIALES DE CAPACITACION',)

CARPETA_A_TIPO = {
    'TALLER.BITACORA.ACT': 'bitacora',
    'TALLER BITACORA': 'bitacora',
    'TALLER CONSER. SUELO': 'conservacion_suelo',
    'TALLER ZONA.AMORT Y ROTULACION.AREAS': 'zona_amortiguamiento',
    'TALLER.PRODUCCION.TRASPLANTESCAFE': 'produccion_plantas',
    'TALLER CONTROL.PLAGAS.ENFERMEDADES': 'control_plagas',
    'PLAGAS Y ENFERMEDADES': 'control_plagas',
    'TALLER MIP': 'mip',
    'TALLER MANEJO POSTCOSECHA': 'postcosecha',
    'TALLER PODA': 'poda',
}

MESES = {'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
         'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
         'noviembre': 11, 'diciembre': 12}

# El mismo técnico firma con 6 grafías distintas; se pliegan por nombre de pila.
TECNICOS = {'seydi': 'Ing. Seydi Pérez García', 'kevin': 'Ing. Kevin Mateo García',
            'ivan': 'Ing. Iván Román'}


def norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().strip()


# El reporte y el catálogo escriben la misma comunidad distinto:
#   'Chanjale'         vs 'Chanjale Salchiji'
#   'Córdova Matasanos' vs 'Cordova Matazano'      (s/z)
#   'Piedra Partida'   vs 'Ej. Piedra Partida'     (prefijo)
#   'Toquian Las Nubes' vs 'Toquian y las nubes'   ('y' de enlace)
# Se pliega a un NÚCLEO comparable: fuera prefijos genéricos, fuera 'y', z→s.
PREFIJOS = (r'ej\.?|ejd\.?|ejido|rancheria|ranch\.?|barrio|b\.|canton|fraccion|'
            r'fracc\.?|propiedad|comunidad|com\.?|colonia|col\.?|seccion|secc\.?|'
            r'\d+(?:ra|da|a|er)?\.?')


def nucleo_comunidad(s):
    t = norm(s)
    t = re.sub(r'[^a-z0-9 ]', ' ', t)
    t = re.sub(r'^(?:(?:' + PREFIJOS + r')\s+)+', '', t)
    t = re.sub(r'\b(?:de|del|la|las|los|el|y)\b', ' ', t)
    t = t.replace('z', 's')
    # Singular: 'Matasanos' vs 'Matazano', 'las Nubes' vs 'la Nube'.
    palabras = [re.sub(r'e?s$', '', p) if len(p) > 3 else p for p in t.split()]
    return re.sub(r'\s+', ' ', ' '.join(palabras)).strip()


def es_prefijo(a, b):
    """'chanjale' ⊂ 'chanjale salchiji' — el catálogo suele traer el nombre
    largo y el reporte el corto (o al revés). Se exige corte en palabra
    completa para que 'san' no enganche 'santa'."""
    if not a or not b:
        return False
    return a == b or a.startswith(b + ' ') or b.startswith(a + ' ')


# --------------------------------------------------------------- lectura docx
def parrafos(path):
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml').decode('utf8', errors='replace')
    out = []
    for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S):
        # <w:t(?:\s[^>]*)?> y NO <w:t[^>]*>: el segundo engancha <w:tabs> y mete
        # XML crudo como si fuera texto.
        t = ''.join(re.findall(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', p, re.S))
        t = (t.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
              .replace('&quot;', '"').replace('&apos;', "'"))
        t = re.sub(r'\s+', ' ', t).strip()
        if t:
            out.append(t)
    return out


ROTULOS = [
    ('nombre del taller', 'nombre_taller'), ('lugar', 'lugar'), ('fecha', 'fecha'),
    ('participantes', 'participantes'),
    ('asesores', 'asesores'), ('capacitador', 'asesores'), ('capacitadores', 'asesores'),
    ('introduccion', 'introduccion'),
    ('objetivo general', 'objetivo_general'), ('objetivos generales', 'objetivo_general'),
    ('objetivo', 'objetivo_general'),
    ('objetivos especificos', 'objetivos_especificos'), ('objetivo especifico', 'objetivos_especificos'),
    ('ficha descriptiva', 'ficha_descriptiva'), ('carta descriptiva', 'ficha_descriptiva'),
    ('inicio y presentacion', 'inicio'),
    ('desarrollo del taller', 'desarrollo'), ('desarrollo', 'desarrollo'),
    ('acuerdos', 'acuerdos'), ('acuerdo', 'acuerdos'),
    ('cierre del taller', 'cierre'), ('cierre de reunion', 'cierre'),
    ('comentarios finales', 'cierre'),
    ('conclusiones', 'conclusiones'), ('conclusion', 'conclusiones'),
    # Terminadores: de aquí en adelante son fotos y la lista firmada.
    ('anexos', 'anexos'), ('anexo', 'anexos'), ('lista de asistencia', 'anexos'),
    ('evidencias fotograficas', 'anexos'), ('evidencia fotografica', 'anexos'),
]
MAPA = dict(ROTULOS)


def secciones(paras):
    out, actual = {}, None
    for p in paras:
        clave = MAPA.get(norm(p).rstrip(':').rstrip('.'))
        if clave:
            actual = clave
            out.setdefault(actual, [])
            continue
        if actual:
            out[actual].append(p)
    return out


# --------------------------------------------------------------- parseo campos
def parsear_fecha(texto):
    if not texto:
        return None
    t = norm(texto)
    m = re.search(r'(\d{1,2})\s*de\s+([a-z]+)\s+de[l]?\s+(\d{4})', t)
    if m and m.group(2) in MESES:
        return f'{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}'
    m = re.search(r'(\d{1,2})[./](\d{1,2})[./](\d{2,4})', t)
    if m:
        a = int(m.group(3))
        a = 2000 + a if a < 100 else a
        return f'{a}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    return None


def parsear_lugar(texto):
    if not texto:
        return None, None
    t = texto.strip().rstrip('.')
    m = re.match(r'^(.*?),\s*(?:municipio\s+de\s+)?(.*?)(?:[,\s]+Chiapas)?$', t, re.I)
    if m:
        com, mun = m.group(1).strip(), m.group(2).strip()
        mun = re.sub(r'^municipio\s+(de\s+)?', '', mun, flags=re.I).strip()
        return com, (mun or None)
    partes = [x.strip() for x in t.split(',') if x.strip() and norm(x) != 'chiapas']
    if len(partes) >= 2:
        return partes[0], partes[1]
    return (partes[0] if partes else None), None


def parsear_hora(paras, cual):
    pat = (r'dio\s+inicio\s+a\s+las\s+([\d:.]+\s*[ap]?\.?\s?m?\.?)' if cual == 'inicio'
           else r'finaliz[oó]\s+a\s+las\s+([\d:.]+\s*[ap]?\.?\s?m?\.?)')
    for p in paras:
        m = re.search(pat, p, re.I)
        if m:
            return m.group(1).strip().rstrip('.')
    return None


def parsear_tecnico(paras):
    for p in paras:
        m = re.search(r'\b(?:Ing\.?|Tec\.?|M\.?C\.?)\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+){0,3})', p)
        if m:
            crudo = m.group(1).strip()
            pila = norm(crudo).split()[0] if crudo else ''
            return TECNICOS.get(pila, f'Ing. {crudo}')
    return None


def leer_reporte(path, programa, ciclo, tipo):
    paras = parrafos(path)
    s = secciones(paras)
    uno = lambda k: (s.get(k) or [None])[0]
    lugar_txt = uno('lugar')
    comunidad, municipio = parsear_lugar(lugar_txt)
    fecha_txt = uno('fecha')
    return {
        'path': path, 'archivo': os.path.basename(path),
        'programa': programa, 'ciclo': ciclo, 'tipo': tipo,
        'secciones': s, 'paras': paras,
        'nombre_taller': uno('nombre_taller'),
        'comunidad': comunidad, 'municipio': municipio,
        'fecha': parsear_fecha(fecha_txt) or parsear_fecha(os.path.basename(path)),
        'fecha_txt': fecha_txt,
        'hora_inicio': parsear_hora(paras, 'inicio'),
        'hora_fin': parsear_hora(paras, 'fin'),
        'tecnico': parsear_tecnico(paras),
    }


# ------------------------------------------------- plantilla con marcadores
def a_marcadores(texto, r):
    """Sustituye los datos del evento por {marcadores} en el texto canónico."""
    if not texto:
        return texto
    out = texto
    for valor, marca in [
        (r.get('fecha_txt'), '{fecha_larga}'),
        (r.get('comunidad'), '{comunidad}'),
        (r.get('municipio'), '{municipio}'),
        (r.get('hora_inicio'), '{hora_inicio}'),
        (r.get('hora_fin'), '{hora_fin}'),
    ]:
        if valor:
            out = re.sub(re.escape(valor), marca, out, flags=re.I)
    # El técnico aparece con varias grafías dentro del mismo documento
    # ("Ing. Seydi", "La Ing. Seydi Pérez", "Seydi PG"): se marcan todas.
    for pila in TECNICOS:
        out = re.sub(r'\b(?:Ing\.?|Tec\.?|M\.?C\.?)\s*' + pila + r'[\wÁÉÍÓÚÑáéíóúñ]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+){0,3}',
                     '{tecnico}', out, flags=re.I)
    return out


def construir_plantilla(reportes):
    """Toma el reporte más completo del grupo como canónico."""
    def puntaje(r):
        s = r['secciones']
        claves = ['introduccion', 'objetivo_general', 'objetivos_especificos',
                  'ficha_descriptiva', 'desarrollo', 'acuerdos', 'conclusiones']
        return sum(1 for k in claves if s.get(k)) * 1000 + len(r['paras'])

    canon = max(reportes, key=puntaje)
    s = canon['secciones']
    junta = lambda k: a_marcadores('\n\n'.join(s.get(k, [])), canon) or None
    return {
        'nombre_taller': canon['nombre_taller'] or '',
        'participantes': junta('participantes'),
        'asesores': junta('asesores'),
        'introduccion': junta('introduccion'),
        'objetivo_general': junta('objetivo_general'),
        'objetivos_especificos': [a_marcadores(x, canon) for x in s.get('objetivos_especificos', [])],
        # El cuadro llega como lista plana de celdas; se guarda tal cual para
        # que se pueda acomodar en la app sin perder nada.
        'ficha_descriptiva': [a_marcadores(x, canon) for x in s.get('ficha_descriptiva', [])],
        'desarrollo': junta('desarrollo') or junta('inicio'),
        'acuerdos': junta('acuerdos'),
        'conclusiones': junta('conclusiones') or junta('cierre'),
        'origen_archivo': canon['archivo'],
        '_canon_path': canon['path'],
        '_n_reportes': len(reportes),
    }


# --------------------------------------------------------------- Supabase REST
def env(k):
    txt = open(os.path.join(ROOT, '.env.local'), encoding='utf8').read()
    m = re.search(rf'^{k}=(.*)$', txt, re.M)
    return m.group(1).strip() if m else None


def rest(method, path, body=None, prefer=None):
    url = env('NEXT_PUBLIC_SUPABASE_URL').rstrip('/') + '/rest/v1/' + path
    key = env('SUPABASE_SERVICE_ROLE_KEY')
    h = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print(f'\n!! {method} {path} → {e.code}: {e.read().decode(errors="replace")[:400]}')
        raise


# ------------------------------------------------------------------------ main
def main():
    fetch = '--fetch' in sys.argv or '--commit' in sys.argv
    commit = '--commit' in sys.argv

    reportes = []
    for raiz, (prog, ciclo) in RAICES.items():
        for d in sorted(glob.glob(os.path.join(BASE, raiz, '**', '*.docx'), recursive=True)):
            if os.path.basename(d).startswith('~'):
                continue
            if any(x in d.upper() for x in CARPETAS_EXCLUIDAS):
                continue
            tipo = CARPETA_A_TIPO.get(os.path.basename(os.path.dirname(d)))
            if not tipo:
                continue
            reportes.append(leer_reporte(d, prog, ciclo, tipo))

    print(f'Reportes leídos: {len(reportes)}')
    faltan_fecha = [r for r in reportes if not r['fecha']]
    faltan_com = [r for r in reportes if not r['comunidad']]
    print(f'  sin fecha: {len(faltan_fecha)}  ·  sin comunidad: {len(faltan_com)}')
    for r in (faltan_fecha + faltan_com)[:5]:
        print(f'    - {r["archivo"]}')

    grupos = {}
    for r in reportes:
        grupos.setdefault((r['programa'], r['tipo']), []).append(r)

    print(f'\nPlantillas a construir: {len(grupos)}')
    plantillas = {}
    for k, g in sorted(grupos.items()):
        p = construir_plantilla(g)
        plantillas[k] = p
        secs = sum(1 for c in ('introduccion', 'objetivo_general', 'desarrollo',
                               'acuerdos', 'conclusiones') if p.get(c))
        print(f'  {k[0]:20} {k[1]:22} de {p["_n_reportes"]:2} reportes · '
              f'{secs}/5 secciones · canónico: {p["origen_archivo"][:38]}')

    if not fetch:
        print('\n(sin red — usa --fetch para validar contra la base, --commit para escribir)')
        return

    # ---- validación contra la base -----------------------------------------
    org = rest('GET', 'organizaciones?select=id&slug=eq.casfa')[0]['id']
    progs = rest('GET', f'agro_programa?select=id,nombre,ciclo&org_id=eq.{org}')
    prog_id = {(p['nombre'], p['ciclo']): p['id'] for p in progs}
    tipos = rest('GET', 'agro_tipo_taller?select=id,clave,programa_id')
    tipo_id = {(t['programa_id'], t['clave']): t['id'] for t in tipos}
    comus = rest('GET', 'agro_comunidad?select=id,comunidad,municipio,programa_id&limit=1000')

    print('\n=== enlace con el catálogo ===')
    faltan_prog = {(r['programa'], r['ciclo']) for r in reportes} - set(prog_id)
    print(f'  programas sin match: {faltan_prog or "ninguno"}')

    faltan_tipo = set()
    for r in reportes:
        pid = prog_id.get((r['programa'], r['ciclo']))
        if pid and (pid, r['tipo']) not in tipo_id:
            faltan_tipo.add((r['programa'], r['tipo']))
    print(f'  tipos de taller sin match: {faltan_tipo or "ninguno"}')

    # Comunidad: primero por nombre exacto plegado; si no, por NÚCLEO (sin
    # prefijos genéricos ni 'y', con z→s). El núcleo se acepta sólo si el
    # municipio coincide y la coincidencia es ÚNICA — con 68 comunidades muy
    # parecidas, ligar a la equivocada atribuiría el taller a otra comunidad,
    # que es peor que dejarlo sin ligar (el nombre en texto se guarda igual).
    exacto, por_nucleo = {}, {}
    for c in comus:
        exacto[(c['programa_id'], norm(c['comunidad']))] = c['id']
        por_nucleo.setdefault((c['programa_id'], nucleo_comunidad(c['comunidad'])), []).append(c)

    ligadas = por_nuc = sin_ligar = 0
    ejemplos, ambiguas = [], []
    for r in reportes:
        pid = prog_id.get((r['programa'], r['ciclo']))
        cid = None
        if pid and r['comunidad']:
            cid = exacto.get((pid, norm(r['comunidad'])))
            if not cid:
                nr = nucleo_comunidad(r['comunidad'])
                cands = list(por_nucleo.get((pid, nr), []))
                if not cands:   # nadie con el mismo núcleo: se prueba por prefijo
                    cands = [c for c in comus
                             if c['programa_id'] == pid and es_prefijo(nr, nucleo_comunidad(c['comunidad']))]
                if r['municipio'] and len(cands) > 1:
                    mn = nucleo_comunidad(r['municipio'])
                    filtrados = [c for c in cands if nucleo_comunidad(c['municipio']) == mn]
                    cands = filtrados or cands
                if len(cands) == 1:
                    cid = cands[0]['id']
                    por_nuc += 1
                elif len(cands) > 1 and len(ambiguas) < 6:
                    ambiguas.append(f'{r["comunidad"]} → {[c["comunidad"] for c in cands]}')
        r['_comunidad_id'] = cid
        if cid:
            ligadas += 1
        else:
            sin_ligar += 1
            if r['comunidad'] and len(ejemplos) < 12:
                ejemplos.append(f'{r["programa"][:6]}/{r["comunidad"]} ({r["municipio"]})')
    print(f'  comunidades ligadas: {ligadas}/{len(reportes)}  '
          f'(exactas: {ligadas - por_nuc}, por núcleo: {por_nuc}, sin ligar: {sin_ligar})')
    if ambiguas:
        print('    ambiguas (NO se ligan, varias candidatas):')
        for a in ambiguas:
            print(f'      · {a}')
    if ejemplos:
        print('    sin ligar (se guardan igual, con el nombre en texto):')
        for e in ejemplos:
            print(f'      · {e}')

    if not commit:
        print('\n(dry-run — usa --commit para escribir)')
        return

    # ---- escritura ----------------------------------------------------------
    print('\n--- escribiendo plantillas ---')
    filas_p = []
    for (prog, tipo), p in plantillas.items():
        ciclo = next(r['ciclo'] for r in reportes if r['programa'] == prog)
        pid = prog_id[(prog, ciclo)]
        filas_p.append({
            'org_id': org, 'programa_id': pid, 'tipo_taller_id': tipo_id[(pid, tipo)],
            'nombre_taller': p['nombre_taller'] or tipo.replace('_', ' ').title(),
            'participantes': p['participantes'], 'asesores': p['asesores'],
            'introduccion': p['introduccion'], 'objetivo_general': p['objetivo_general'],
            'objetivos_especificos': p['objetivos_especificos'],
            'ficha_descriptiva': p['ficha_descriptiva'],
            'desarrollo': p['desarrollo'], 'acuerdos': p['acuerdos'],
            'conclusiones': p['conclusiones'], 'origen_archivo': p['origen_archivo'],
        })
    rest('POST', 'agro_plantilla_taller',
         filas_p, 'resolution=merge-duplicates,return=minimal')
    print(f'  {len(filas_p)} plantillas')

    print('--- escribiendo talleres históricos ---')
    filas_t, omitidos = [], 0
    vistos = set()
    for r in reportes:
        if not r['fecha'] or not r['comunidad']:
            omitidos += 1
            continue
        ciclo = r['ciclo']
        pid = prog_id[(r['programa'], ciclo)]
        tid = tipo_id[(pid, r['tipo'])]
        llave = (pid, tid, norm(r['comunidad']), r['fecha'])
        if llave in vistos:      # el índice único lo rechazaría; se avisa aquí
            omitidos += 1
            continue
        vistos.add(llave)
        filas_t.append({
            'org_id': org, 'programa_id': pid, 'tipo_taller_id': tid,
            'comunidad_id': r['_comunidad_id'],
            'comunidad': r['comunidad'], 'municipio': r['municipio'],
            'fecha': r['fecha'], 'hora_inicio': r['hora_inicio'], 'hora_fin': r['hora_fin'],
            'tecnico': r['tecnico'], 'origen_archivo': r['archivo'], 'historico': True,
        })
    for i in range(0, len(filas_t), 100):
        rest('POST', 'agro_taller', filas_t[i:i + 100],
             'resolution=merge-duplicates,return=minimal')
    print(f'  {len(filas_t)} talleres  (omitidos por falta de fecha/comunidad o duplicado: {omitidos})')

    tot = rest('GET', 'agro_taller?select=id&limit=1000')
    print(f'\nEn la base: {len(tot)} talleres · '
          f'{len(rest("GET", "agro_plantilla_taller?select=id"))} plantillas')


if __name__ == '__main__':
    main()
