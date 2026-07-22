# ============================================================================
# Carga las boletas 313–317 del acopio (capturadas de los PDF RECIBO DE ENTRADA)
# ----------------------------------------------------------------------------
# Los datos vienen de las boletas firmadas + las tarjetas de análisis de calidad.
# El script CALCULA la tara y los quintales con los mismos factores del sistema
# (plástico 0.30 / yute 1.00 / henequén 1.30; pergamino 57.5, cerezo 80, oro
# 45.35) y CUADRA el resultado contra los totales impresos en la boleta antes de
# escribir: si un total no coincide, aborta.
#
#   python scripts/cargar-boletas-313-317.py            # cuadre, sin escribir
#   python scripts/cargar-boletas-313-317.py --commit   # escribe
# ============================================================================
import sys, os, re, json, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

TARA = {'plastico': 0.30, 'yute': 1.00, 'henequen': 1.30}
FACTOR = {('ARABE', 'PERGAMINO'): 57.5, ('ARABE', 'ORO'): 45.35,
          ('ROBUSTA', 'CEREZO'): 80.0, ('ROBUSTA', 'ORO'): 45.35,
          ('CACAO', 'FERMENTADO'): None, ('CACAO', 'LAVADO'): None}

# --- Boletas -----------------------------------------------------------------
# pesadas: (m1_sacos, m1_kgs, m2_sacos, m2_kgs, plastico, yute, henequen)
BOLETAS = [
    {
        'folio': 313, 'fecha': '2026-07-13',
        'proveedor': 'COMERCIALIZADORA VITAL DE LA SIERRA',
        'comunidad': 'BELISARIO DOMINGUEZ', 'municipio': 'MOTOZINTLA',
        'especie': 'ARABE', 'tipo': 'PERGAMINO',
        'cosecha': 'Temp 2026-2027', 'elaboro': 'AXEL ARREVILLAGA',
        # Tarjeta de análisis: muestra 300 g → oro 237 g; los 4 montones reparten el oro.
        'gramos': {'muestra_g': 300, 'oro_g': 237, 'analisis_g': 237,
                   'zaranda_16_g': 179, 'zaranda_15_g': 14, 'caracol_g': 11, 'mancha_g': 33},
        'calidad': {'rendimiento': 0.79, 'zaranda_16': 0.7552, 'zaranda_15': 0.0590,
                    'caracol': 0.0466, 'mancha': 0.1392, 'humedad': 0.1350},
        'obs': ('Pergamino árabe con granos quemados, mordidos de pulpero, secado disparejo, '
                'ligero brocado, ligero blanqueamiento y 4% de cerezo'),
        'pesadas': [
            (40, 2353.00, 10, 557.60, 47, 3, 0),
            (40, 2227.50, 10, 582.60, 46, 4, 0),
            (40, 2296.50, 10, 559.00, 30, 20, 0),
            (38, 2121.10, 0, 0.00, 13, 25, 0),
        ],
        'total': {'sacos': 188, 'brutos': 10697.30, 'tara': 92.80, 'netos': 10604.50,
                  'quintales': 184.43, 'plastico': 136, 'yute': 52, 'henequen': 0},
    },
    {
        'folio': 314, 'fecha': '2026-07-14',
        'proveedor': 'PRODUCTORES ECOLOGICOS LA AURORA',
        'comunidad': 'FRANCISCO SARABIA', 'municipio': 'TUZANTAN',
        'especie': 'CACAO', 'tipo': 'FERMENTADO',
        'cosecha': 'Temp 2026-2027', 'elaboro': 'AXEL ARREVILLAGA',
        'gramos': {}, 'calidad': {'humedad': 0.0620},   # al cacao sólo humedad
        'obs': 'Cacao fermentado',
        'pesadas': [(5, 309.50, 0, 0.00, 5, 0, 0)],
        'total': {'sacos': 5, 'brutos': 309.50, 'tara': 1.50, 'netos': 308.00,
                  'quintales': None, 'plastico': 5, 'yute': 0, 'henequen': 0},
    },
    {
        'folio': 315, 'fecha': '2026-07-18',
        'proveedor': 'CARLOS ALBERTO ORTIZ CASTILLO',
        'comunidad': '2DA SECCION DE MEDIO MONTE', 'municipio': 'TUXTLA CHICO',
        'especie': 'CACAO', 'tipo': 'FERMENTADO',
        'cosecha': 'Temp 2026-2027', 'elaboro': 'AXEL ARREVILLAGA',
        'gramos': {}, 'calidad': {'humedad': 0.0750},
        'obs': 'Cacao fermentado',
        'pesadas': [(1, 89.00, 0, 0.00, 1, 0, 0)],
        'total': {'sacos': 1, 'brutos': 89.00, 'tara': 0.30, 'netos': 88.70,
                  'quintales': None, 'plastico': 1, 'yute': 0, 'henequen': 0},
    },
    {
        'folio': 316, 'fecha': '2026-07-20',
        'proveedor': 'CASFA SANTA IRENE',
        'comunidad': 'TAPACHULA', 'municipio': 'TAPACHULA',
        'especie': 'CACAO', 'tipo': 'LAVADO',
        'cosecha': 'Temp 2026-2027', 'elaboro': 'AXEL ARREVILLAGA',
        'gramos': {}, 'calidad': {'humedad': 0.0700},
        'obs': 'Cacao lavado',
        'pesadas': [(1, 26.00, 0, 0.00, 1, 0, 0)],
        'total': {'sacos': 1, 'brutos': 26.00, 'tara': 0.30, 'netos': 25.70,
                  'quintales': None, 'plastico': 1, 'yute': 0, 'henequen': 0},
    },
    {
        'folio': 317, 'fecha': '2026-07-20',
        'proveedor': 'MARCOS EPITACIO DE LEON RODRIGUEZ',
        'comunidad': 'SANTO DOMINGO', 'municipio': 'UNION JUAREZ',
        'especie': 'ROBUSTA', 'tipo': 'CEREZO',
        'cosecha': 'Temp 2026-2027', 'elaboro': 'AXEL ARREVILLAGA',
        'gramos': {'muestra_g': 300, 'oro_g': 177, 'analisis_g': 177,
                   'zaranda_16_g': 99.3, 'zaranda_15_g': 18.4, 'caracol_g': 26.3, 'mancha_g': 33},
        'calidad': {'rendimiento': 0.59, 'zaranda_16': 0.5610, 'zaranda_15': 0.1039,
                    'caracol': 0.1487, 'mancha': 0.1864, 'humedad': 0.1300},
        'obs': 'Cerezo robusta con granos quemados, ligero brocado y ligero olor a moho',
        'pesadas': [(12, 741.00, 0, 0.00, 12, 0, 0)],
        'total': {'sacos': 12, 'brutos': 741.00, 'tara': 3.60, 'netos': 737.40,
                  'quintales': 9.22, 'plastico': 12, 'yute': 0, 'henequen': 0},
    },
]

