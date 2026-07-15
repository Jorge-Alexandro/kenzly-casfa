// DELETE /api/acopio/pesadas/[id] — borra una pesada. El trigger recalcula los
// totales de su entrada automáticamente.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { error } = await supabase.from('pesadas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
