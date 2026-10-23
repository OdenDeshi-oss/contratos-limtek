// Mide la lectura de contratos contra respuestas conocidas.
// Uso: node herramientas/evaluar_lectura.mjs pruebas_reales/provincia texto_paddle.json
// (los contratos reales viven en pruebas_reales/, que NO va al repositorio)

import { readFileSync } from 'fs'
import { join } from 'path'
import { leerContrato, nombreArchivo } from '../src/main/lectura_contrato.js'

const [carpeta, archivoTexto = 'texto_paddle.json', detalle] = process.argv.slice(2)
const textos = JSON.parse(readFileSync(join(carpeta, archivoTexto), 'utf8'))
const respuestas = JSON.parse(readFileSync(join(carpeta, 'respuestas.json'), 'utf8'))

const cuenta = { dni: 0, inicio: 0, fin: 0, nombreArchivo: 0, mal: 0, vacio: 0 }
for (const r of respuestas) {
  const leido = leerContrato((textos[r.archivo] || []).join(' '))
  const ok = {
    dni: leido.dni === r.dni,
    inicio: leido.inicio === r.inicio,
    fin: leido.fin === r.fin,
  }
  for (const k of Object.keys(ok)) if (ok[k]) cuenta[k]++
  const nombre = nombreArchivo(leido.dni, leido.inicio)
  const correcto = nombreArchivo(r.dni, r.inicio)
  if (nombre === correcto) cuenta.nombreArchivo++
  else if (nombre) cuenta.mal++         // ¡renombraría MAL! lo más grave
  else cuenta.vacio++                   // no se atrevió: va a revisión
  if (detalle && !(ok.dni && ok.inicio && ok.fin)) {
    console.log(r.archivo, '| esperado', r.dni, r.inicio, r.fin, '| leído', leido.dni || '-', leido.inicio || '-', leido.fin || '-', leido.avisos.join(' '))
  }
}
const n = respuestas.length
console.log(`contratos: ${n}`)
console.log(`DNI correcto:          ${cuenta.dni}/${n}`)
console.log(`inicio correcto:       ${cuenta.inicio}/${n}`)
console.log(`fin correcto:          ${cuenta.fin}/${n}`)
console.log(`nombre de archivo OK:  ${cuenta.nombreArchivo}/${n}`)
console.log(`  nombre EQUIVOCADO:   ${cuenta.mal}   <- tiene que ser 0`)
console.log(`  sin nombre (revisar): ${cuenta.vacio}`)
