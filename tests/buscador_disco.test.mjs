// Buscador de punta a punta en una carpeta temporal, con datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { buscarContratos, fuenteLocal } from '../src/main/buscador.js'

test('copia lo que coincide y reporta lo que falta', async () => {
  const base = mkdtempSync(join(tmpdir(), 'buscador-'))
  const contratos = join(base, 'contratos'); const sub = join(contratos, 'LIMA', '2026')
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(sub, '40000001 - 24-03-2026.pdf'), 'pdf uno')
  writeFileSync(join(contratos, '40000002 - 01-01-2026.pdf'), 'pdf dos')
  const descargas = join(base, 'Descargas'); mkdirSync(descargas)

  const excel = join(base, 'PEDIDO CLIENTE.xlsx')
  const hoja = XLSX.utils.aoa_to_sheet([
    ['DNI', 'x', 'y', 'Nombre y Apellidos', 'z', 'Renov_Desde'],
    [40000001, '', '', 'PRUEBA UNO', '', '24/03/2026'],
    ['40000002', '', '', 'PRUEBA DOS', '', '02/02/2026'],
    ['4999999', '', '', 'PRUEBA TRES', '', '02/02/2026'],
  ])
  const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1'); XLSX.writeFile(libro, excel)

  const r = await buscarContratos({ excel, fuente: fuenteLocal([contratos]), descargas })
  assert.equal(r.trabajadores, 3)
  assert.equal(r.encontrados, 1)
  assert.equal(r.sinFecha, 1)
  assert.equal(r.sinDni, 1)
  assert.equal(r.pdfsRevisados, 2)
  const salida = readdirSync(r.destino).sort()
  assert.deepEqual(salida, ['40000001 - 24-03-2026.pdf', 'LOG_EXTRACCION.txt', 'REPORTE_EXTRACCION.xlsx'])
  assert.match(readFileSync(join(r.destino, 'LOG_EXTRACCION.txt'), 'utf8'), /04999999\tPRUEBA TRES/)

  const rep = new ExcelJS.Workbook(); await rep.xlsx.readFile(join(r.destino, 'REPORTE_EXTRACCION.xlsx'))
  assert.equal(rep.getWorksheet('No encontrados').rowCount, 3)       // encabezado + 2

  // Una segunda búsqueda no pisa la primera.
  const r2 = await buscarContratos({ excel, fuente: fuenteLocal([contratos]), descargas })
  assert.match(r2.destino, /\(2\)$/)
})
