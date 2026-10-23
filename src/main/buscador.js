// Buscador de contratos: lee la lista Excel, busca en el origen y copia lo que
// coincide (DNI + fecha Renov_Desde) a Descargas, con reporte y log.
//
// El "origen" está separado a propósito: hoy es una carpeta local; OneDrive
// (decisión del usuario 22/10/2026: la persona de Contratos trabaja en la nube,
// desde el navegador) se enchufa con el mismo par listar()/traer() en
// onedrive.js, sin tocar esta lógica.

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { copyFile, readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import {
  ENCONTRADO, SIN_DNI, SIN_FECHA, columna, cruzar, ddmmaaaa, fechaDeCelda, indexar, normalizarDni,
} from './buscador_nucleo.js'

export function leerListaExcel(ruta) {
  const libro = XLSX.readFile(ruta, { cellDates: true })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true })
  const encabezado = filas[0] || []
  const colDni = columna(encabezado, 'DNI', 0)
  const colNombre = columna(encabezado, 'Nombre', 3)
  const colRenov = columna(encabezado, 'Renov_Desde', 5)
  const trabajadores = []
  for (const fila of filas.slice(1)) {
    const dni = normalizarDni(fila[colDni])
    if (!dni) continue
    const renov = fechaDeCelda(fila[colRenov])
    trabajadores.push({
      dni, nombre: String(fila[colNombre] ?? '').trim(), renov,
      renovTexto: renov ? ddmmaaaa(renov) : String(fila[colRenov] ?? ''), fila,
    })
  }
  if (!trabajadores.length) throw new Error("El Excel no tiene DNIs en la columna 'DNI'.")
  return { trabajadores, encabezado, colDni }
}

// Origen local: una o varias carpetas, con todas sus subcarpetas.
export function fuenteLocal(carpetas) {
  return {
    descripcion: carpetas.join(' | '),
    async listar(avisar) {
      const archivos = []
      const pendientes = [...carpetas]
      while (pendientes.length) {
        const carpeta = pendientes.pop()
        let entradas = []
        try { entradas = await readdir(carpeta, { withFileTypes: true }) } catch { continue }
        for (const e of entradas) {
          const ruta = join(carpeta, e.name)
          if (e.isDirectory()) pendientes.push(ruta)
          else if (e.name.toLowerCase().endsWith('.pdf')) {
            try {
              archivos.push({ nombre: e.name, ruta, carpeta, tamano: (await stat(ruta)).size })
            } catch { /* archivo que desapareció mientras se listaba */ }
          }
        }
        if (archivos.length && archivos.length % 500 === 0) avisar(`Revisados ${archivos.length} PDF...`)
      }
      return archivos
    },
    traer: (archivo, destino) => copyFile(archivo.ruta, destino),
  }
}

function carpetaLibre(base) {
  let destino = base
  for (let n = 2; existsSync(destino); n++) destino = `${base} (${n})`
  return destino
}

async function escribirReporte(ruta, resumen, lista) {
  const libro = new ExcelJS.Workbook()
  const rojo = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }
  const amarillo = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }

  const h = libro.addWorksheet('Resumen')
  h.addRow(['DNI', 'Nombre', 'Renov_Desde', 'Estado', 'Archivo copiado', 'Carpeta origen', 'Observación / fechas disponibles'])
  for (const r of resumen) {
    const fila = h.addRow(r.celdas)
    if (r.estado !== ENCONTRADO) fila.eachCell((c) => { c.fill = r.estado === SIN_DNI ? rojo : amarillo })
  }

  const n = libro.addWorksheet('No encontrados')
  n.addRow([...lista.encabezado, 'Motivo', 'Fechas disponibles para ese DNI'])
  for (const r of resumen.filter((x) => x.estado !== ENCONTRADO)) {
    const valores = [...r.trabajador.fila]
    valores[lista.colDni] = r.trabajador.dni
    const fila = n.addRow([...valores, r.estado, r.trabajador.disponibles.join(', ')])
    fila.eachCell((c) => { if (c.value instanceof Date) c.numFmt = 'DD/MM/YYYY' })
  }

  for (const hoja of [h, n]) {
    hoja.getRow(1).font = { bold: true }
    hoja.columns.forEach((col) => {
      let ancho = 10
      col.eachCell({ includeEmpty: false }, (c) => { ancho = Math.max(ancho, String(c.value ?? '').length + 2) })
      col.width = Math.min(60, ancho)
    })
  }
  await libro.xlsx.writeFile(ruta)
}

