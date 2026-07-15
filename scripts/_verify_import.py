# Comprobación post-import: los totales de la entrada los recalculó el TRIGGER
# sumando las pesadas. Tienen que coincidir con los que AppSheet ya traía
# calculados. Si no, algo se perdió al importar.
import sys, os, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('imp', os.path.join(HERE, 'import-acopio.py'))
imp = importlib.util.module_from_spec(spec); sys.modules['imp'] = imp
spec.loader.exec_module(imp)

h = imp.leer(imp.XLSX)
org = imp.rest('GET', 'organizaciones?select=id&slug=eq.casfa')[0]['id']

# Lo que decía AppSheet, por folio
orig = {}
for r in h['Entrada'][1:]:
    r = r + [None] * (31 - len(r))
    folio = imp.i(r[0])
    if folio is None:
        continue
    orig[folio] = {
        'sacos': imp.i(r[7]) or 0,
        'brutos': imp.f(r[8]) or 0,
        'tara': imp.f(r[9]) or 0,
        'netos': imp.f(r[10]) or 0,
        'quintales': imp.f(r[11]) or 0,
        'rend': imp.f(r[12]),
        'especie': imp.s(r[5]), 'tipo': imp.s(r[6]),
    }

filas = imp.rest(
    'GET',
    f'entradas?select=folio,total_sacos,kg_brutos,tara_kg,kg_netos,quintales,rendimiento,'
    f'oro_g,mancha_g,humedad,especie,tipo&org_id=eq.{org}&limit=5000')
base = {f['folio']: f for f in filas}

print(f'Entradas en AppSheet: {len(orig)} · en la base: {len(base)}')
faltan = set(orig) - set(base)
if faltan:
    print(f'  !! FALTAN {len(faltan)}: {sorted(faltan)[:10]}')

campos = [('sacos', 'total_sacos', 0.5), ('brutos', 'kg_brutos', 0.02),
          ('tara', 'tara_kg', 0.02), ('netos', 'kg_netos', 0.02),
          ('quintales', 'quintales', 0.02)]
malos = {k: [] for k, _, _ in campos}
for folio, o in orig.items():
    b = base.get(folio)
    if not b:
        continue
    for k, col, tol in campos:
        v = float(b[col] or 0)
        if abs(v - o[k]) > tol:
            malos[k].append((folio, o[k], v))

print('\nTOTALES (recalculados por el trigger desde las pesadas) vs AppSheet:')
for k, col, _ in campos:
    m = malos[k]
    print(f'  {k:10} difieren: {len(m):>3}' + (f'   ej: {m[:3]}' if m else '   ✓'))

sum_o = sum(o['netos'] for o in orig.values())
sum_b = sum(float(b['kg_netos'] or 0) for b in base.values())
print(f'\n  kg netos AppSheet: {sum_o:>14,.2f}')
print(f'  kg netos base    : {sum_b:>14,.2f}')
print(f'  diferencia       : {sum_b - sum_o:>14,.2f}')

# Rendimiento: donde NO aplica debe ser null (no 1.0)
nulos_ok = sum(1 for b in base.values()
               if not imp.aplica_rendimiento(b['especie'], b['tipo']) and b['rendimiento'] is None)
no_aplica = sum(1 for b in base.values() if not imp.aplica_rendimiento(b['especie'], b['tipo']))
con_rend = sum(1 for b in base.values()
               if imp.aplica_rendimiento(b['especie'], b['tipo']) and b['rendimiento'] is not None)
aplica = sum(1 for b in base.values() if imp.aplica_rendimiento(b['especie'], b['tipo']))
print(f'\nRendimiento:')
print(f'  no aplica (café oro / cacao) y quedó NULL: {nulos_ok}/{no_aplica}')
print(f'  sí aplica (pergamino / cereza) y tiene %: {con_rend}/{aplica}')

gramos = sum(1 for b in base.values() if b['oro_g'] is not None)
print(f'  gramos de oro reconstruidos              : {gramos}')
