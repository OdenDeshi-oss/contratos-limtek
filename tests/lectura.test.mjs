// Lectura de contratos con textos inventados (nunca datos reales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerContrato, nombreArchivo } from '../src/main/lectura_contrato.js'

const CABECERA = 'identificada con DNI 08845760 a quien en adelante se denominará "LA EMPRESA" ' +
  'y de la otra parte el Sr(a). PRUEBA PRUEBA UNO con DNI 40000001 con domicilio en algún lugar. '

test('lee DNI y fechas con punto (Provincia)', () => {
  const r = leerContrato(CABECERA + 'QUINTO: El presente contrato tendrá vigencia a partir del 07.09.2026 y su término final será el 30.09.2026.')
  assert.equal(r.dni, '40000001')
  assert.equal(r.inicio, '2026-09-07')
  assert.equal(r.fin, '2026-09-30')
  assert.equal(nombreArchivo(r.dni, r.inicio), '40000001 - 07-09-2026.pdf')
})

test('si el OCR se comió la fecha de inicio, NO toma la de término (caso real 012)', () => {
  const r = leerContrato(CABECERA + 'QUINTO: El presente contrato tendrá vigencia a partir del y su término final será el 30.09.2026.')
  assert.equal(r.inicio, null)
  assert.equal(r.fin, '2026-09-30')
  assert.equal(nombreArchivo(r.dni, r.inicio), null)
})

test('inicio igual a término va a revisión', () => {
  const r = leerContrato(CABECERA + 'a partir del 30/09/2026 y su término final será el 30/09/2026.')
  assert.equal(r.inicio, null)
  assert.ok(r.avisos.some((a) => a.includes('igual')))
})

test('nunca toma el DNI del firmante de la empresa', () => {
  const r = leerContrato('identificada con DNI 08845760 "LA EMPRESA" a partir del 01/10/2026')
  assert.equal(r.dni, '')
})