export async function buscarContratos({ excel, fuente, descargas, avisar = () => {} }) {
  avisar('Leyendo Excel...')
  const lista = leerListaExcel(excel)
  avisar('Buscando PDF en el origen...')
  const archivos = await fuente.listar(avisar)
  const { indice, pdfs } = indexar(archivos)
  const cruce = cruzar(lista.trabajadores, indice)

  const destino = carpetaLibre(join(descargas, 'CONTRATOS_EXTRAIDOS_' + basename(excel, extname(excel))))
  mkdirSync(destino, { recursive: true })

  const aCopiar = cruce.filter((t) => t.estado === ENCONTRADO).reduce((n, t) => n + t.copiar.length, 0)
  avisar(`Copiando ${aCopiar} contrato(s)...`, 0, aCopiar, 'Copiando contratos')
  const resumen = []
  let copiados = 0
  for (const t of cruce) {
    if (t.estado !== ENCONTRADO) {
      resumen.push({ estado: t.estado, trabajador: t,
        celdas: [t.dni, t.nombre, t.renovTexto, t.estado, '', '', t.disponibles.join(', ')] })
      continue
    }
    const usados = new Set()
    for (const archivo of t.copiar) {
      let nombre = archivo.nombre
      const raiz = nombre.slice(0, -extname(nombre).length)
      for (let i = 1; usados.has(nombre.toLowerCase()); i++) nombre = `${raiz} [${i}]${extname(archivo.nombre)}`
      usados.add(nombre.toLowerCase())
      await fuente.traer(archivo, join(destino, nombre))
      copiados++
      avisar(`Copiando ${copiados} de ${aCopiar}...`, copiados, aCopiar, 'Copiando contratos')
      resumen.push({ estado: ENCONTRADO, trabajador: t,
        celdas: [t.dni, t.nombre, t.renovTexto, ENCONTRADO, nombre, archivo.carpeta,
          t.varios ? 'VARIOS ARCHIVOS DISTINTOS, REVISAR' : ''] })
    }
  }

  avisar('Generando reporte...')
  await escribirReporte(join(destino, 'REPORTE_EXTRACCION.xlsx'), resumen, lista)

  const noEncontrados = cruce.filter((t) => t.estado !== ENCONTRADO)
  const res = {
    trabajadores: cruce.length,
    encontrados: cruce.length - noEncontrados.length,
    noEncontrados: noEncontrados.length,
    sinDni: noEncontrados.filter((t) => t.estado === SIN_DNI).length,
    sinFecha: noEncontrados.filter((t) => t.estado === SIN_FECHA).length,
    copiados, pdfsRevisados: pdfs, destino,
  }
  const ahora = new Date()
  const lineas = [
    `Fecha: ${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE').slice(0, 5)}`,
    `Excel: ${excel}`,
    `Origen: ${fuente.descripcion}`,
    `Destino: ${destino}`,
    'Criterio: DNI + fecha Renov_Desde',
    `PDFs revisados en origen: ${pdfs}`,
    `Trabajadores en Excel: ${res.trabajadores}`,
    `Encontrados: ${res.encontrados}`,
    `No encontrados: ${res.noEncontrados}`,
    `  - ${SIN_DNI}: ${res.sinDni}`,
    `  - ${SIN_FECHA}: ${res.sinFecha}`,
    `PDFs copiados: ${copiados}`,
    '',
    '=== NO ENCONTRADOS ===',
    'DNI\tNOMBRE\tRENOV_DESDE\tMOTIVO\tFECHAS DISPONIBLES',
    ...noEncontrados.map((t) => [t.dni, t.nombre, t.renovTexto, t.estado, t.disponibles.join(', ')].join('\t')),
  ]
  writeFileSync(join(destino, 'LOG_EXTRACCION.txt'), lineas.join('\r\n') + '\r\n', 'utf8')
  return res
}
