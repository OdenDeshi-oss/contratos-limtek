// Revisa el instalador armado (dist/win-unpacked) antes de publicar:
//  - que no lleve datos reales ni código fuente (pruebas_reales/, src/, tests/...);
//  - que tenga TODAS las dependencias de producción (electron-builder 25 dejó
//    afuera call-bind-apply-helpers y la app no arrancaba, 23/10/2026).
// Uso: node herramientas/revisar_paquete.mjs
import { execSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const lista = asar.listPackage('dist/win-unpacked/resources/app.asar').map((p) => p.replace(/^[\\/]/, '').split('\\').join('/'))

const prohibidos = ['pruebas_reales', 'src/', 'tests/', 'herramientas/', 'dist/', '.env', 'admin.json']
const malos = lista.filter((p) => !p.startsWith('node_modules/') && prohibidos.some((x) => p.startsWith(x)))
console.log('archivos que no deberían ir:', malos.length, malos.slice(0, 5))

const enPaquete = new Set()
for (const p of lista) {
  const m = p.match(/^(node_modules\/(?:(?:@[^/]+\/)?[^/]+\/node_modules\/)*(?:@[^/]+\/)?[^/]+)/)
  if (m) enPaquete.add(m[1])
}
const salida = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const necesarios = new Set()
for (const linea of salida.split(/\r?\n/)) {
  const r = linea.split('\\').join('/')
  const i = r.indexOf('/node_modules/')
  if (i >= 0) necesarios.add(r.slice(i + 1))
}
const faltan = [...necesarios].filter((n) => !enPaquete.has(n))
console.log('dependencias necesarias:', necesarios.size, '| en el paquete:', enPaquete.size, '| faltan:', faltan.length)
if (faltan.length) console.log(faltan.join('\n'))
process.exit(malos.length || faltan.length ? 1 : 0)
