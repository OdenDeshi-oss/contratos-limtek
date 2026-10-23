// Pasa las hojas de prueba por Tesseract (tesseract.js, el OCR que va dentro de
// la app) y guarda el texto en el mismo formato que texto_paddle.json, para
// comparar motores con evaluar_lectura.mjs.
// Uso: node herramientas/ocr_tesseract.mjs pruebas_reales/provincia

import { readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createWorker } from 'tesseract.js'

const carpeta = process.argv[2]
const paginas = readdirSync(join(carpeta, 'paginas')).filter((f) => f.endsWith('.png')).sort()
const worker = await createWorker('spa', 1, { cachePath: join(carpeta, '.tesseract-cache') })
const salida = {}
const inicio = Date.now()
for (const png of paginas) {
  const archivo = png.replace(/_p\d+\.png$/, '.pdf')
  const { data } = await worker.recognize(join(carpeta, 'paginas', png))
  ;(salida[archivo] ||= []).push(data.text.replace(/\s+/g, ' '))
  process.stdout.write('.')
}
await worker.terminate()
writeFileSync(join(carpeta, 'texto_tesseract.json'), JSON.stringify(salida, null, 1), 'utf8')
console.log(`\n${paginas.length} hojas en ${Math.round((Date.now() - inicio) / 1000)} s`)
