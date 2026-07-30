// Documento PDF del formato de corte de maquila (@react-pdf/renderer, servidor).
// Sustituye al "FORMATO MAQUILA N.xlsx" que se imprimía y firmaba a mano.
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { MaquilaDetalle } from '@/lib/data/maquila'

export interface Imagenes {
  logoIzq?: string
  logoDer?: string
  firmaElaboro?: string
  firmaEntrego?: string
  firmaRetrillero?: string
  firmaCalador?: string
}

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { marginTop: 12, marginBottom: 10, textAlign: 'center', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  h2: { marginTop: 12, marginBottom: 6, fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase',
    color: '#c2410c' },
  row2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  table: { borderWidth: 1, borderColor: '#64748b' },
  tr: { flexDirection: 'row' },
  th: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3,
    fontFamily: 'Helvetica-Bold', backgroundColor: '#f1f5f9', fontSize: 7.5 },
  td: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3, fontSize: 8 },
  grupoRow: { backgroundColor: '#fef3e7', padding: 3, fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#9a3412' },
  cuadreBox: { borderWidth: 1, borderColor: '#64748b', padding: 6, marginTop: 4 },
  firmaBox: { width: '25%', borderWidth: 1, borderColor: '#64748b', padding: 4, alignItems: 'center' },
  firmaImg: { height: 40, objectFit: 'contain' },
  firmaRol: { marginTop: 4, borderTopWidth: 1, borderTopColor: '#64748b', paddingTop: 3,
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', width: '100%' },
  firmaNombre: { fontSize: 6.5, textAlign: 'center', marginTop: 1 },
})

