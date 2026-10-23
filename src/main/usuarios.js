// Usuarios + la sesión abierta.
//
// - Administrador: UNO solo, integrado en la app (resources/admin.json, que arma
//   herramientas/crear_admin.mjs y NO se sube a GitHub). Entra en todas las PCs
//   con el mismo usuario y contraseña; nadie más puede ser Administrador
//   (decisión del usuario, 23/10/2026).
// - Los demás usuarios TAMBIÉN viajan dentro de la app
//   (resources/usuarios_integrados.json, fuera de GitHub, dentro del instalador):
//   el Administrador los crea/cambia en su PC (la del proyecto, desde donde se
//   arma la versión) y llegan a las demás PCs con la actualización (decisión del
//   usuario, 23/10/2026: "dejar cargadas las cuentas en la app"). En una PC
//   instalada la lista es de solo lectura.
// - claves_locales.json (por PC): si una persona cambia su propia clave, vale en
//   esa PC hasta que el Administrador le restablezca otra en una versión nueva.
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
let rutaUsuarios = null
export function configurarAdmin(ruta) { rutaAdmin = ruta }
export function configurarUsuarios(ruta) { rutaUsuarios = ruta }
// Solo se editan donde se arma la app (el proyecto en la PC del Administrador).
export const editable = () => !app.isPackaged

function adminIntegrado() {
  try {
    const a = JSON.parse(readFileSync(rutaAdmin, 'utf8'))
    return a && a.usuario && a.hash && a.sal ? a : null
  } catch { return null }
}

function leerIntegrados() {
  try { return JSON.parse(readFileSync(rutaUsuarios, 'utf8')) } catch { return { usuarios: [] } }
}

function leerClavesLocales() {
  try { return JSON.parse(readFileSync(archivo('claves_locales.json'), 'utf8')) } catch { return {} }
}

function leer() {
  return N.aplicarClavesLocales(leerIntegrados(), leerClavesLocales())
}

function guardar(db) {
  if (!editable()) {
    throw new Error('Las cuentas se cambian en la PC del Administrador y llegan con la siguiente actualización de la app.')
  }
  const ruta = rutaUsuarios
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
  N.revisarClave(nueva)
  // Se guarda en ESTA PC (claves_locales.json), no en la lista de la app.
  const locales = leerClavesLocales()
  locales[u.usuario] = { ...N.huella(nueva), cambiado: new Date().toISOString() }
  writeFileSync(archivo('claves_locales.json'), JSON.stringify(locales, null, 1), 'utf8')
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
  return { usuarios: leer().usuarios.map(N.publico), pantallas: N.PANTALLAS, plantillas: N.PLANTILLAS, editable: editable() }
}

export function crearUsuario(datos) {
  soloAdmin()
  guardar(N.crear(leerIntegrados(), datos, { admin: adminIntegrado() }))
  return listar()
}

export function editarUsuario(usuario, cambios) {
  soloAdmin()
  guardar(N.editar(leerIntegrados(), usuario, cambios))
  return listar()
}

export function restablecerClave(usuario, clave) {
  soloAdmin()
  guardar(N.cambiarClave(leerIntegrados(), usuario, clave, { restablecido: new Date().toISOString() }))
  return listar()
}

export const puedeVer = (pantalla) => N.puedeVer(usuarioActual(), pantalla)
