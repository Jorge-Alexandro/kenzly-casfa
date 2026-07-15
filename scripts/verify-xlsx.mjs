// Genera un xlsx de prueba y lo escribe a disco para verificar validez.
//   node scripts/verify-xlsx.mjs && python <dump> <archivo>
import { writeFileSync } from 'fs'
import { buildXlsx } from '../src/lib/xlsx.mjs'

const bytes = buildXlsx([
  {
    name: 'LPA',
    rows: [
      ['N°', 'Código', 'Productor', 'Nivel 2025', 'Superficie', 'Kg estimado'],
      [1, 'MX037003', 'Belizario Aquino', 'organico', 2, 1250],
      [2, 'CR089001', 'Alejo Pérez & Co', 't3', 0.6, 950.5],
    ],
  },
  {
    name: 'BAJAS',
    rows: [
      ['Código', 'Productor', 'Tipo', 'Fecha'],
      ['MX089017', 'Neftali Maldonado', 'voluntaria', '2025-01-01'],
    ],
  },
])

const out = process.argv[2] || 'C:\\Users\\jorge\\AppData\\Local\\Temp\\claude\\c--Users-jorge-Documents-CASFA-SIC-FILES\\5f1107dd-6687-49b3-9044-904842378e48\\scratchpad\\test-lpa.xlsx'
writeFileSync(out, bytes)
console.log(`xlsx escrito (${bytes.length} bytes) → ${out}`)
