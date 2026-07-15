// Certificados — consultas del lado servidor. RLS acota por organización.
import { createClient } from '@/lib/supabase/server'
import type { Certificado } from '@/lib/certificados/tipos'

export * from '@/lib/certificados/tipos'

export async function getCertificados(): Promise<Certificado[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('certificado')
    .select('id, programa, esquema, fecha_vencimiento, estado')
    .order('programa', { ascending: true })
    .order('esquema', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Certificado[]
}
