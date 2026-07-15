// Backup cifrado del módulo Ventas — SOLO navegador (Web Crypto API).
// AES-256-GCM con clave derivada de la contraseña del usuario por
// PBKDF2-SHA256 (210k iteraciones). La contraseña nunca sale del navegador;
// sin ella el backup es irrecuperable (se advierte en el UI).
// Contenedor .json.enc: { v, kdf, iter, salt, iv, datos } todo base64.

const ITERACIONES = 210_000

function aBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function deBase64(s: string): Uint8Array {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function derivarClave(password: string, salt: Uint8Array, iter = ITERACIONES): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface ContenedorBackup {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  datos: string
}

export async function cifrarBackup(objeto: unknown, password: string): Promise<string> {
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clave = await derivarClave(password, salt)
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    clave,
    new TextEncoder().encode(JSON.stringify(objeto)),
  )
  const contenedor: ContenedorBackup = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: ITERACIONES,
    salt: aBase64(salt),
    iv: aBase64(iv),
    datos: aBase64(cifrado),
  }
  return JSON.stringify(contenedor)
}

export async function descifrarBackup(contenedorJson: string, password: string): Promise<unknown> {
  let c: ContenedorBackup
  try {
    c = JSON.parse(contenedorJson)
  } catch {
    throw new Error('El archivo no es un backup válido (.json.enc)')
  }
  if (c.v !== 1 || c.kdf !== 'PBKDF2-SHA256' || !c.salt || !c.iv || !c.datos) {
    throw new Error('Formato de backup no reconocido')
  }
  const clave = await derivarClave(password, deBase64(c.salt), c.iter || ITERACIONES)
  try {
    const plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(c.iv) as BufferSource },
      clave,
      deBase64(c.datos) as BufferSource,
    )
    return JSON.parse(new TextDecoder().decode(plano))
  } catch {
    // GCM autentica: contraseña equivocada o archivo alterado terminan aquí.
    throw new Error('Contraseña incorrecta o archivo dañado')
  }
}
