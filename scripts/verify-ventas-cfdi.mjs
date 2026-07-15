// ============================================================================
// Verificación del motor CFDI de Ventas contra el caso real: factura 4138,
// cliente AET1809215E3 "AGROINDUSTRIAS ECOLOGICAS DEL TROPICO SAN BENITO",
// concepto "CAFE ORO VERDE ARABE CALIDAD SEGUNDAS": 160 kg a $90 + 2 kg a
// $100 = $14,600. Correr con:  node scripts/verify-ventas-cfdi.mjs
// (mismo patrón que verify-acopio-calculo.mjs)
// ============================================================================
import { parsearCfdi, clasificarLinea, sumaConceptos } from '../src/lib/ventas/cfdi.mjs'

let ok = 0
let fail = 0
function check(nombre, actual, esperado) {
  const pasa = JSON.stringify(actual) === JSON.stringify(esperado)
  if (pasa) { ok++; console.log(`  OK   ${nombre}`) }
  else { fail++; console.log(`  FAIL ${nombre}\n       actual:   ${JSON.stringify(actual)}\n       esperado: ${JSON.stringify(esperado)}`) }
}

// --- CFDI 4.0 con la forma real que emite el SAT (namespace oficial) --------
const XML_4138 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="4.0"
  Serie="A" Folio="4138" Fecha="2026-03-18T11:42:07" Moneda="MXN"
  SubTotal="14600.00" Total="14600.00" TipoDeComprobante="I"
  LugarExpedicion="30700">
  <cfdi:Emisor Rfc="CAS000906K11" Nombre="CENTRO AGROECOLOGICO SAN FRANCISCO DE ASIS" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="AET1809215E3" Nombre="AGROINDUSTRIAS ECOL&#211;GICAS DEL TROPICO SAN BENITO"
    DomicilioFiscalReceptor="30798" RegimenFiscalReceptor="601" UsoCFDI="G01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="50201713" NoIdentificacion="CV-SEG" Cantidad="160"
      ClaveUnidad="KGM" Unidad="Kilogramo" Descripcion="CAFE ORO VERDE ARABE CALIDAD SEGUNDAS"
      ValorUnitario="90.00" Importe="14400.00" ObjetoImp="01"/>
    <cfdi:Concepto ClaveProdServ="50201713" NoIdentificacion="CV-SEG" Cantidad="2"
      ClaveUnidad="KGM" Unidad="Kilogramo" Descripcion="CAFE ORO VERDE ARABE CALIDAD SEGUNDAS"
      ValorUnitario="100.00" Importe="200.00" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1" UUID="AAAA1111-BBBB-2222-CCCC-333344445555"
      FechaTimbrado="2026-03-18T11:45:00" SelloCFD="x" NoCertificadoSAT="0" SelloSAT="x"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`

console.log('— Factura 4138 —')
const f = parsearCfdi(XML_4138)
check('fecha', f.fecha, '2026-03-18')
check('total', f.total, 14600)
check('folio interno', f.folioInterno, '4138')
check('folio fiscal (UUID timbre)', f.folioFiscal, 'AAAA1111-BBBB-2222-CCCC-333344445555')
check('receptor RFC', f.receptor.rfc, 'AET1809215E3')
check('receptor nombre (entidad &#211; decodificada)', f.receptor.nombre, 'AGROINDUSTRIAS ECOLÓGICAS DEL TROPICO SAN BENITO')
check('conceptos', f.conceptos.length, 2)
check('concepto 1: 160 kg × $90', [f.conceptos[0].cantidad, f.conceptos[0].valorUnitario, f.conceptos[0].importe], [160, 90, 14400])
check('concepto 2: 2 kg × $100', [f.conceptos[1].cantidad, f.conceptos[1].valorUnitario, f.conceptos[1].importe], [2, 100, 200])
check('suma conceptos = total', sumaConceptos(f), 14600)
check('línea: ORO VERDE gana a CAFE', f.conceptos[0].linea, 'Café Verde')
check('claveUnidad', f.conceptos[0].claveUnidad, 'KGM')

console.log('— Clasificación de líneas (orden de prioridad) —')
check('ORO VERDE → Café Verde', clasificarLinea('CAFE ORO VERDE ARABE CALIDAD SEGUNDAS'), 'Café Verde')
check('ORO ROBUSTA → Café Robusta Export.', clasificarLinea('CAFE ORO ROBUSTA EXPORTACION'), 'Café Robusta Export.')
check('CACAO FERMENTADO → Cacao en Grano', clasificarLinea('CACAO FERMENTADO PREMIUM'), 'Cacao en Grano')
check('CACAO LAVADO → Cacao en Grano', clasificarLinea('CACAO LAVADO A GRANEL'), 'Cacao en Grano')
check('MIEL → Miel', clasificarLinea('MIEL ORGANICA AGRANEL (KG)'), 'Miel')
check('CHOCOLATE → Chocolate y Derivados', clasificarLinea('CHOCOLATE DE MESA 70%'), 'Chocolate y Derivados')
check('NIBS → Chocolate y Derivados', clasificarLinea('NIBS DE CACAO TOSTADO'), 'Chocolate y Derivados')
check('CACAO PASTA → Chocolate y Derivados', clasificarLinea('CACAO PASTA 1KG'), 'Chocolate y Derivados')
check('CANELA → Canela', clasificarLinea('CANELA EN RAJA'), 'Canela')
check('CAFÉ con acento → Café Tostado', clasificarLinea('CAFÉ TOST.-GRANO 100% ARABE BOLSA (340g)'), 'Café Tostado')
check('CAFE sin acento → Café Tostado', clasificarLinea('CAFE TOSTADO MOLIDO KRAFT'), 'Café Tostado')
check('default → Otros', clasificarLinea('PLAYERA IGUANA SANA TALLA M'), 'Otros')

console.log('— Validaciones de rechazo —')
let lanzo = false
try { parsearCfdi('<foo/>') } catch { lanzo = true }
check('XML sin Comprobante lanza error', lanzo, true)
lanzo = false
try { parsearCfdi('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" Version="3.3"><cfdi:Receptor Rfc="X"/><cfdi:Conceptos><cfdi:Concepto Descripcion="X" Cantidad="1" ValorUnitario="1" Importe="1"/></cfdi:Conceptos></cfdi:Comprobante>') } catch { lanzo = true }
check('CFDI 3.3 se rechaza', lanzo, true)

console.log(`\n${ok} OK, ${fail} FAIL`)
process.exit(fail === 0 ? 0 : 1)
