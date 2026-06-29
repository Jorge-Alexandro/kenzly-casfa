// Asigna una imagen de referencia fija a los campos de sombra de las 3 fichas.
// Requiere haber corrido 0005_campo_imagen_referencia.sql y colocado la imagen
// en public/referencias/tipo-sombra.png (servida en /referencias/tipo-sombra.png).
//
// Uso: node scripts/set-campo-imagen.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const IMG = '/referencias/tipo-sombra.jpg'

// Campo de sombra a marcar en cada ficha (por nombre del template + nombre_interno).
const TARGETS = [
  { template: 'Ficha Robusta', campo: 'tipo_sombra' },
  { template: 'Ficha Arábica', campo: 'densidad_sombra' },
  { template: 'Ficha Cultivos Tropicales', campo: 'manejo_sombra_diversificacion' },
]

async function run() {
  for (const t of TARGETS) {
    // template -> secciones -> campos; ubicamos el campo por nombre_interno.
    const { data: tpl } = await admin
      .from('form_templates')
      .select('id')
      .eq('nombre', t.template)
      .single()
    if (!tpl) {
      console.warn(`! template no encontrado: ${t.template}`)
      continue
    }
    const { data: secs } = await admin
      .from('form_secciones')
      .select('id')
      .eq('template_id', tpl.id)
    const secIds = (secs ?? []).map((s) => s.id)

    const { data: updated, error } = await admin
      .from('form_campos')
      .update({ imagen_referencia_url: IMG })
      .in('seccion_id', secIds)
      .eq('nombre_interno', t.campo)
      .select('id')
    if (error) {
      console.error(`ERROR ${t.template}/${t.campo}:`, error.message)
      continue
    }
    console.log(`✓ ${t.template} · ${t.campo}: ${updated?.length ?? 0} campo(s) actualizado(s)`)
  }
  console.log('\nListo.')
}

run().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
