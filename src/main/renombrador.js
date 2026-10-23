// Renombrador de contratos (perfil Contratos). Reemplaza a renombrar_contratos.exe.
//
// Lo que hacía el .exe (ingeniería inversa, 22/10/2026) y se conserva:
//   - lee el contrato, saca DNI + fecha de inicio y lo renombra "DNI - dd-mm-aaaa.pdf"
//     (el formato que espera el buscador);
//   - mueve a RENOMBRADOS/ o FALLIDOS/ dentro de la misma carpeta;
//   - deja un log Excel "log_renombrado.xlsx" con hojas Renombrados / Fallidos.
// Lo que cambia:
//   - lee Provincia (fechas con punto) además de Lima;
//   - la lectura se hace en pantalla y una persona la revisa ANTES de mover nada;
//   - nunca pisa un archivo que ya existe (va a FALLIDOS con el motivo).
//
// La lectura del texto (capa de texto del PDF u OCR) la arma la pantalla; aquí
// solo se hace el OCR de una imagen y se mueven los archivos.

import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { copyFile, readdir, rename, unlink } from 'fs/promises'
import { basename, extname, join } from 'path'
import ExcelJS from 'exceljs'

export async function listarPdfs(carpeta) {
  const entradas = await readdir(carpeta, { withFileTypes: true })
  return entradas
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .map((e) => ({ nombre: e.name, ruta: join(carpeta, e.name) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
}

// --- OCR (Tesseract, sin internet: el idioma español va dentro de la app)
let trabajador = null
export async function ocrImagen(bytes, rutaIdioma) {
  if (!trabajador) {
    const { createWorker } = await import('tesseract.js')
    // Dentro de Electron, tesseract.js cree estar en un navegador y trata
    // langPath como una URL: con una ruta de Windows fallaba con "Only
    // absolute URLs are supported" (probado con el instalador armado,
    // 23/10/2026). Pero antes de "descargar" mira su caché como archivo local,
    // así que el idioma se deja ahí ya descomprimido la primera vez.
    const cache = join(app.getPath('userData'), 'tesseract-cache')
    const enCache = join(cache, 'spa.traineddata')
    if (!existsSync(enCache)) {
      mkdirSync(cache, { recursive: true })
      const { gunzipSync } = await import('zlib')
      const { readFileSync, writeFileSync } = await import('fs')
      writeFileSync(enCache, gunzipSync(readFileSync(join(rutaIdioma, 'spa.traineddata.gz'))))
    }
    trabajador = await createWorker('spa', 1, { langPath: rutaIdioma, cachePath: cache, gzip: true })
  }
  const { data } = await trabajador.recognize(Buffer.from(bytes))
  return data.text
}

export async function cerrarOcr() {
  if (trabajador) { await trabajador.terminate(); trabajador = null }
}

// --- mover y registrar
function nombreLibre(carpeta, nombre) {
  if (!existsSync(join(carpeta, nombre))) return nombre
  const raiz = nombre.slice(0, -extname(nombre).length)
  for (let n = 2; ; n++) {
    const otro = `${raiz} (${n})${extname(nombre)}`
    if (!existsSync(join(carpeta, otro))) return otro
  }
}

async function mover(origen, destino) {
  try { await rename(origen, destino) } catch {
    await copyFile(origen, destino)       // otro disco: copiar y borrar
    await unlink(origen)
  }
}

const ddmmaaaa = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// filas: [{ ruta, nuevo, dni, trabajador, inicio, fin, avisos }]
// nuevo = null -> FALLIDOS. Devuelve el resumen y la ruta del log.
export async function aplicar(carpeta, filas) {
  const okDir = join(carpeta, 'RENOMBRADOS')
  const malDir = join(carpeta, 'FALLIDOS')
  const hechos = []
  for (const f of filas) {
    const original = basename(f.ruta)
    let estado = 'RENOMBRADO'
    let observacion = (f.avisos || []).join(' ')
    let final = f.nuevo
    if (final) {
      mkdirSync(okDir, { recursive: true })
      if (existsSync(join(okDir, final))) {
        estado = 'FALLIDO'
        observacion = `Ya existe "${final}" en RENOMBRADOS: revisar si es el mismo contrato. ${observacion}`.trim()
        final = null
      }
    } else {
      estado = 'FALLIDO'
    }
    try {
      if (final) {
        await mover(f.ruta, join(okDir, final))
      } else {
        mkdirSync(malDir, { recursive: true })
        final = nombreLibre(malDir, original)
        await mover(f.ruta, join(malDir, final))
      }
    } catch (e) {
      estado = 'ERROR'
      observacion = `No se pudo mover: ${e.message}`
      final = ''
    }
    hechos.push({ original, final, estado, dni: f.dni || '', trabajador: f.trabajador || '',
      inicio: ddmmaaaa(f.inicio), fin: ddmmaaaa(f.fin), observacion })
  }

  const libro = new ExcelJS.Workbook()
  const encabezado = ['Archivo original', 'Nuevo nombre', 'Estado', 'DNI', 'Nombre trabajador extraído',
    'Fecha inicio', 'Fecha fin', 'Observación']
  for (const [hoja, filtro] of [['Renombrados', (h) => h.estado === 'RENOMBRADO'],
    ['Fallidos', (h) => h.estado !== 'RENOMBRADO']]) {
    const h = libro.addWorksheet(hoja)
    h.addRow(encabezado).font = { bold: true }
    for (const x of hechos.filter(filtro)) {
      h.addRow([x.original, x.final, x.estado, x.dni, x.trabajador, x.inicio, x.fin, x.observacion])
    }
    h.columns.forEach((c, i) => { c.width = [34, 30, 12, 11, 40, 12, 12, 60][i] })
  }
  const log = join(carpeta, nombreLibre(carpeta, 'log_renombrado.xlsx'))
  await libro.xlsx.writeFile(log)
  return {
    renombrados: hechos.filter((h) => h.estado === 'RENOMBRADO').length,
    fallidos: hechos.filter((h) => h.estado !== 'RENOMBRADO').length,
    log, carpeta,
  }
}
