// Requisición en PDF (@react-pdf/renderer, servidor) — la orden interna de
// producción para torrefacción: qué y cuánto hay que preparar. Rediseño del
// formato en papel que ya no funcionaba; mismo estilo que CotizacionPdf/
// ReciboPdf. No es un documento financiero: sin costos, sólo cantidades y su
// kilaje equivalente (para que torrefacción sepa cuánta materia prima sacar).
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatoNum } from '@/lib/ventas/tipos'
import type { RequisicionDetalle } from '@/lib/data/ventas'

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b', lineHeight: 1.4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { marginTop: 16, marginBottom: 4, textAlign: 'center', fontSize: 15, fontFamily: 'Helvetica-Bold' },
  subtitle: { marginBottom: 16, textAlign: 'center', fontSize: 10, color: '#64748b' },
  ficha: { borderWidth: 1, borderColor: '#64748b' },
  fr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  fk: { width: '28%', padding: 5, backgroundColor: '#f1f5f9', fontFamily: 'Helvetica-Bold' },
  fv: { width: '72%', padding: 5 },
  table: { borderWidth: 1, borderColor: '#64748b', marginTop: 18 },
  tr: { flexDirection: 'row' },
  th: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 5,
    fontFamily: 'Helvetica-Bold', backgroundColor: '#f1f5f9', fontSize: 8 },
  td: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 5, fontSize: 9 },
  totalFila: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalCaja: { borderWidth: 1, borderColor: '#64748b', padding: 8, minWidth: 200 },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 60 },
  firma: { width: '30%', borderTopWidth: 1, borderTopColor: '#64748b', paddingTop: 4, textAlign: 'center' },
})

export interface Imagenes {
  logoIzq?: string
  logoDer?: string
}

export function RequisicionPdf({ requisicion, img }: { requisicion: RequisicionDetalle; img: Imagenes }) {
  const totalKg = requisicion.items.reduce((s2, it) => s2 + it.kg_equivalente, 0)
  const cliente = requisicion.cliente_nombre || requisicion.cliente_texto

  return (
    <Document title={`Requisición ${requisicion.folio}`} author="CASFA">
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

        <Text style={s.title}>REQUISICIÓN DE PEDIDOS</Text>
        <Text style={s.subtitle}>Orden interna de producción para torrefacción</Text>

        <View style={s.ficha}>
          <View style={s.fr}>
            <Text style={s.fk}>Folio</Text>
            <Text style={s.fv}>{String(requisicion.folio).padStart(4, '0')}</Text>
          </View>
          <View style={s.fr}>
            <Text style={s.fk}>Fecha</Text>
            <Text style={s.fv}>{requisicion.fecha}</Text>
          </View>
          <View style={s.fr}>
            <Text style={s.fk}>Cliente</Text>
            <Text style={s.fv}>{cliente || '—'}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { width: '54%' }]}>Producto</Text>
            <Text style={[s.th, { width: '23%', textAlign: 'right' }]}>Cantidad</Text>
            <Text style={[s.th, { width: '23%', textAlign: 'right', borderRightWidth: 0 }]}>Kg equivalentes</Text>
          </View>
          {requisicion.items.map((it, i) => (
            <View key={i} style={s.tr}>
              <Text style={[s.td, { width: '54%' }]}>{it.producto_nombre}</Text>
              <Text style={[s.td, { width: '23%', textAlign: 'right' }]}>{formatoNum(it.cantidad, 2)} {it.producto_unidad}</Text>
              <Text style={[s.td, { width: '23%', textAlign: 'right', borderRightWidth: 0 }]}>{formatoNum(it.kg_equivalente, 2)} kg</Text>
            </View>
          ))}
        </View>

        <View style={s.totalFila}>
          <View style={s.totalCaja}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.bold}>TOTAL KG EQUIVALENTES</Text>
              <Text style={s.bold}>{formatoNum(totalKg, 2)} kg</Text>
            </View>
          </View>
        </View>

        {requisicion.notas && (
          <>
            <Text style={{ marginTop: 14, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>Notas</Text>
            <Text style={{ marginTop: 2 }}>{requisicion.notas}</Text>
          </>
        )}

        <View style={s.firmas}>
          <View style={s.firma}>
            <Text>{requisicion.solicito || ' '}</Text>
            <Text style={{ marginTop: 2, fontSize: 7, color: '#64748b' }}>SOLICITÓ MERCANCÍA</Text>
          </View>
          <View style={s.firma}>
            <Text>{requisicion.autorizo || ' '}</Text>
            <Text style={{ marginTop: 2, fontSize: 7, color: '#64748b' }}>AUTORIZÓ</Text>
          </View>
          <View style={s.firma}>
            <Text>{requisicion.entrego || ' '}</Text>
            <Text style={{ marginTop: 2, fontSize: 7, color: '#64748b' }}>ENTREGÓ MERCANCÍA</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
