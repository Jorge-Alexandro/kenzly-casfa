// Cotización en PDF de una oportunidad (@react-pdf/renderer, servidor).
// Sirve tanto para un cliente nuevo como para uno "en general" — no depende
// de que la cuenta ya tenga RFC/cliente fiscal vinculado (eso pasa hasta que
// se gana la oportunidad); la cotización es previa a eso.
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatoMXN, formatoNum } from '@/lib/ventas/tipos'
import type { CotizacionData } from '@/lib/data/crm'

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b', lineHeight: 1.4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { marginTop: 16, marginBottom: 4, textAlign: 'center', fontSize: 15, fontFamily: 'Helvetica-Bold' },
  subtitle: { marginBottom: 16, textAlign: 'center', fontSize: 10, color: '#64748b' },
  fila: { flexDirection: 'row', marginTop: 16 },
  caja: { flex: 1, borderWidth: 1, borderColor: '#64748b', padding: 8 },
  cajaTitulo: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#c2410c', marginBottom: 4 },
  table: { borderWidth: 1, borderColor: '#64748b', marginTop: 18 },
  tr: { flexDirection: 'row' },
  th: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 5,
    fontFamily: 'Helvetica-Bold', backgroundColor: '#f1f5f9', fontSize: 8 },
  td: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 5, fontSize: 9 },
  totalFila: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalCaja: { borderWidth: 1, borderColor: '#64748b', padding: 8, minWidth: 180 },
  condiciones: { marginTop: 24, fontSize: 8, color: '#64748b', lineHeight: 1.5 },
})

export interface Imagenes {
  logoIzq?: string
  logoDer?: string
}

export function CotizacionPdf({ cotizacion, img }: { cotizacion: CotizacionData; img: Imagenes }) {
  const folio = cotizacion.id.slice(0, 8).toUpperCase()
  const hoy = new Date().toISOString().slice(0, 10)
  const totalItems = cotizacion.items.reduce((s2, it) => s2 + Number(it.importe), 0)
  const total = totalItems > 0 ? totalItems : cotizacion.monto_estimado

  return (
    <Document title={`Cotización ${folio} — ${cotizacion.cuenta.nombre}`} author="CASFA">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {img.logoIzq ? <Image style={s.logo} src={img.logoIzq} /> : <View style={s.logo} />}
          <View style={s.headerText}>
            <Text style={s.bold}>CENTRO AGROECOLÓGICO SAN FRANCISCO DE ASÍS</Text>
            <Text>1A AVENIDA NORTE #130, COLONIA CENTRO, TAPACHULA, CHIAPAS</Text>
            <Text>EMAIL: contacto@redcasfa.com · TEL: 962 118 28 08 · 962 625 06 43</Text>
          </View>
          {img.logoDer ? <Image style={s.logo} src={img.logoDer} /> : <View style={s.logo} />}
        </View>

        <Text style={s.title}>COTIZACIÓN</Text>
        <Text style={s.subtitle}>Folio {folio} · {hoy}{cotizacion.fecha_cierre_estimada ? ` · vigente hasta ${cotizacion.fecha_cierre_estimada}` : ''}</Text>

        <View style={s.fila}>
          <View style={s.caja}>
            <Text style={s.cajaTitulo}>Cliente</Text>
            <Text style={s.bold}>{cotizacion.cuenta.nombre_comercial || cotizacion.cuenta.nombre}</Text>
            {cotizacion.contacto && (
              <Text>Atención: {cotizacion.contacto.nombre}{cotizacion.contacto.puesto ? ` (${cotizacion.contacto.puesto})` : ''}</Text>
            )}
            {cotizacion.cuenta.direccion && <Text>{cotizacion.cuenta.direccion}</Text>}
            {cotizacion.cuenta.telefono && <Text>Tel: {cotizacion.cuenta.telefono}</Text>}
            {cotizacion.cuenta.email && <Text>{cotizacion.cuenta.email}</Text>}
          </View>
        </View>

        <Text style={{ marginTop: 14, fontFamily: 'Helvetica-Bold', fontSize: 11 }}>{cotizacion.nombre}</Text>

        {cotizacion.items.length > 0 ? (
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: '46%' }]}>Producto</Text>
              <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Cantidad</Text>
              <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Precio unitario</Text>
              <Text style={[s.th, { width: '20%', textAlign: 'right', borderRightWidth: 0 }]}>Importe</Text>
            </View>
            {cotizacion.items.map((it, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { width: '46%' }]}>{it.producto?.nombre ?? '—'}</Text>
                <Text style={[s.td, { width: '14%', textAlign: 'right' }]}>{formatoNum(Number(it.cantidad), 2)} {it.producto?.unidad ?? ''}</Text>
                <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{formatoMXN(Number(it.precio_objetivo))}</Text>
                <Text style={[s.td, { width: '20%', textAlign: 'right', borderRightWidth: 0 }]}>{formatoMXN(Number(it.importe))}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ marginTop: 10, color: '#94a3b8' }}>Monto cotizado global — sin desglose por producto.</Text>
        )}

        <View style={s.totalFila}>
          <View style={s.totalCaja}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.bold}>TOTAL</Text>
              <Text style={s.bold}>{formatoMXN(total)}</Text>
            </View>
          </View>
        </View>

        {cotizacion.notas && (
          <>
            <Text style={{ marginTop: 14, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>Notas</Text>
            <Text style={{ marginTop: 2 }}>{cotizacion.notas}</Text>
          </>
        )}

        <Text style={s.condiciones}>
          Precios en pesos mexicanos (MXN), sujetos a cambio sin previo aviso. Cotización de carácter
          informativo — no constituye una factura ni un pedido en firme. Sujeta a disponibilidad de
          inventario al momento de confirmar.
        </Text>
      </Page>
    </Document>
  )
}
