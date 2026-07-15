// Documento PDF del recibo de acopio (@react-pdf/renderer, vectorial, servidor).
// 3 páginas, fieles a la plantilla RECIBO.docx:
//   1. Recibo de entrega   2. Evidencias fotográficas   3. Control de pesadas
// Las imágenes llegan ya resueltas como DATA URI (el route las descarga y
// codifica): react-pdf no acepta un Buffer crudo en <Image src>, pero sí un
// data URI, y así el mime viaja con el dato.
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { EntradaDetalle } from '@/lib/acopio/tipos'

export interface Imagenes {
  logoIzq?: string
  logoDer?: string
  firmaReceptor?: string
  firmaProveedor?: string
  fotos: { label: string; data: string }[]
}

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 58, height: 58, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { marginTop: 12, marginBottom: 10, textAlign: 'center', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  h2: { marginBottom: 8, textAlign: 'center', fontSize: 12, fontFamily: 'Helvetica-Bold' },
  row2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  dato: { marginBottom: 3 },
  table: { marginBottom: 10, borderWidth: 1, borderColor: '#64748b' },
  tr: { flexDirection: 'row' },
  th: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3,
    fontFamily: 'Helvetica-Bold', backgroundColor: '#f1f5f9' },
  td: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3 },
  k: { width: '50%', fontFamily: 'Helvetica-Bold' },
  v: { width: '50%', textAlign: 'center' },
  firmaBox: { width: '50%', borderWidth: 1, borderColor: '#64748b', padding: 4, alignItems: 'center' },
  firmaImg: { height: 50, objectFit: 'contain' },
  firmaRol: { marginTop: 4, borderTopWidth: 1, borderTopColor: '#64748b', paddingTop: 3,
    fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'center', width: '100%' },
  foto: { width: '48%', marginBottom: 12 },
  fotoImg: { height: 170, objectFit: 'contain', borderWidth: 1, borderColor: '#cbd5e1' },
})

const pct = (v: number | null) => (v == null ? '—' : `${(Number(v) * 100).toFixed(2)}%`)
const n = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: d })

// Anchos de la tabla de pesadas (suman 100).
const W = [5, 8, 10, 8, 10, 7, 10, 9, 8, 9, 8, 8]
const CAB = ['#', 'M1 sacos', 'M1 kgs', 'M2 sacos', 'M2 kgs', 'Sacos', 'Kgs brutos',
  'D. plástico', 'D. yute', 'D. henequén', 'Tara', 'Kgs netos']

