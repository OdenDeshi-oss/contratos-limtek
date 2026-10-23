// Se corre CON el ejecutable armado en modo Node (ELECTRON_RUN_AS_NODE=1):
// carga cada dependencia desde dentro de app.asar y hace un Excel de prueba,
// para saber si el instalador arranca antes de publicarlo (23/10/2026: la
// primera versión armada fallaba con "Cannot find module call-bind-apply-helpers").
const path = require('path')
const os = require('os')
const base = path.join(path.dirname(process.execPath), 'resources', 'app.asar', 'node_modules')
const mods = ['docxtemplater', 'electron-updater', 'exceljs', 'pdf-lib', 'pizzip', 'xlsx', 'tesseract.js',
  'tesseract.js-core/package.json', 'iconv-lite', 'archiver', 'unzipper', 'jszip', 'fs-extra', 'semver']
let mal = 0
for (const m of mods) {
  try { require(path.join(base, m)); console.log('ok   ', m) } catch (e) { mal++; console.log('FALLA', m, '-', e.message.split('\n')[0]) }
}
;(async () => {
  try {
    const ExcelJS = require(path.join(base, 'exceljs'))
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('x').addRow(['prueba', 1])
    const f = path.join(os.tmpdir(), 'prueba_paquete.xlsx')
    await wb.xlsx.writeFile(f)
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.readFile(f)
    console.log('ok    Excel escrito y leído:', wb2.getWorksheet('x').getCell('A1').value)
  } catch (e) { mal++; console.log('FALLA Excel -', e.message) }
  process.exit(mal ? 1 : 0)
})()