r2 = lambda x: round(x + 1e-9, 2)


def calcular(b):
    """Calcula cada pesada como lo hace calculo.mjs y suma los totales."""
    factor = FACTOR[(b['especie'], b['tipo'])]
    filas, tot = [], {'sacos': 0, 'brutos': 0.0, 'tara': 0.0, 'netos': 0.0,
                      'qq': 0.0, 'plastico': 0, 'yute': 0, 'henequen': 0}
    for i, (m1s, m1k, m2s, m2k, pl, yu, he) in enumerate(b['pesadas'], start=1):
        sacos = m1s + m2s
        brutos = r2(m1k + m2k)
        tara = r2(pl * TARA['plastico'] + yu * TARA['yute'] + he * TARA['henequen'])
        netos = r2(brutos - tara)
        qq = r2(netos / factor) if factor else None
        filas.append({'numero_pesada': i, 'm1_sacos': m1s, 'm1_kgs': m1k,
                      'm2_sacos': m2s, 'm2_kgs': m2k, 'plastico': pl, 'yute': yu,
                      'henequen': he, 'sacos_total': sacos, 'kg_brutos': brutos,
                      'tara_kg': tara, 'kg_netos': netos, 'quintales': qq})
        tot['sacos'] += sacos; tot['brutos'] += brutos; tot['tara'] += tara
        tot['netos'] += netos; tot['qq'] += qq or 0
        tot['plastico'] += pl; tot['yute'] += yu; tot['henequen'] += he
    for k in ('brutos', 'tara', 'netos', 'qq'):
        tot[k] = r2(tot[k])
    return filas, tot, factor


