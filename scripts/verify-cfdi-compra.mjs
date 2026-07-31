// Verifica parsearCfdiCompra (XML) y extraerDeTextoPdf (heurístico de PDF) del
// importador de facturas de Contabilidad — contra un CFDI sintético de un
// proveedor facturando a CASFA (RFC real CAS000906K11, igual que
// verify-ventas-cfdi.mjs).
import { parsearCfdiCompra } from '../src/lib/facturas/cfdi-compra.mjs'
import { extraerDeTextoPdf } from '../src/lib/facturas/cfdi-pdf.mjs'

let ok = 0, fail = 0
function check(nombre, cond) {
  if (cond) { ok++; console.log('  OK  ', nombre) }
  else { fail++; console.log('  FAIL', nombre) }
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0" Fecha="2026-07-20T09:15:00" Folio="887" Serie="A"
  Total="15080.50" SubTotal="13000.00" Moneda="MXN" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="PGS900101AB2" Nombre="PAPELERIA GONZALEZ SA DE CV" RegimenFiscalEmisor="601"/>
  <cfdi:Receptor Rfc="CAS000906K11" Nombre="CENTRO AGROECOLOGICO SAN FRANCISCO DE ASIS"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Descripcion="Papeleria de oficina" Cantidad="1" ValorUnitario="13000" Importe="13000"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB" FechaTimbrado="2026-07-20T09:16:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`

console.log('— parsearCfdiCompra (XML de un proveedor) —')
const f = parsearCfdiCompra(xml)
check('fecha', f.fecha === '2026-07-20')
check('total', f.total === 15080.5)
check('moneda', f.moneda === 'MXN')
check('folio (serie+folio)', f.folio === 'A887')
check('uuidFiscal', f.uuidFiscal === 'AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB')
check('emisor.rfc (el proveedor, no CASFA)', f.emisor.rfc === 'PGS900101AB2')
check('emisor.nombre', f.emisor.nombre === 'PAPELERIA GONZALEZ SA DE CV')

console.log()
console.log('— rechazo de Complemento de Pago (tipo P) —')
const xmlPago = xml.replace('TipoDeComprobante="I"', 'TipoDeComprobante="P"').replace('Total="15080.50"', 'Total="0"')
let lanzoP = false
try { parsearCfdiCompra(xmlPago) } catch (e) { lanzoP = /Complemento de Pago/.test(e.message) }
check('XML tipo P lanza error claro', lanzoP)

console.log()
console.log('— rechazo de XML sin Comprobante / CFDI 3.3 —')
let lanzo1 = false
try { parsearCfdiCompra('<algo/>') } catch { lanzo1 = true }
check('XML sin Comprobante lanza error', lanzo1)
let lanzo2 = false
try {
  parsearCfdiCompra('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" Version="3.3"><cfdi:Emisor Rfc="X"/></cfdi:Comprobante>')
} catch { lanzo2 = true }
check('CFDI 3.3 se rechaza', lanzo2)

console.log()
console.log('— extraerDeTextoPdf (texto típico de un PDF de factura) —')
const textoPdf = `
FACTURA
Folio: A887
Fecha de emisión: 20/07/2026
RFC Emisor: PGS900101AB2
Nombre: PAPELERIA GONZALEZ SA DE CV
Folio Fiscal: aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb
Subtotal: $13,000.00
IVA: $2,080.50
Total: $15,080.50
`
const p = extraerDeTextoPdf(textoPdf)
check('uuidFiscal (case-insensitive)', p.uuidFiscal?.toLowerCase() === 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb')
check('monto', p.monto === 15080.5)
check('fecha dd/mm/aaaa -> ISO', p.fecha === '2026-07-20')
check('folio (no confunde con Folio Fiscal)', p.folio === 'A887')
check('emisorRfc', p.emisorRfc === 'PGS900101AB2')
check('camposDetectados', p.camposDetectados === 4)

console.log()
console.log('— extraerDeTextoPdf con texto vacío/basura —')
const vacio = extraerDeTextoPdf('esto no es una factura, solo texto suelto')
check('sin campos detectados', vacio.camposDetectados === 0)

console.log()
console.log(`${ok} OK, ${fail} FAIL`)
if (fail > 0) process.exit(1)
