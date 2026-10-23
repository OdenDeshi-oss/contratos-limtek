// Usuarios y permisos, con datos inventados.
// Regla del usuario (23/10/2026): un solo Administrador, integrado en la app;
// los usuarios de cada PC son siempre "usuario".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as U from '../src/main/usuarios_nucleo.js'

const vacio = { usuarios: [] }
const admin = { usuario: 'jefe', nombre: 'Prueba Jefe', ...U.huella('una-clave-larga-1') }

test('la contraseña se guarda como huella, nunca en claro', () => {
  const db = U.crear(vacio, { usuario: 'Contra1', clave: 'secreta1' })
  const u = U.buscar(db, 'CONTRA1 ')
  assert.equal(u.usuario, 'contra1')
  assert.ok(!JSON.stringify(db).includes('secreta1'))
  assert.ok(U.claveCorrecta(u, 'secreta1'))
  assert.ok(!U.claveCorrecta(u, 'secreta2'))
})

test('el Administrador integrado ve todo; los demás solo sus pantallas', () => {
  const yo = U.sesionAdmin(admin)
  assert.ok(U.esAdminIntegrado(admin, ' JEFE '))
  assert.ok(U.puedeVer(yo, 'usuarios') && U.puedeVer(yo, 'bulk') && U.puedeVer(yo, 'renombrar'))
  const db = U.crear(vacio, { usuario: 'contra1', clave: 'temporal', permisos: U.PLANTILLAS.contratos })
  const c = U.buscar(db, 'contra1')
  assert.ok(U.puedeVer(c, 'renombrar') && U.puedeVer(c, 'buscar'))
  assert.ok(!U.puedeVer(c, 'bulk') && !U.puedeVer(c, 'usuarios'))
  assert.equal(c.debeCambiar, false)   // entran directo con la clave que les pasa el Administrador
  assert.ok(!('hash' in U.publico(c)))
})

test('nadie más puede ser Administrador', () => {
  let db = U.crear(vacio, { usuario: 'otro', clave: '123456', rol: 'admin' })
  assert.equal(U.buscar(db, 'otro').rol, 'usuario')
  db = U.editar(db, 'otro', { rol: 'admin' })
  assert.equal(U.buscar(db, 'otro').rol, 'usuario')
  assert.ok(!U.puedeVer(U.buscar(db, 'otro'), 'usuarios'))
  // un "admin" que quedó guardado de antes en usuarios.json no tiene poder
  const viejo = { usuario: 'antes', rol: 'admin', permisos: [], activo: true }
  assert.ok(!U.puedeVer(viejo, 'usuarios') && !U.puedeVer(viejo, 'bulk'))
  assert.equal(U.publico(viejo).rol, 'usuario')
  // ni crear un usuario con el mismo nombre que el Administrador
  assert.throws(() => U.crear(vacio, { usuario: 'jefe', clave: '123456' }, { admin }), /Ya existe/)
})

test('un usuario desactivado no ve nada', () => {
  let db = U.crear(vacio, { usuario: 'sele1', clave: 'temporal', permisos: ['bulk'] })
  db = U.editar(db, 'sele1', { activo: false })
  assert.ok(!U.puedeVer(U.buscar(db, 'sele1'), 'bulk'))
})

test('no se repite usuario, ni claves cortas, ni pantallas inventadas', () => {
  const db = U.crear(vacio, { usuario: 'uno', clave: 'clave11' })
  assert.throws(() => U.crear(db, { usuario: 'uno', clave: 'otra123' }), /Ya existe/)
  assert.throws(() => U.crear(db, { usuario: 'nuevo', clave: '123' }), /al menos/)
  assert.throws(() => U.crear(db, { usuario: 'con espacio', clave: '123456' }), /sin espacios/)
  const d2 = U.crear(db, { usuario: 'x1y', clave: '123456', permisos: ['buscar', 'borrarTodo'] })
  assert.deepEqual(U.buscar(d2, 'x1y').permisos, ['buscar'])
})

test('restablecer deja la clave como temporal', () => {
  let db = U.crear(vacio, { usuario: 'contra1', clave: 'temporal' })
  db = U.cambiarClave(db, 'contra1', 'propia99')
  assert.equal(U.buscar(db, 'contra1').debeCambiar, false)
  db = U.cambiarClave(db, 'contra1', 'nueva123', { debeCambiar: true })
  assert.equal(U.buscar(db, 'contra1').debeCambiar, true)
  assert.ok(U.claveCorrecta(U.buscar(db, 'contra1'), 'nueva123'))
})

test('la clave cambiada en su PC vale hasta que el Administrador ponga otra', () => {
  let db = U.crear(vacio, { usuario: 'kve', clave: 'deladmin1' })
  db.usuarios[0].creado = '2026-10-23T10:00:00.000Z'
  const local = { kve: { ...U.huella('mipropia1'), cambiado: '2026-10-24T09:00:00.000Z' } }
  assert.ok(U.claveCorrecta(U.buscar(U.aplicarClavesLocales(db, local), 'kve'), 'mipropia1'))
  // el Administrador le restablece otra DESPUÉS: gana la del Administrador
  db = U.cambiarClave(db, 'kve', 'nuevadmin1', { restablecido: '2026-10-25T08:00:00.000Z' })
  const u = U.buscar(U.aplicarClavesLocales(db, local), 'kve')
  assert.ok(U.claveCorrecta(u, 'nuevadmin1') && !U.claveCorrecta(u, 'mipropia1'))
})
