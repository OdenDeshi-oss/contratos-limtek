// Usuarios y permisos (sin disco ni Electron, para poder probarlo).
//
// Pedido del usuario (22/10/2026): entrar con usuario y contraseña, que recuerde
// los datos, y un Administrador que ve todo y decide qué pantallas ve cada uno.
// Las contraseñas nunca se guardan: solo su huella (scrypt + sal propia).

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Pantallas que se pueden dar o quitar. "usuarios" no está: es solo del Administrador.
export const PANTALLAS = [
  { id: 'renombrar', label: 'Renombrar contratos', grupo: 'Contratos' },
  { id: 'buscar',    label: 'Buscar contratos',    grupo: 'Contratos' },
  { id: 'bulk',      label: 'Carga Masiva',        grupo: 'Selección' },
  { id: 'single',    label: 'Nuevo Contrato',      grupo: 'Selección' },
  { id: 'dj',        label: 'DJ y Compromiso',     grupo: 'Selección' },
  { id: 'settings',  label: 'Configuración',       grupo: 'Selección' },
]
const IDS = new Set(PANTALLAS.map((p) => p.id))

// Atajos para no marcar una por una al crear un usuario.
export const PLANTILLAS = {
  contratos: ['renombrar', 'buscar'],
  seleccion: ['bulk', 'single', 'dj', 'settings'],
}

export const CLAVE_MINIMA = 6

export function huella(clave, sal = randomBytes(16).toString('hex')) {
  return { sal, hash: scryptSync(String(clave), sal, 64).toString('hex') }
}

export function claveCorrecta(u, clave) {
  if (!u || !u.hash || clave == null) return false
  const a = Buffer.from(huella(clave, u.sal).hash, 'hex')
  const b = Buffer.from(u.hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function normalizarUsuario(nombre) {
  return String(nombre || '').trim().toLowerCase()
}

function error(msg) { throw new Error(msg) }

export function revisarUsuario(usuario) {
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) error('El usuario debe tener de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.')
}

export function revisarClave(clave) {
  if (String(clave || '').length < CLAVE_MINIMA) error(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`)
}

const limpiarPermisos = (lista) => [...new Set((lista || []).filter((p) => IDS.has(p)))]

export function buscar(db, usuario) {
  const u = normalizarUsuario(usuario)
  return db.usuarios.find((x) => x.usuario === u) || null
}

// ADMINISTRADOR ÚNICO (decisión del usuario, 23/10/2026: "solo yo tener el
// poder de usuario admin"). El Administrador NO vive en usuarios.json de cada PC:
// viene dentro de la app (resources/admin.json, que no se sube a GitHub; lo arma
// herramientas/crear_admin.mjs con la huella de la contraseña). Los usuarios de
// cada PC son SIEMPRE "usuario": nadie puede crear ni ascender a otro
// Administrador. Un "admin" que haya quedado de antes en usuarios.json se trata
// como usuario común.
export function esAdminIntegrado(admin, usuario) {
  return !!admin && normalizarUsuario(usuario) === normalizarUsuario(admin.usuario)
}

export function sesionAdmin(admin) {
  return { usuario: normalizarUsuario(admin.usuario), nombre: admin.nombre || admin.usuario, rol: 'admin',
    permisos: [], activo: true, debeCambiar: false, integrado: true }
}

// datos: { usuario, nombre, clave, permisos }. Quien lo crea pone una clave
// temporal: al entrar por primera vez se le pide cambiarla.
export function crear(db, datos, { debeCambiar = true, admin = null } = {}) {
  const usuario = normalizarUsuario(datos.usuario)
  revisarUsuario(usuario)
  revisarClave(datos.clave)
  if (buscar(db, usuario) || esAdminIntegrado(admin, usuario)) error(`Ya existe el usuario "${usuario}".`)
  const rol = 'usuario'
  const nuevo = {
    usuario, nombre: String(datos.nombre || '').trim() || usuario, rol,
    permisos: limpiarPermisos(datos.permisos), activo: true, debeCambiar,
    creado: new Date().toISOString(), ...huella(datos.clave),
  }
  return { ...db, usuarios: [...db.usuarios, nuevo] }
}

// cambios: { nombre?, permisos?, activo? }. El rol no se cambia: todos son "usuario".
export function editar(db, usuario, cambios) {
  const u = buscar(db, usuario) || error('No existe ese usuario.')
  const nuevo = { ...u, rol: 'usuario' }
  if (cambios.nombre != null) nuevo.nombre = String(cambios.nombre).trim() || u.usuario
  if (cambios.permisos != null) nuevo.permisos = limpiarPermisos(cambios.permisos)
  if (cambios.activo != null) nuevo.activo = !!cambios.activo
  return { ...db, usuarios: db.usuarios.map((x) => (x.usuario === u.usuario ? nuevo : x)) }
}

export function cambiarClave(db, usuario, nueva, { debeCambiar = false } = {}) {
  revisarClave(nueva)
  const u = buscar(db, usuario) || error('No existe ese usuario.')
  return { ...db, usuarios: db.usuarios.map((x) => (x.usuario === u.usuario ? { ...x, ...huella(nueva), debeCambiar } : x)) }
}

// Solo el Administrador integrado (u.integrado) ve todo; el rol "admin" guardado
// en un usuarios.json no da ningún poder.
export function puedeVer(u, pantalla) {
  if (!u || !u.activo) return false
  if (u.integrado) return true
  if (pantalla === 'usuarios') return false
  return (u.permisos || []).includes(pantalla)
}

// Lo que la pantalla puede saber de un usuario (nunca la huella).
export function publico(u) {
  if (!u) return null
  const { usuario, nombre, permisos, activo, debeCambiar, creado, ultimoIngreso } = u
  const rol = u.integrado ? 'admin' : 'usuario'
  const ve = u.integrado ? [...PANTALLAS.map((p) => p.id), 'usuarios'] : (permisos || []).filter((p) => IDS.has(p))
  return { usuario, nombre, rol, permisos: permisos || [], activo, debeCambiar, creado, ultimoIngreso, ve }
}