def cuadrar():
    """Compara lo calculado contra los totales IMPRESOS en la boleta."""
    ok = True
    for b in BOLETAS:
        filas, tot, factor = calcular(b)
        e = b['total']
        checks = [
            ('sacos', tot['sacos'], e['sacos']), ('brutos', tot['brutos'], e['brutos']),
            ('tara', tot['tara'], e['tara']), ('netos', tot['netos'], e['netos']),
            ('plastico', tot['plastico'], e['plastico']), ('yute', tot['yute'], e['yute']),
            ('henequen', tot['henequen'], e['henequen']),
        ]
        if e['quintales'] is not None:
            checks.append(('quintales', tot['qq'], e['quintales']))
        malos = [(n, c, x) for n, c, x in checks if abs((c or 0) - (x or 0)) > 0.02]
        print(f"  #{b['folio']} {b['especie']:7} {b['tipo']:10} {len(filas)} pesada(s) "
              f"· {tot['sacos']:>4} sacos · {tot['netos']:>10,.2f} kg netos "
              f"· {('%.2f qq' % tot['qq']) if factor else 'N/A':>10}  "
              f"{'OK' if not malos else 'NO CUADRA: ' + str(malos)}")
        if malos:
            ok = False
    return ok


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
        print(f'\n!! {method} {path} → {e.code}: {e.read().decode(errors="replace")[:400]}')
        raise


def main():
    commit = '--commit' in sys.argv
    print('CUADRE contra los totales impresos en la boleta:')
    if not cuadrar():
        print('\n!! Hay boletas que no cuadran. No se escribe nada.')
        return
    print('\nTodas cuadran.')

    if not commit:
        print('(dry-run — usa --commit para escribir)')
        return

    org = rest('GET', 'organizaciones?select=id&slug=eq.casfa')[0]['id']
    ya = {e['folio'] for e in rest('GET', f'entradas?select=folio&org_id=eq.{org}&folio=gte.313')}
    if ya:
        print(f'\n!! Ya existen las boletas {sorted(ya)}. No se reescriben; aborto.')
        return

    for b in BOLETAS:
        filas, tot, _ = calcular(b)
        fila = {
            'org_id': org, 'folio': b['folio'], 'fecha_acopio': b['fecha'],
            'proveedor_nombre': b['proveedor'], 'comunidad': b['comunidad'],
            'municipio': b['municipio'], 'especie': b['especie'], 'tipo': b['tipo'],
            'cosecha': b['cosecha'], 'comentarios': b['obs'],
            'elaborado_por_nombre': b['elaboro'], 'estado': 'completada',
            **b['calidad'], **b['gramos'],
        }
        res = rest('POST', 'entradas?select=id,folio', [fila], {'Prefer': 'return=representation'})
        eid = res[0]['id']
        for p in filas:
            p['entrada_id'] = eid
            p['org_id'] = org
        rest('POST', 'pesadas', filas, {'Prefer': 'return=minimal'})
        print(f"  cargada #{b['folio']} ({len(filas)} pesadas)")

    # El contador de folio sigue desde 317: la próxima entrada será la 318.
    rest('POST', 'acopio_contador', [{'org_id': org, 'ultimo_folio': 317}],
         {'Prefer': 'resolution=merge-duplicates'})
    print('\nContador de folio → 317 (la próxima entrada será la #318)')


if __name__ == '__main__':
    main()
