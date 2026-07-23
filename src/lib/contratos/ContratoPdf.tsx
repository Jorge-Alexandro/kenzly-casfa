// Documento PDF del contrato de fijación (@react-pdf/renderer, vectorial).
// Membrete con el logo/sello de CASFASA arriba, cláusulas numeradas, arbitraje
// conmutable y bloques de firma (con el sello estampado junto a la de CASFA).
// Las imágenes llegan como DATA URI (react-pdf no acepta Buffer en <Image>).
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { folioContrato } from '@/lib/contratos/tipos'
import type { ContratoDetalle, ContratoConfig } from '@/lib/contratos/tipos'

export interface ContratoImagenes {
  logoCasfa?: string // logo CASFA (Red Maya) — izquierda del encabezado
  membrete?: string // logo CASFASA — derecha del encabezado
  sello?: string // sello de aprobación (se estampa junto a la firma de CASFA)
  firmaVendedor?: string
  firmaComprador?: string // Adrián
}

// Encabezado fijo de CASFA (mismo membrete que el recibo de acopio).
const ENCABEZADO = {
  razon: 'CENTRO AGROECOLÓGICO SAN FRANCISCO DE ASÍS',
  domicilio: '1A AVENIDA NORTE #130, COLONIA CENTRO, TAPACHULA, CHIAPAS',
  email: 'EMAIL: contacto@redcasfa.com',
  tel: 'TEL: 962 118 28 08 · TEL: 962 625 06 43',
}

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 44, fontSize: 10, color: '#1f2937', lineHeight: 1.4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 62, height: 56, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.35 },
  razon: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1f2937' },
  domicilio: { fontSize: 8, color: '#4b5563', marginTop: 1 },
  title: { marginTop: 14, textAlign: 'center', fontSize: 13, fontFamily: 'Helvetica-Bold' },
  folio: { textAlign: 'center', fontSize: 10, color: '#6b7280', marginTop: 2, marginBottom: 10 },
  intro: { textAlign: 'justify', marginBottom: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  clausula: { marginBottom: 6 },
  clTitulo: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  clTexto: { textAlign: 'justify' },
  tabla: { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 2, marginBottom: 10 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  trLast: { flexDirection: 'row' },
  k: { width: '38%', padding: 4, fontFamily: 'Helvetica-Bold', backgroundColor: '#f3f4f6' },
  v: { width: '62%', padding: 4 },
  firmas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  firmaBox: { width: '44%', alignItems: 'center' },
  firmaImg: { height: 46, objectFit: 'contain', marginBottom: 2 },
  selloImg: { position: 'absolute', width: 96, height: 96, objectFit: 'contain', opacity: 0.6, top: -40, right: -10 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: '#374151', width: '100%', marginTop: 6, paddingTop: 4, textAlign: 'center' },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 9, textAlign: 'center' },
  firmaRol: { fontSize: 8, color: '#6b7280', textAlign: 'center' },
  pie: { position: 'absolute', bottom: 24, left: 44, right: 44, textAlign: 'center', fontSize: 7, color: '#9ca3af', borderTopWidth: 0.5, borderTopColor: '#d1d5db', paddingTop: 4 },
})

