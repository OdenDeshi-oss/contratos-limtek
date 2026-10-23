// Usuarios + la sesión abierta.
//
// - Administrador: UNO solo, integrado en la app (resources/admin.json, que arma
//   herramientas/crear_admin.mjs y NO se sube a GitHub). Entra en todas las PCs
//   con el mismo usuario y contraseña; nadie más puede ser Administrador
//   (decisión del usuario, 23/10/2026).
// - usuarios.json (carpeta de datos de la app, por PC): los demás usuarios, con
//   la huella de su clave. Los crea el Administrador en cada PC.
// - recordar.json: "Recordar en este equipo". La clave se guarda CIFRADA con la
//   protección de Windows de la cuenta (safeStorage / DPAPI): otra cuenta de
//   Windows o una copia del archivo a otra PC no la puede leer. La clave nunca
//   vuelve a la pantalla: el formulario solo muestra que está recordada.
// - Tras 5 intentos fallidos seguidos, ese usuario espera 1 minuto.

import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import * as N from './usuarios_nucleo.js'

const archivo = (nombre) => join(app.getPath('userData'), nombre)

let rutaAdmin = null
export function configurarAdmin(ruta) { rutaAdmin = ruta }

function adminIntegrado() {
  try {
    const a = JSON.parse(readFileSync(rutaAdmin, 'utf8'))
    return a && a.usuario && a.hash && a.sal ? a : null
  } catch { return null }
}

function leer() {
  try { return JSON.parse(readFileSync(archivo('usuarios.json'), 'utf8')) } catch { return { usuarios: [] } }
}

function guardar(db) {
  const ruta = archivo('usuarios.json')
  mkdirSync(dirname(ruta), { recursive: true })
  if (existsSync(ruta)) writeFileSync(ruta + '.bak', readFileSync(ruta))   // copia por si algo sale mal
  writeFileSync(ruta, JSON.stringify(db, null, 1), 'utf8')
}

let sesion = null                 // nombre de usuario con la sesión abierta
const fallos = new Map()          // usuario -> { n, hasta }

export function usuarioActual() {
  if (!sesion) return null
  const admin = adminIntegrado()
  if (N.esAdminIntegrado(admin, sesion)) return N.sesionAdmin(admin)
  const u = N.buscar(leer(), sesion)       // siempre lo vigente (pudo cambiar un permiso)
  return u && u.activo ? u : null
}

function leerRecordado() {
  try {
    const r = JSON.parse(readFileSync(archivo('recordar.json'), 'utf8'))
    return r && r.usuario ? r : null
  } catch { return null }
}

function claveRecordada(r) {
  if (!r?.clave || !safeStorage.isEncryptionAvailable()) return null
  try { return safeStorage.decryptString(Buffer.from(r.clave, 'base64')) } catch { return null }
}

function recordar(usuario, clave) {
  const datos = { usuario }
  if (safeStorage.isEncryptionAvailable()) datos.clave = safeStorage.encryptString(clave).toString('base64')
  writeFileSync(archivo('recordar.json'), JSON.stringify(datos), 'utf8')
}

function olvidar() {
  try { unlinkSync(archivo('recordar.json')) } catch { /* no había */ }
}

export function estado() {
  const r = leerRecordado()
  return {
    hayUsuarios: true,                     // ya no existe "Crear el Administrador" en la pantalla
    hayAdmin: !!adminIntegrado(),
    usuario: N.publico(usuarioActual()),
    recordado: r ? { usuario: r.usuario, conClave: !!r.clave } : null,
  }
}

export function crearPrimerAdmin() {
  throw new Error('El Administrador viene integrado en la app; no se crea desde aquí.')
}

// usarRecordada: el formulario no tocó el campo de la clave recordada.
export function entrar({ usuario, clave, recordarme, usarRecordada }) {
  const nombre = N.normalizarUsuario(usuario)
  const f = fallos.get(nombre)
  if (f && f.hasta > Date.now()) {
    throw new Error(`Demasiados intentos. Espera ${Math.ceil((f.hasta - Date.now()) / 1000)} segundos.`)
  }
  if (usarRecordada) {
    const r = leerRecordado()
    clave = r && r.usuario === nombre ? claveRecordada(r) : null
  }
  const admin = adminIntegrado()
  const db = leer()
  const esAdmin = N.esAdminIntegrado(admin, nombre)
  const u = esAdmin ? admin : N.buscar(db, nombre)
  if (!u || !N.claveCorrecta(u, clave)) {
    const n = (f?.n || 0) + 1
    fallos.set(nombre, { n: n >= 5 ? 0 : n, hasta: n >= 5 ? Date.now() + 60_000 : 0 })
    if (usarRecordada) olvidar()           // la recordada ya no sirve (le cambiaron la clave)
    throw new Error('Usuario o contraseña incorrectos.')
  }
  if (!esAdmin && !u.activo) throw new Error('Este usuario está desactivado. Habla con el Administrador.')
  fallos.delete(nombre)
  sesion = nombre
  if (!esAdmin) {
    guardar({ ...db, usuarios: db.usuarios.map((x) => (x.usuario === u.usuario ? { ...x, ultimoIngreso: new Date().toISOString() } : x)) })
  }
  if (recordarme) recordar(nombre, clave)
  else olvidar()
  return estado()
}

export function salir() { sesion = null; return estado() }

export function cambiarMiClave({ actual, nueva }) {
  const u = usuarioActual() || (() => { throw new Error('No hay sesión.') })()
  if (u.integrado) {
    throw new Error('La contraseña del Administrador se cambia con herramientas/crear_admin.mjs y una nueva versión de la app.')
  }
  if (!N.claveCorrecta(u, actual)) throw new Error('La contraseña actual no es correcta.')
  guardar(N.cambiarClave(leer(), u.usuario, nueva))
  const r = leerRecordado()
  if (r?.usuario === u.usuario && r.clave) recordar(u.usuario, nueva)   // que la recordada siga sirviendo
  return estado()
}

// --- Administrador
function soloAdmin() {
  const u = usuarioActual()
  if (!N.puedeVer(u, 'usuarios')) throw new Error('Solo el Administrador puede hacer esto.')
  return u
}

export function listar() {
  soloAdmin()
  return { usuarios: leer().usuarios.map(N.publico), pantallas: N.PANTALLAS, plantillas: N.PLANTILLAS }
}

export function crearUsuario(datos) {
  soloAdmin()
  guardar(N.crear(leer(), datos, { admin: adminIntegrado() }))
  return listar()
}

export function editarUsuario(usuario, cambios) {
  soloAdmin()
  guardar(N.editar(leer(), usuario, cambios))
  return listar()
}

export function restablecerClave(usuario, clave) {
  soloAdmin()
  guardar(N.cambiarClave(leer(), usuario, clave, { debeCambiar: true }))
  return listar()
}

export const puedeVer = (pantalla) => N.puedeVer(usuarioActual(), pantalla)