const n = (v: number | null | undefined, d = 1) =>
  v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: d })
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`)

const GRUPO_LABEL: Record<string, string> = {
  primeras: 'Primeras', segundas: 'Segundas', terceras: 'Terceras', merma: 'Merma',
}
const TIPO_LABEL: Record<string, string> = {
  maquila: 'Corte de maquila', repaso_oro: 'Repaso de oro', repaso_clasificadora: 'Repaso de clasificadora',
}

export function CortePdf({ m, img }: { m: MaquilaDetalle; img: Imagenes }) {
  const grupos = ['primeras', 'segundas', 'terceras', 'merma'] as const
  const porGrupo = grupos
    .map((g) => ({ g, filas: m.resultados.filter((r) => r.grupo === g) }))
    .filter((x) => x.filas.length > 0)

  const Fila = ({ k, v }: { k: string; v: string }) => (
    <View style={s.tr}>
      <Text style={[s.td, { width: '55%', fontFamily: 'Helvetica-Bold' }]}>{k}</Text>
      <Text style={[s.td, { width: '45%', textAlign: 'right', borderRightWidth: 0 }]}>{v}</Text>
    </View>
  )

  return (
    <Document title={`Corte ${m.clave}`} author="CASFA">
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

        <Text style={s.title}>{TIPO_LABEL[m.tipo_proceso] ?? 'CORTE DE MAQUILA'} — {m.clave}</Text>

        <View style={s.row2}>
          <Text><Text style={s.bold}>FECHA DE CORTE: </Text>{m.fecha_corte}</Text>
          <Text><Text style={s.bold}>CAFÉ: </Text>{m.especie} {m.tipo_entrada}</Text>
        </View>
        {m.descripcion && <Text style={{ marginBottom: 4 }}>{m.descripcion}</Text>}

        <View style={s.table}>
          <Fila k="SACOS QUE ENTRAN A PROCESO" v={n(m.sacos_entrada, 0)} />
          <Fila k="KILOGRAMOS QUE ENTRAN A PROCESO" v={n(m.kg_entrada)} />
          <Fila k="QQ DE ENTRADA" v={n(m.qq_entrada, 2)} />
          <Fila k="RENDIMIENTO" v={pct(m.rendimiento)} />
        </View>

        {/* Resultado */}
        <Text style={s.h2}>Resultado</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { width: '30%' }]}>Producto</Text>
            <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Sacos</Text>
            <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Kg/saco</Text>
            <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Sueltos</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Total kg</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right', borderRightWidth: 0 }]}>% del oro</Text>
          </View>
          {porGrupo.map(({ g, filas }) => (
            <View key={g}>
              <Text style={s.grupoRow}>{GRUPO_LABEL[g]}</Text>
              {filas.map((r) => (
                <View key={r.clave} style={s.tr}>
                  <Text style={[s.td, { width: '30%' }]}>{r.nombre}</Text>
                  <Text style={[s.td, { width: '13%', textAlign: 'right' }]}>{n(r.sacos, 0)}</Text>
                  <Text style={[s.td, { width: '13%', textAlign: 'right' }]}>{n(r.kg_por_saco)}</Text>
                  <Text style={[s.td, { width: '14%', textAlign: 'right' }]}>{n(r.kilos_sueltos)}</Text>
                  <Text style={[s.td, { width: '15%', textAlign: 'right' }]}>{n(r.total_kg)}</Text>
                  <Text style={[s.td, { width: '15%', textAlign: 'right', borderRightWidth: 0 }]}>{pct(r.rend_real)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={s.tr}>
            <Text style={[s.th, { width: '30%' }]}>TOTAL</Text>
            <Text style={[s.th, { width: '13%' }]} />
            <Text style={[s.th, { width: '13%' }]} />
            <Text style={[s.th, { width: '14%' }]} />
            <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>{n(m.kg_salida)}</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right', borderRightWidth: 0 }]} />
          </View>
        </View>

        {/* Cuadre de sacos */}
        {m.tipo_proceso !== 'repaso_clasificadora' && (
          <>
            <Text style={s.h2}>Cuadre de sacos — Oro Exportación</Text>
            <View style={s.cuadreBox}>
              {/* react-pdf pierde el espacio entre fragmentos JSX consecutivos
                  ("lotes" + {n} salía pegado como "lotes5"): un solo string
                  interpolado evita el problema — es un único nodo de texto. */}
              <Text>
                {`Producidos ${m.sacos_cuadre_total} + arrastre ${m.sacos_maquilas_previas} − enviados en lotes ${m.sacos_enviados_lotes} − torrefacción ${m.sacos_torrefaccion} − venta ${m.sacos_venta} − otro lote ${m.sacos_otro_lote}`}
              </Text>
              <Text style={{ marginTop: 3 }}>
                <Text style={s.bold}>{`= NO ENVIADOS: ${m.sacos_no_enviados}`}</Text>
                {m.sacos_repaso ? `   ·   Repaso: ${m.sacos_repaso}` : ''}
              </Text>
            </View>
          </>
        )}

        {m.observaciones && (
          <>
            <Text style={s.h2}>Observaciones</Text>
            <Text>{m.observaciones}</Text>
          </>
        )}

        {/* Firmas */}
        <Text style={s.h2}>Firmas</Text>
        <View style={s.tr} wrap={false}>
          {([
            ['elaboro', 'Elaboró', m.elaboro, img.firmaElaboro],
            ['entrego', 'Entregó', m.entrego, img.firmaEntrego],
            ['retrillero', 'Retrillero', m.retrillero, img.firmaRetrillero],
            ['calador', 'Calador', m.calador, img.firmaCalador],
          ] as const).map(([key, label, nombre, firma]) => (
            <View key={key} style={s.firmaBox}>
              {firma ? <Image style={s.firmaImg} src={firma} /> : <View style={{ height: 40 }} />}
              <Text style={s.firmaRol}>{label.toUpperCase()}</Text>
              <Text style={s.firmaNombre}>{nombre ?? '—'}</Text>
            </View>
          ))}
        </View>
      </Page>

      {/* Boletas de acopio que entraron */}
      {m.boletas.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <Text style={[s.title, { fontSize: 11 }]}>Boletas de acopio — {m.clave}</Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: '15%' }]}>Folio</Text>
              <Text style={[s.th, { width: '45%' }]}>Proveedor</Text>
              <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Sacos</Text>
              <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Kg netos</Text>
              <Text style={[s.th, { width: '14%', textAlign: 'right', borderRightWidth: 0 }]}>QQ</Text>
            </View>
            {m.boletas.map((b, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { width: '15%' }]}>{b.folio}</Text>
                <Text style={[s.td, { width: '45%' }]}>{b.proveedor_nombre}</Text>
                <Text style={[s.td, { width: '13%', textAlign: 'right' }]}>{n(b.sacos, 0)}</Text>
                <Text style={[s.td, { width: '13%', textAlign: 'right' }]}>{n(b.kg_netos)}</Text>
                <Text style={[s.td, { width: '14%', textAlign: 'right', borderRightWidth: 0 }]}>{n(b.quintales, 2)}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}
    </Document>
  )
}
