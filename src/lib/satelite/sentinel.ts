// Cliente de la Statistical API de Sentinel Hub sobre Copernicus Data Space
// Ecosystem (CDSE). Datos Sentinel-2 L2A: gratuitos, 10 m/pixel, revisita ~5 dias.
//
// SOLO SERVIDOR: CDSE_CLIENT_ID / CDSE_CLIENT_SECRET nunca se exponen al browser.
//
// Una sola llamada por parcela cubre TODA la ventana de tiempo: pedimos la
// agregacion en intervalos (P15D por defecto) y Sentinel Hub devuelve una
// estadistica por intervalo. Con eso llenamos la serie historica completa de la
// grafica con 1 request en vez de 12.

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'

// Evalscript v3: calcula los 3 indices por pixel y descarta nubes con la banda
// de clasificacion de escena (SCL). El promedio que devuelve la API ya viene
// libre de nubes porque los pixeles malos salen por dataMask.
//
//   NDVI = (B08 - B04) / (B08 + B04)                          vigor general
//   EVI  = 2.5*(B08-B04) / (B08 + 6*B04 - 7.5*B02 + 1)        mejor bajo sombra
//   NDWI = (B08 - B11) / (B08 + B11)                          agua en la hoja
//
// NOTA tecnica: usamos la variante de Gao (NIR/SWIR) para NDWI porque mide
// contenido de agua en la VEGETACION, que es lo que delata el estres hidrico.
// La variante de McFeeters (verde/NIR) detecta cuerpos de agua — no sirve aqui.
const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "evi",  bands: 1, sampleType: "FLOAT32" },
      { id: "ndwi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

// SCL: 0 sin datos, 1 saturado, 3 sombra de nube, 8 nube media,
//      9 nube alta, 10 cirrus, 11 nieve. Todo eso se descarta.
function esValido(scl) {
  return scl !== 0 && scl !== 1 && scl !== 3 && scl !== 8 && scl !== 9 && scl !== 10 && scl !== 11;
}

function evaluatePixel(s) {
  var valido = s.dataMask === 1 && esValido(s.SCL) ? 1 : 0;
  var ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  var evi  = 2.5 * (s.B08 - s.B04) / (s.B08 + 6.0 * s.B04 - 7.5 * s.B02 + 1.0);
  var ndwi = (s.B08 - s.B11) / (s.B08 + s.B11);
  return {
    ndvi: [ndvi],
    evi: [evi],
    ndwi: [ndwi],
    dataMask: [valido]
  };
}`

// --- OAuth2 client_credentials, con cache en memoria del proceso ---
let tokenCache: { token: string; expiraEn: number } | null = null

async function getToken(): Promise<string> {
  const clientId = process.env.CDSE_CLIENT_ID
  const clientSecret = process.env.CDSE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltan CDSE_CLIENT_ID / CDSE_CLIENT_SECRET. Crea las credenciales en el dashboard de Sentinel Hub (Copernicus Data Space) y agrégalas al .env.local y a Vercel.',
    )
  }

  // 60 s de margen para no usar un token que expira en el vuelo.
  if (tokenCache && Date.now() < tokenCache.expiraEn - 60_000) {
    return tokenCache.token
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(
      `No se pudo autenticar contra Copernicus (${res.status}). Revisa las credenciales. ${detalle.slice(0, 200)}`,
    )
  }

  const body = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    token: body.access_token,
    expiraEn: Date.now() + body.expires_in * 1000,
  }
  return body.access_token
}

// --- Forma de la respuesta de la Statistical API (solo lo que consumimos) ---
// OJO: cuando un intervalo sale 100% nublado, Sentinel Hub NO manda numeros:
// manda la CADENA "NaN" en min/max/mean/stDev. Por eso los tipamos como
// `number | string` y todo pasa por num() antes de tocar la base.
interface BandStats {
  min: number | string
  max: number | string
  mean: number | string
  stDev: number | string
  sampleCount: number
  noDataCount: number
}
interface StatsResponse {
  data?: {
    interval: { from: string; to: string }
    outputs?: Record<string, { bands: Record<string, { stats: BandStats }> }>
    error?: { type: string }
  }[]
  status?: string
  error?: unknown
}

// Un punto de la serie: los 3 indices de una parcela en una fecha.
export interface MedicionSatelital {
  fecha_imagen: string // YYYY-MM-DD (inicio del intervalo agregado)
  ndvi_promedio: number
  ndvi_min: number
  ndvi_max: number
  evi_promedio: number | null
  ndwi_promedio: number | null
  cobertura_nubes: number // % de pixeles descartados por nube/sombra
}

/**
 * Pide a Sentinel Hub la serie de indices de UN poligono.
 *
 * IMPORTANTE: el poligono debe venir REPROYECTADO A UTM (lo hace el RPC
 * get_poligonos_satelite con ST_Transform) y `srid` ser esa zona UTM.
 * Sentinel Hub interpreta resx/resy en las unidades del CRS: en lon/lat,
 * resx=10 seria "10 grados" y la parcela entera se mediria con UN pixel.
 * En UTM son 10 metros reales, y ademas es la rejilla nativa de Sentinel-2.
 *
 * @param geojson  geometria de la parcela en coordenadas UTM
 * @param srid     EPSG de la zona UTM (p.ej. 32615 = zona 15N, Chiapas)
 * @param desde    fecha inicial YYYY-MM-DD
 * @param hasta    fecha final   YYYY-MM-DD
 * @param intervaloDias  tamano del bin de agregacion
 */
export async function obtenerIndices(
  geojson: GeoJSON.Polygon,
  srid: number,
  desde: string,
  hasta: string,
  intervaloDias = 15,
): Promise<MedicionSatelital[]> {
  const token = await getToken()

  const payload = {
    input: {
      bounds: {
        geometry: geojson,
        properties: {
          crs: `http://www.opengis.net/def/crs/EPSG/0/${srid}`,
        },
      },
      data: [
        {
          type: 'sentinel-2-l2a',
          dataFilter: {
            // Escenas con mas de 70% de nube no aportan nada util.
            maxCloudCoverage: 70,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${desde}T00:00:00Z`,
        to: `${hasta}T23:59:59Z`,
      },
      aggregationInterval: { of: `P${intervaloDias}D` },
      evalscript: EVALSCRIPT,
      // Resolucion nativa de Sentinel-2 en las bandas que usamos.
      resx: 10,
      resy: 10,
    },
    calculations: { default: {} },
  }

  const res = await fetch(STATISTICS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(
      `Sentinel Hub respondió ${res.status}: ${detalle.slice(0, 300)}`,
    )
  }

  const body = (await res.json()) as StatsResponse

  // --- Paso 1: quedarnos con los intervalos que traen una media real ---
  //
  // sampleCount NO es el numero de pixeles de la parcela: es el del RECTANGULO
  // que la envuelve. Todo lo que cae fuera del poligono entra en noDataCount
  // junto con las nubes. Por eso `noDataCount / sampleCount` NO es nubosidad:
  // en esta parcela daba un 42% constante hasta en dias perfectamente despejados
  // (era, simplemente, la esquina del rectangulo que sobra).
  const crudas = (body.data ?? []).flatMap((intervalo) => {
    if (intervalo.error || !intervalo.outputs) return []

    const ndvi = intervalo.outputs.ndvi?.bands?.B0?.stats
    if (!ndvi || ndvi.sampleCount === 0) return []

    // Intervalo 100% nublado: Sentinel Hub manda la CADENA "NaN" en las medias.
    const media = num(ndvi.mean)
    if (media === null) return []

    const evi = intervalo.outputs.evi?.bands?.B0?.stats
    const ndwi = intervalo.outputs.ndwi?.bands?.B0?.stats

    return [
      {
        fecha_imagen: intervalo.interval.from.slice(0, 10),
        ndvi_promedio: media,
        ndvi_min: num(ndvi.min) ?? media,
        ndvi_max: num(ndvi.max) ?? media,
        evi_promedio: evi ? num(evi.mean) : null,
        ndwi_promedio: ndwi ? num(ndwi.mean) : null,
        // Pixeles que SI se midieron: dentro del poligono y sin nube.
        validos: ndvi.sampleCount - ndvi.noDataCount,
      },
    ]
  })

  if (crudas.length === 0) return []

  // --- Paso 2: calibrar cuantos pixeles tiene realmente la parcela ---
  //
  // El pase mas despejado de la ventana nos da el tamano real del poligono en
  // pixeles. Contra ese numero, y no contra el rectangulo, se mide la nubosidad.
  const pixelesParcela = Math.max(...crudas.map((c) => c.validos))

  // --- Paso 3: descartar los pases donde casi todo estaba tapado ---
  //
  // Una media sacada del 9% de la parcela que asomaba entre las nubes NO es la
  // salud de la parcela: son sus bordes. En pruebas, un pase con 91% de nube dio
  // NDVI 0.407 en una parcela sana (0.80) — habria disparado una alerta falsa de
  // estres hidrico. Exigimos ver al menos un tercio del poligono.
  const VISIBILIDAD_MINIMA = 0.33

  const mediciones: MedicionSatelital[] = crudas.flatMap((c) => {
    const visible = c.validos / pixelesParcela
    if (visible < VISIBILIDAD_MINIMA) return []

    return [
      {
        fecha_imagen: c.fecha_imagen,
        ndvi_promedio: c.ndvi_promedio,
        ndvi_min: c.ndvi_min,
        ndvi_max: c.ndvi_max,
        evi_promedio: c.evi_promedio,
        ndwi_promedio: c.ndwi_promedio,
        cobertura_nubes: Math.round((1 - visible) * 10000) / 100,
      },
    ]
  })

  // Orden cronologico: la grafica y el "ultimo indice" dependen de esto.
  mediciones.sort((a, b) => a.fecha_imagen.localeCompare(b.fecha_imagen))
  return mediciones
}

// Convierte a numero redondeado a 4 decimales (numeric(6,4) en Postgres), o
// null si Sentinel Hub mando "NaN" / algo que no es un numero finito.
function num(v: number | string | undefined): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 10000) / 10000
}
