// Buscador: mismas reglas que BuscaContratos, con datos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENCONTRADO, SIN_DNI, SIN_FECHA, columna, cruzar, fechaDeCelda, fechaDeNombre, indexar, normalizarDni,
} from '../src/main/buscador_nucleo.js'

const a = (nombre, tamano = 100, carpeta = 'C:/c') => ({ nombre, ruta: `${carpeta}/${nombre}`, tamano, carpeta })

test('reconoce los formatos de nombre que deja el renombrador', () => {
  const { indice, pdfs } = indexar([
    a('40000001 - 24-03-2026.pdf'),
    a('40000002-24032026.pdf'),
    a('40000003 - 24-03-2026 (1).pdf'),
    a('-4000004 - 01-01-2026.pdf'),            // guion de más y DNI de 7 cifras
    a('notas.txt'),
    a('CONTRATO SIN DNI.pdf'),
  ])
  assert.equal(pdfs, 5)
  assert.equal(indice.get('40000001')[0].fecha, '2026-03-24')
  assert.equal(indice.get('40000002')[0].fecha, '2026-03-24')
  assert.equal(indice.get('40000003')[0].fecha, '2026-03-24')
  assert.equal(indice.get('04000004')[0].fecha, '2026-01-01')
})

test('una fecha imposible en el nombre no se inventa', () => {
  assert.equal(fechaDeNombre(' - 31-02-2026'), null)
  assert.equal(fechaDeNombre(' - sin fecha'), null)
})

test('cruce: encontrado, otra fecha o no está; repetidos iguales una sola vez', () => {
  const { indice } = indexar([
    a('40000001 - 24-03-2026.pdf', 500, 'C:/uno'),
    a('40000001 - 24-03-2026 (1).pdf', 500, 'C:/dos'),   // mismo tamaño: se copia una vez
    a('40000002 - 01-01-2026.pdf', 300),
    a('40000003 - 05-05-2026.pdf', 100),
    a('40000003 - 05-05-2026 (1).pdf', 999),             // distinto: se copian los dos
  ])
  const [uno, dos, tres, cuatro] = cruzar([
    { dni: '40000001', renov: '2026-03-24' },
    { dni: '40000002', renov: '2026-02-02' },
    { dni: '40000003', renov: '2026-05-05' },
    { dni: '49999999', renov: '2026-05-05' },
  ], indice)
  assert.equal(uno.estado, ENCONTRADO); assert.equal(uno.copiar.length, 1)
  assert.equal(dos.estado, SIN_FECHA); assert.deepEqual(dos.disponibles, ['01/01/2026'])
  assert.equal(tres.copiar.length, 2); assert.equal(tres.varios, true)
  assert.equal(cuatro.estado, SIN_DNI)
})

test('celdas de Excel: Date UTC, número de serie y texto', () => {
  assert.equal(fechaDeCelda(new Date(Date.UTC(2026, 2, 24))), '2026-03-24')   // no resta un día en Perú
  assert.equal(fechaDeCelda(46105), '2026-03-24')
  assert.equal(fechaDeCelda('24/03/2026'), '2026-03-24')
  assert.equal(fechaDeCelda(''), null)
  assert.equal(normalizarDni(8154910), '08154910')
  assert.equal(columna(['N°', 'D.N.I.', 'Nombre y Apellidos', 'Renov_Desde'], 'Renov_Desde', 5), 3)
  assert.equal(columna(['x', 'y'], 'DNI', 0), 0)
})
