// Documento PDF del reporte de taller (@react-pdf/renderer, servidor).
// Sustituye el .docx de ~10 páginas que hoy se escribe a mano: la plantilla
// (fija por tipo) + el evento (comunidad/fecha/técnico) + la asistencia real +
// las fotos, armados en un solo documento.
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { Taller, PlantillaTaller, TallerFoto } from '@/lib/data/agro-talleres'
import { sustituirMarcadores, fechaLargaEs } from '@/lib/agroecologia/taller-tipos'

export interface Imagenes {
  logoIzq?: string
  logoDer?: string
  fotos: { url: string; descripcion: string | null; data?: string }[]
}

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#1e293b', lineHeight: 1.4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: '#94a3b8', paddingBottom: 8 },
  logo: { width: 52, height: 52, objectFit: 'contain' },
  headerText: { flex: 1, textAlign: 'center', lineHeight: 1.3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  title: { marginTop: 16, marginBottom: 4, textAlign: 'center', fontSize: 15, fontFamily: 'Helvetica-Bold' },
  subtitle: { marginBottom: 16, textAlign: 'center', fontSize: 10, color: '#64748b' },
  h2: { marginTop: 14, marginBottom: 6, fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#c2410c' },
  ficha: { borderWidth: 1, borderColor: '#64748b' },
  fr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  fk: { width: '28%', padding: 5, backgroundColor: '#f1f5f9', fontFamily: 'Helvetica-Bold' },
  fv: { width: '72%', padding: 5 },
  parrafo: { marginBottom: 6, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletMark: { width: 12 },
  table: { borderWidth: 1, borderColor: '#64748b', marginTop: 4 },
  tr: { flexDirection: 'row' },
  th: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3,
    fontFamily: 'Helvetica-Bold', backgroundColor: '#f1f5f9', fontSize: 7.5 },
  td: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#64748b', padding: 3, fontSize: 8 },
  foto: { width: '48%', marginBottom: 12 },
  fotoImg: { height: 160, objectFit: 'cover', borderWidth: 1, borderColor: '#cbd5e1' },
  fotoCap: { marginTop: 2, textAlign: 'center', fontSize: 7, color: '#64748b' },
})

const n = (v: number | null | undefined) => (v == null ? '—' : String(v))

function Parrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\n\n+/).filter((p) => p.trim()).map((p, i) => (
        <Text key={i} style={s.parrafo}>{p.trim()}</Text>
      ))}
    </>
  )
}

