# ============================================================================
# Alta de un usuario con rol admin en la organización CASFA.
# ----------------------------------------------------------------------------
# Crea la cuenta en Supabase Auth (email ya confirmado, para que pueda entrar
# sin correo de verificación) y la enlaza a `usuarios` + `membresias`.
#
# La contraseña NO se guarda aquí: se pasa por variable de entorno.
#   set  NUEVA_PASS=...   (Windows)  /  export NUEVA_PASS=...
#   python scripts/crear-usuario-admin.py correo@ejemplo.com [rol]
#
# rol: admin (por defecto) | coordinador | inspector | solo_lectura
# Idempotente: si el correo ya existe, sólo ajusta el rol.
# ============================================================================
import sys, os, re, json, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def env(k):
    txt = open(os.path.join(ROOT, '.env.local'), encoding='utf8').read()
    m = re.search(rf'^{k}=(.*)$', txt, re.M)
    return m.group(1).strip() if m else None


BASE = env('NEXT_PUBLIC_SUPABASE_URL').rstrip('/')
KEY = env('SUPABASE_SERVICE_ROLE_KEY')


def call(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        detalle = e.read().decode(errors='replace')
        print(f'!! {method} {path} → {e.code}: {detalle[:300]}')
        raise


def main():
    if len(sys.argv) < 2:
        print('uso: python scripts/crear-usuario-admin.py correo@ejemplo.com [rol]')
        return
    email = sys.argv[1].strip().lower()
    rol = (sys.argv[2] if len(sys.argv) > 2 else 'admin').strip()
    password = os.environ.get('NUEVA_PASS')
    if not password:
        print('!! Falta la contraseña en la variable de entorno NUEVA_PASS')
        return

    # 1) ¿ya existe en Auth?
    existentes = call('GET', f'/auth/v1/admin/users?per_page=1000')
    lista = existentes.get('users', existentes) if isinstance(existentes, dict) else existentes
    uid = next((u['id'] for u in lista if (u.get('email') or '').lower() == email), None)

    if uid:
        print(f'La cuenta {email} ya existía en Auth (id {uid[:8]}…); no se cambia su contraseña.')
    else:
        u = call('POST', '/auth/v1/admin/users', {
            'email': email, 'password': password, 'email_confirm': True,
        })
        uid = u['id']
        print(f'Cuenta creada en Auth: {email}')

    # 2) fila en `usuarios` (id = id de Auth, como hace el bootstrap 0002)
    call('POST', '/rest/v1/usuarios', [{'id': uid, 'email': email}],
         'resolution=merge-duplicates')

    # 3) membresía en CASFA con el rol pedido
    org = call('GET', '/rest/v1/organizaciones?select=id&slug=eq.casfa')[0]['id']
    call('POST', '/rest/v1/membresias', [{'org_id': org, 'usuario_id': uid, 'rol': rol}],
         'resolution=merge-duplicates')

    # 4) confirmar
    m = call('GET', f'/rest/v1/membresias?select=rol,usuarios(email)&usuario_id=eq.{uid}')
    print('Membresía:', m)


if __name__ == '__main__':
    main()
