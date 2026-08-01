# Ventas — Fase 1: carga el catálogo real de clientes desde
# "VENTAS/Lista de Clientes.xlsx" (279 facturas: UUID, RFC Receptor, Nombre
# Receptor — una fila por CFDI, no por cliente).
#
# NO importa facturas ni montos: este archivo no los trae (ver
# docs/plan-ventas.md §Fase 1). Sólo deriva el catálogo de ~46 clientes.
#
# Reglas (mismas que el trigger de la migración 0050_ventas_cliente_tipo.sql,
# que es quien realmente decide tipo_cliente/nombre_normalizado al insertar):
#   · RFC real (no XAXX/XEXX)      -> un cliente por RFC (ya verificado 1:1
#                                      con el nombre en los datos reales).
#   · XAXX010101000 (público)      -> SIEMPRE un solo nombre canónico; no
#                                      importa qué variante traiga cada CFDI.
#   · XEXX010101000 (exportación)  -> un cliente por empresa; se agrupan aquí
#                                      mismo las variantes de mayúsculas/
#                                      espacios de un mismo nombre antes de
#                                      mandar la fila (para no depender de
#                                      qué variante llegó "al final" del lote
#                                      al hacer merge-duplicates).
#
# Uso: python scripts/import-ventas-clientes.py [--commit]
import glob, json, os, re, sys, unicodedata
from collections import defaultdict

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = r'C:/Users/jorge/Documents/CASFA SIC FILES/VENTAS'
ARCHIVO = 'Lista de Clientes.xlsx'

PUBLICO_RFC = 'XAXX010101000'
EXPORT_RFC = 'XEXX010101000'
PUBLICO_NOMBRE = 'VENTA AL PÚBLICO EN GENERAL'


def norm(s):
    """Mayúsculas, sin acentos, sin puntuación, espacios colapsados — sólo
    para AGRUPAR variantes de escritura de la misma empresa, igual que
    ventas_normalizar_nombre() en SQL."""
    t = unicodedata.normalize('NFD', str(s or ''))
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').upper()
    t = re.sub(r'[.,]', '', t)
    t = re.sub(r'[-/]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def leer_filas():
    path = os.path.join(BASE, ARCHIVO)
    ws = openpyxl.load_workbook(path, data_only=True)['Lista de Clientes']
    filas = []
    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i < 6 or not row[0]:
            continue
        rfc = (row[1] or '').strip().upper()
        nombre = (row[2] or '').strip()
        if not rfc or not nombre:
            continue
        filas.append((rfc, nombre))
    return filas


def agrupar(filas):
    """(rfc, nombre) por factura -> lista de clientes únicos a upsertar."""
    # RFC real: un cliente por RFC; nombre = el más frecuente (ya es 1:1 en
    # los datos reales, pero por si acaso un futuro import trae variantes).
    por_rfc_real = defaultdict(lambda: defaultdict(int))
    exportacion = defaultdict(lambda: defaultdict(int))  # norm(nombre) -> {nombre_crudo: n}
    hay_publico = False

    for rfc, nombre in filas:
        if rfc == PUBLICO_RFC:
            hay_publico = True
        elif rfc == EXPORT_RFC:
            exportacion[norm(nombre)][nombre] += 1
        else:
            por_rfc_real[rfc][nombre] += 1

    clientes = []
    if hay_publico:
        clientes.append({'rfc': PUBLICO_RFC, 'nombre': PUBLICO_NOMBRE})

    ambiguos = []
    for rfc, nombres in por_rfc_real.items():
        if len(nombres) > 1:
            ambiguos.append((rfc, list(nombres.keys())))
        # el nombre más frecuente gana; empate -> el primero alfabético
        mejor = sorted(nombres.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        clientes.append({'rfc': rfc, 'nombre': mejor})

    for _, variantes in exportacion.items():
        # Preferir una variante con minúsculas (mejor tipeada) sobre TODO
        # MAYÚSCULAS; empate -> la más frecuente; empate -> la más corta
        # (evita elegir la que trae doble espacio u otra basura de captura).
        mejor = sorted(
            variantes.items(),
            key=lambda kv: (kv[0].isupper(), -kv[1], len(kv[0])),
        )[0][0]
        clientes.append({'rfc': EXPORT_RFC, 'nombre': mejor})

    return clientes, ambiguos


# --------------------------------------------------------------- Supabase REST
def env(k):
    txt = open(os.path.join(ROOT, '.env.local'), encoding='utf8').read()
    m = re.search(rf'^{k}=(.*)$', txt, re.M)
    return m.group(1).strip() if m else None


def rest(method, path, body=None, prefer=None):
    import urllib.error
    import urllib.request
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
        print(f'\n!! {method} {path} -> {e.code}: {e.read().decode(errors="replace")[:400]}')
        raise


def main():
    commit = '--commit' in sys.argv

    filas = leer_filas()
    print(f'Facturas leídas (Lista de Clientes.xlsx): {len(filas)}')

    clientes, ambiguos = agrupar(filas)
    print(f'Clientes a cargar: {len(clientes)}')
    print(f'  · exportación (XEXX): {sum(1 for c in clientes if c["rfc"] == EXPORT_RFC)}')
    print(f'  · público (XAXX):     {sum(1 for c in clientes if c["rfc"] == PUBLICO_RFC)}')
    print(f'  · RFC real:           {sum(1 for c in clientes if c["rfc"] not in (EXPORT_RFC, PUBLICO_RFC))}')

    if ambiguos:
        print('\n  RFC real con más de un nombre (se usó el más frecuente, revisar a mano):')
        for rfc, nombres in ambiguos:
            print(f'    · {rfc}: {nombres}')

    print('\nMuestra de clientes de exportación:')
    for c in sorted((c for c in clientes if c['rfc'] == EXPORT_RFC), key=lambda c: c['nombre']):
        print(f'    · {c["nombre"]}')

    if not commit:
        print('\n(dry-run — usa --commit para escribir)')
        return

    org = rest('GET', 'organizaciones?select=id&slug=eq.casfa')[0]['id']
    filas_out = [{'org_id': org, 'rfc': c['rfc'], 'nombre': c['nombre']} for c in clientes]
    rest(
        'POST',
        'ventas_cliente?on_conflict=org_id,rfc,nombre_normalizado',
        filas_out,
        'resolution=merge-duplicates,return=minimal',
    )
    print(f'\n{len(filas_out)} clientes escritos.')

    total = rest('GET', 'ventas_cliente?select=id&limit=1000')
    print(f'En la base: {len(total)} clientes.')


if __name__ == '__main__':
    main()