export function ReciboPdf({
  entrada, tara, img,
}: {
  entrada: EntradaDetalle
  tara: Record<string, number>
  img: Imagenes
}) {
  const t = { plastico: tara.plastico ?? 0.3, yute: tara.yute ?? 1, henequen: tara.henequen ?? 1.3 }
  const aplicaQuintal = entrada.quintales != null

  const tot = entrada.pesadas.reduce(
    (a, p) => ({
      m1s: a.m1s + p.m1_sacos, m1k: a.m1k + Number(p.m1_kgs),
      m2s: a.m2s + p.m2_sacos, m2k: a.m2k + Number(p.m2_kgs),
      sacos: a.sacos + p.sacos_total, brutos: a.brutos + Number(p.kg_brutos),
      pl: a.pl + p.plastico, yu: a.yu + p.yute, he: a.he + p.henequen,
      tara: a.tara + Number(p.tara_kg), netos: a.netos + Number(p.kg_netos),
    }),
    { m1s: 0, m1k: 0, m2s: 0, m2k: 0, sacos: 0, brutos: 0, pl: 0, yu: 0, he: 0, tara: 0, netos: 0 },
  )

  const Fila = ({ k, v }: { k: string; v: string }) => (
    <View style={s.tr}>
      <Text style={[s.td, s.k]}>{k}</Text>
      <Text style={[s.td, s.v]}>{v}</Text>
    </View>
  )

  return (
    <Document title={`Recibo ${entrada.folio}`} author="CASFA">
      {/* ---------------- Página 1: Recibo ---------------- */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {img.logoIzq ? <Image style={s.logo} src={img.logoIzq} /> : <View style={s.logo} />}
          <View style={s.headerText}>
            <Text style={s.bold}>CENTRO AGROECOLÓGICO SAN FRANCISCO DE ASÍS</Text>
            <Text>1A AVENIDA NORTE #130, COLONIA CENTRO, TAPACHULA, CHIAPAS</Text>
            <Text>EMAIL: contacto@redcasfa.com</Text>
            <Text>TEL: 962 118 28 08 · TEL: 962 625 06 43</Text>
          </View>
          {img.logoDer ? <Image style={s.logo} src={img.logoDer} /> : <View style={s.logo} />}
        </View>

        <Text style={s.title}>RECIBO DE ENTREGA</Text>

        <View style={s.row2}>
          <Text><Text style={s.bold}>FECHA DE ACOPIO: </Text>{entrada.fecha_acopio}</Text>
          <Text><Text style={s.bold}>ENTRADA: </Text>#{entrada.folio}</Text>
        </View>
        <View style={s.row2}>
          <Text><Text style={s.bold}>COMUNIDAD: </Text>{entrada.comunidad ?? '—'}</Text>
          <Text><Text style={s.bold}>MUNICIPIO: </Text>{entrada.municipio ?? '—'}</Text>
        </View>
        <Text style={s.dato}><Text style={s.bold}>PROVEEDOR: </Text>{entrada.proveedor_nombre}</Text>
        <Text style={{ marginBottom: 10 }}>
          <Text style={s.bold}>TIPO DE CAFÉ: </Text>{entrada.especie} {entrada.tipo}
        </Text>

        <View style={s.table}>
          <Fila k="RENDIMIENTO" v={pct(entrada.rendimiento)} />
          <Fila k="ZARANDA 16" v={pct(entrada.zaranda_16)} />
          <Fila k="ZARANDA 15" v={pct(entrada.zaranda_15)} />
          <Fila k="CARACOL" v={pct(entrada.caracol)} />
          <Fila k="MANCHA" v={pct(entrada.mancha)} />
          <Fila k="COSECHA" v={entrada.cosecha ?? '—'} />
          <Fila k="HUMEDAD" v={pct(entrada.humedad)} />
        </View>

        <View style={s.table}>
          <Fila k="NO. DE SACOS ACOPIADOS" v={n(entrada.total_sacos, 0)} />
          <Fila k="KGS BRUTOS" v={n(entrada.kg_brutos)} />
          <Fila k="KGS TARAS" v={n(entrada.tara_kg)} />
          <Fila k="KGS NETOS" v={n(entrada.kg_netos)} />
          <Fila k="QUINTALES" v={aplicaQuintal ? n(entrada.quintales) : 'No aplica'} />
        </View>

        <View style={[s.table, s.tr]}>
          <Text style={[s.td, { width: '33.33%', textAlign: 'center' }]}>YUTE: {entrada.yute}</Text>
          <Text style={[s.td, { width: '33.33%', textAlign: 'center' }]}>PLÁSTICO: {entrada.plastico}</Text>
          <Text style={[s.td, { width: '33.34%', textAlign: 'center' }]}>HENEQUÉN: {entrada.henequen}</Text>
        </View>

        <View style={s.tr}>
          <View style={s.firmaBox}>
            {img.firmaReceptor ? <Image style={s.firmaImg} src={img.firmaReceptor} /> : <View style={{ height: 50 }} />}
            <Text style={s.firmaRol}>ADMINISTRADOR ALMACÉN / PESADOR</Text>
          </View>
          <View style={s.firmaBox}>
            {img.firmaProveedor ? <Image style={s.firmaImg} src={img.firmaProveedor} /> : <View style={{ height: 50 }} />}
            <Text style={s.firmaRol}>PROVEEDOR / CHOFER</Text>
          </View>
        </View>
        <View style={{ borderWidth: 1, borderTopWidth: 0, borderColor: '#64748b', padding: 6 }}>
          <Text><Text style={s.bold}>OBSERVACIONES: </Text>{entrada.comentarios ?? '—'}</Text>
        </View>
      </Page>

      {/* ---------------- Página 2: Evidencias ---------------- */}
      <Page size="LETTER" style={s.page}>
        <Text style={s.h2}>EVIDENCIAS FOTOGRÁFICAS · Entrada #{entrada.folio}</Text>
        {img.fotos.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#94a3b8' }}>
            Sin evidencias fotográficas registradas.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {img.fotos.map((f) => (
              <View key={f.label} style={s.foto}>
                <Text style={{ marginBottom: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold' }}>{f.label}</Text>
                <Image style={s.fotoImg} src={f.data} />
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* ---------------- Página 3: Control de pesadas ---------------- */}
      <Page size="LETTER" orientation="landscape" style={s.page}>
        <Text style={s.h2}>CONTROL DE PESADAS · Entrada #{entrada.folio}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            {CAB.map((c, i) => (
              <Text key={c} style={[s.th, { width: `${W[i]}%`, textAlign: 'center', fontSize: 7 }]}>{c}</Text>
            ))}
          </View>
          {entrada.pesadas.map((p) => {
            const celdas = [
              String(p.numero_pesada), String(p.m1_sacos), n(p.m1_kgs), String(p.m2_sacos), n(p.m2_kgs),
              String(p.sacos_total), n(p.kg_brutos), n(p.plastico * t.plastico), n(p.yute * t.yute),
              n(p.henequen * t.henequen), n(p.tara_kg), n(p.kg_netos),
            ]
            return (
              <View key={p.id} style={s.tr}>
                {celdas.map((c, i) => (
                  <Text key={i} style={[s.td, { width: `${W[i]}%`, textAlign: i === 0 ? 'center' : 'right', fontSize: 7 }]}>{c}</Text>
                ))}
              </View>
            )
          })}
          <View style={s.tr}>
            {['TOTAL', String(tot.m1s), n(tot.m1k), String(tot.m2s), n(tot.m2k), String(tot.sacos),
              n(tot.brutos), n(tot.pl * t.plastico), n(tot.yu * t.yute), n(tot.he * t.henequen),
              n(tot.tara), n(tot.netos)].map((c, i) => (
              <Text key={i} style={[s.th, { width: `${W[i]}%`, textAlign: i === 0 ? 'center' : 'right', fontSize: 7 }]}>{c}</Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}