const money = (n: number | null | undefined, moneda = 'MXN') =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
const cant = (n: number | null | undefined, u = 'quintal') => {
  if (n == null) return '—'
  const v = Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 })
  return `${v} ${Number(n) === 1 ? u : u === 'quintal' ? 'quintales' : u}`
}
const fechaLarga = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${Number(d)} de ${meses[Number(m) - 1] ?? ''} de ${y}`
}

function Fila({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={last ? s.trLast : s.tr}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
    </View>
  )
}

function Clausula({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <View style={s.clausula}>
      <Text style={s.clTitulo}>
        {romano(n)}. {titulo}.
      </Text>
      <Text style={s.clTexto}>{texto}</Text>
    </View>
  )
}

const romano = (n: number) =>
  ['', 'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA'][n] ?? `${n}`

export function ContratoPdf({
  contrato,
  config,
  img,
}: {
  contrato: ContratoDetalle
  config: ContratoConfig | null
  img: ContratoImagenes
}) {
  const razon = config?.razon_social ?? 'CASFA'
  const rep = config?.representante_nombre ?? 'Representante Legal'
  const repCargo = config?.representante_cargo ?? 'Representante Legal'

  // Numeración de cláusulas: sólo aparecen las que tienen texto.
  const clausulas: { titulo: string; texto: string }[] = []
  // El volumen se dice en kilos y, entre paréntesis, en quintales: el productor
  // habla en sacos y el pago se hace por kilo. Las dos cifras van en el papel.
  const kg = Number(contrato.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })
  const qq =
    contrato.quintales == null
      ? null
      : Number(contrato.quintales).toLocaleString('es-MX', { maximumFractionDigits: 3 })

  clausulas.push({
    titulo: 'OBJETO',
    texto:
      `El VENDEDOR se obliga a vender y entregar al COMPRADOR ${kg} kilogramos` +
      (qq ? ` (equivalentes a ${qq} quintales)` : '') +
      ` de ${contrato.especie} ${contrato.tipo}, y el COMPRADOR a pagar por ellos el precio pactado en la cláusula siguiente.`,
  })
  clausulas.push({
    titulo: 'PRECIO Y FORMA DE PAGO',
    texto:
      `El precio pactado es de ${money(contrato.precio_unitario, contrato.moneda)} por KILOGRAMO` +
      (contrato.factor_quintal
        ? ` (${money(Number(contrato.precio_unitario) * Number(contrato.factor_quintal), contrato.moneda)} por quintal de ${contrato.factor_quintal} kg)`
        : '') +
      `, para un importe total de ${money(contrato.importe, contrato.moneda)}` +
      (contrato.anticipo > 0 ? `, del cual se entrega un anticipo de ${money(contrato.anticipo, contrato.moneda)}.` : '.'),
  })
  if (contrato.calidad_texto) clausulas.push({ titulo: 'CALIDAD', texto: contrato.calidad_texto })
  if (contrato.costalera_texto) clausulas.push({ titulo: 'COSTALERA Y ETIQUETADO', texto: contrato.costalera_texto })
  clausulas.push({
    titulo: 'ENTREGA',
    texto:
      `La entrega se realizará ${contrato.fecha_entrega ? `a más tardar el ${fechaLarga(contrato.fecha_entrega)}` : 'conforme a lo acordado entre las partes'}, ` +
      `en la bodega de acopio del COMPRADOR.`,
  })
  if (contrato.condiciones_texto) clausulas.push({ titulo: 'CONDICIONES', texto: contrato.condiciones_texto })
  if (contrato.arbitraje_texto) clausulas.push({ titulo: 'ARBITRAJE', texto: contrato.arbitraje_texto })

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Membrete: logo CASFA · datos de contacto · logo CASFASA */}
        <View style={s.header}>
          {img.logoCasfa ? <Image style={s.logo} src={img.logoCasfa} /> : <View style={s.logo} />}
          <View style={s.headerText}>
            <Text style={s.razon}>{ENCABEZADO.razon}</Text>
            <Text style={s.domicilio}>{ENCABEZADO.domicilio}</Text>
            <Text style={s.domicilio}>{ENCABEZADO.email}</Text>
            <Text style={s.domicilio}>{ENCABEZADO.tel}</Text>
          </View>
          {img.membrete ? <Image style={s.logo} src={img.membrete} /> : <View style={s.logo} />}
        </View>

        <Text style={s.title}>CONTRATO DE COMPRAVENTA DE CAFÉ A PRECIO DE FIJACIÓN</Text>
        <Text style={s.folio}>{folioContrato(contrato.folio)}{contrato.ciclo ? ` · Ciclo ${contrato.ciclo}` : ''}</Text>

        <Text style={s.intro}>
          En {contrato.lugar_firma ?? '—'}, a {fechaLarga(contrato.fecha)}, celebran el presente contrato, por una
          parte <Text style={s.bold}>{razon}</Text> como <Text style={s.bold}>COMPRADOR</Text>, representado por{' '}
          {rep}; y por la otra <Text style={s.bold}>{contrato.vendedor_nombre}</Text> como{' '}
          <Text style={s.bold}>VENDEDOR</Text>, al tenor de las siguientes cláusulas.
        </Text>

        {/* Datos del vendedor */}
        <View style={s.tabla}>
          <Fila k="Vendedor" v={contrato.vendedor_nombre} />
          <Fila k="Domicilio" v={contrato.vendedor_domicilio ?? '—'} />
          <Fila k="Comunidad / Municipio" v={[contrato.comunidad, contrato.municipio].filter(Boolean).join(', ') || '—'} />
          <Fila k="CURP / RFC" v={[contrato.vendedor_curp, contrato.vendedor_rfc].filter(Boolean).join(' / ') || '—'} last />
        </View>

        {/* Cláusulas */}
        {clausulas.map((cl, i) => (
          <Clausula key={cl.titulo} n={i + 1} titulo={cl.titulo} texto={cl.texto} />
        ))}

        {/* Firmas: las dos juntas. `wrap={false}` evita que se partan entre
            páginas (antes el vendedor quedaba en una y CASFA en la otra).
            `minPresenceAhead` reserva espacio para que salten completas si no
            caben abajo de las cláusulas. */}
        <View style={s.firmas} wrap={false}>
          <View style={s.firmaBox}>
            {img.firmaVendedor ? <Image style={s.firmaImg} src={img.firmaVendedor} /> : <View style={{ height: 46 }} />}
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{contrato.vendedor_nombre}</Text>
              <Text style={s.firmaRol}>EL VENDEDOR</Text>
            </View>
          </View>

          <View style={s.firmaBox}>
            {img.sello ? <Image style={s.selloImg} src={img.sello} /> : null}
            {img.firmaComprador ? <Image style={s.firmaImg} src={img.firmaComprador} /> : <View style={{ height: 46 }} />}
            <View style={s.firmaLinea}>
              <Text style={s.firmaNombre}>{rep}</Text>
              <Text style={s.firmaRol}>POR EL COMPRADOR · {repCargo}</Text>
            </View>
          </View>
        </View>

        <Text style={s.pie} fixed>
          {razon} · Contrato de fijación {folioContrato(contrato.folio)} · Documento generado por Kenzly CASFA
        </Text>
      </Page>
    </Document>
  )
}