export function TallerPdf({
  taller, plantilla, tipoNombre, programaNombre, asistentes, img,
}: {
  taller: Taller
  plantilla: PlantillaTaller | null
  tipoNombre: string
  programaNombre: string
  asistentes: { nombre_completo: string; sexo: string | null; organizacion: string | null }[]
  img: Imagenes
}) {
  const sust = (t: string | null) => sustituirMarcadores(t, taller)
  const nombreTaller = plantilla?.nombre_taller || tipoNombre
  const fechaLarga = fechaLargaEs(taller.fecha)

  const Fila = ({ k, v }: { k: string; v: string }) => (
    <View style={s.fr}>
      <Text style={s.fk}>{k}</Text>
      <Text style={s.fv}>{v}</Text>
    </View>
  )

  return (
    <Document title={`Taller ${nombreTaller} — ${taller.comunidad}`} author="CASFA">
      {/* ---- Página 1: portada + ficha ---- */}
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

        <Text style={s.title}>{nombreTaller}</Text>
        <Text style={s.subtitle}>Programa {programaNombre}</Text>

        <View style={s.ficha}>
          <Fila k="Lugar" v={`${taller.comunidad}${taller.municipio ? `, municipio de ${taller.municipio}, Chiapas` : ''}`} />
          <Fila k="Fecha" v={fechaLarga} />
          <Fila k="Participantes" v={sust(plantilla?.participantes ?? null) || '—'} />
          <Fila k="Asesores" v={taller.tecnico || sust(plantilla?.asesores ?? null) || '—'} />
        </View>

        {plantilla?.objetivo_general && (
          <>
            <Text style={s.h2}>Objetivo general</Text>
            <Parrafos texto={sust(plantilla.objetivo_general)} />
          </>
        )}

        {plantilla && plantilla.objetivos_especificos.length > 0 && (
          <>
            <Text style={s.h2}>Objetivos específicos</Text>
            {plantilla.objetivos_especificos.map((o, i) => (
              <View key={i} style={s.bullet}>
                <Text style={s.bulletMark}>•</Text>
                <Text style={{ flex: 1 }}>{sust(o)}</Text>
              </View>
            ))}
          </>
        )}

        {plantilla && plantilla.ficha_descriptiva.length > 0 && (
          <>
            <Text style={s.h2}>Ficha descriptiva</Text>
            <View style={s.table}>
              {plantilla.ficha_descriptiva.map((c, i) => (
                <View key={i} style={s.tr}>
                  <Text style={[s.td, { width: '100%', borderRightWidth: 0 }]}>{sust(c)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Page>

      {/* ---- Página 2: introducción + desarrollo ---- */}
      <Page size="LETTER" style={s.page}>
        {plantilla?.introduccion && (
          <>
            <Text style={s.h2}>Introducción</Text>
            <Parrafos texto={sust(plantilla.introduccion)} />
          </>
        )}
        {plantilla?.desarrollo && (
          <>
            <Text style={s.h2}>Desarrollo del taller</Text>
            <Parrafos texto={sust(plantilla.desarrollo)} />
          </>
        )}
        {taller.notas && (
          <>
            <Text style={s.h2}>Notas del día</Text>
            <Parrafos texto={taller.notas} />
          </>
        )}
        {plantilla?.acuerdos && (
          <>
            <Text style={s.h2}>Acuerdos</Text>
            <Parrafos texto={sust(plantilla.acuerdos)} />
          </>
        )}
        {plantilla?.conclusiones && (
          <>
            <Text style={s.h2}>Conclusiones</Text>
            <Parrafos texto={sust(plantilla.conclusiones)} />
          </>
        )}
      </Page>

      {/* ---- Página 3: lista de asistencia ---- */}
      <Page size="LETTER" style={s.page}>
        <Text style={[s.title, { fontSize: 12 }]}>Lista de asistencia</Text>
        {asistentes.length > 0 ? (
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { width: '8%' }]}>#</Text>
              <Text style={[s.th, { width: '52%' }]}>Nombre</Text>
              <Text style={[s.th, { width: '15%' }]}>Sexo</Text>
              <Text style={[s.th, { width: '25%', borderRightWidth: 0 }]}>Organización</Text>
            </View>
            {asistentes.map((a, i) => (
              <View key={i} style={s.tr}>
                <Text style={[s.td, { width: '8%' }]}>{i + 1}</Text>
                <Text style={[s.td, { width: '52%' }]}>{a.nombre_completo}</Text>
                <Text style={[s.td, { width: '15%' }]}>{a.sexo ?? '—'}</Text>
                <Text style={[s.td, { width: '25%', borderRightWidth: 0 }]}>{a.organizacion ?? '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>
            {taller.historico
              ? 'La lista de este taller se firmó en papel y no está digitalizada.'
              : 'Sin lista de asistencia enlazada todavía.'}
          </Text>
        )}
        <Text style={{ marginTop: 10 }}>Total de asistentes: {n(asistentes.length || null)}</Text>
      </Page>

      {/* ---- Anexo fotográfico ---- */}
      {img.fotos.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <Text style={[s.title, { fontSize: 12 }]}>Evidencias fotográficas</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {img.fotos.map((f, i) => (
              f.data ? (
                <View key={i} style={s.foto}>
                  <Image style={s.fotoImg} src={f.data} />
                  {f.descripcion && <Text style={s.fotoCap}>{f.descripcion}</Text>}
                </View>
              ) : null
            ))}
          </View>
        </Page>
      )}
    </Document>
  )
}
