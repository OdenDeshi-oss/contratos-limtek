// Origen OneDrive para el buscador (decisión del usuario 22/10/2026: la persona
// de Contratos abre la carpeta SOLO en el navegador; opción C del PLAN).
//
// Cómo funciona:
//   1. La app abre el enlace de la carpeta en su propia ventana (sesión
//      guardada en la partición "persist:onedrive"). La persona inicia sesión
//      una vez con la cuenta de contratos; Microsoft puede pedir la
//      aprobación del celular.
//   2. Con ESA sesión (sus cookies) la app llama a la API REST de SharePoint
//      que usa la propia página: lista carpetas y archivos, y baja solo los
//      que coinciden. Mismo método que ARCA con Workin.
// No se guarda ninguna contraseña: solo la sesión que deja Microsoft, que vence
// sola (entonces se vuelve a pedir el inicio de sesión).

import { BrowserWindow, session } from 'electron'
import { writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const PARTICION = 'persist:onedrive'

// "https://x-my.sharepoint.com/:f:/r/personal/usuario/Documents/Carpeta?d=..."
// -> { host, sitio: "https://x-my.sharepoint.com/personal/usuario", ruta: "/personal/usuario/Documents/Carpeta" }
export function parsearEnlace(enlace) {
  let u
  try { u = new URL(String(enlace || '').trim()) } catch { throw new Error('El enlace de OneDrive no es válido.') }
  if (!/sharepoint\.com$/i.test(u.hostname)) throw new Error('El enlace no es de OneDrive/SharePoint de la empresa.')
  let ruta = decodeURIComponent(u.pathname).replace(/^\/:[a-z]:\/[a-z]\//i, '/')
  const m = ruta.match(/^\/(personal|sites|teams)\/([^/]+)/i)
  if (!m) throw new Error('No reconozco la carpeta en el enlace (falta /personal/... o /sites/...).')
  ruta = ruta.replace(/\/+$/, '')
  return { host: u.origin, sitio: `${u.origin}/${m[1]}/${m[2]}`, ruta }
}

const config = () => join(app.getPath('userData'), 'onedrive.json')
export function enlaceGuardado() {
  try { return JSON.parse(readFileSync(config(), 'utf8')).enlace || '' } catch { return '' }
}
function guardarEnlace(enlace) {
  try { writeFileSync(config(), JSON.stringify({ enlace }), 'utf8') } catch { /* no es grave */ }
}

const ses = () => session.fromPartition(PARTICION)

async function api(url) {
  const r = await ses().fetch(url, { headers: { Accept: 'application/json;odata=nometadata' } })
  const tipo = r.headers.get('content-type') || ''
  if (r.status === 401 || r.status === 403 || !tipo.includes('json')) {
    const e = new Error('La sesión de OneDrive venció o no tiene permiso: vuelve a conectar.')
    e.sesion = true
    throw e
  }
  if (!r.ok) {
    // El mensaje de SharePoint dice el motivo real (p. ej. el límite de 5000).
    let detalle = ''
    try { const j = await r.json(); detalle = j?.['odata.error']?.message?.value || j?.error?.message || '' } catch { /* sin cuerpo */ }
    throw new Error(`OneDrive respondió ${r.status}${detalle ? `: ${detalle}` : '.'}`)
  }
  return r.json()
}

const enc = (ruta) => encodeURIComponent(ruta.replace(/'/g, "''"))

async function probar(datos) {
  await api(`${datos.sitio}/_api/web/GetFolderByServerRelativePath(decodedurl='${enc(datos.ruta)}')?$select=Name`)
}

// Abre la ventana de inicio de sesión (si hace falta) y devuelve la carpeta.
export async function conectar(enlace, ventanaPadre) {
  const datos = parsearEnlace(enlace)
  try {
    await probar(datos)          // la sesión guardada todavía sirve
    guardarEnlace(enlace)
    return { ...datos, nombre: datos.ruta.split('/').pop() }
  } catch (e) {
    if (!e.sesion) throw e
  }
  const ventana = new BrowserWindow({
    width: 1000, height: 760, parent: ventanaPadre, modal: false,
    title: 'Iniciar sesión en OneDrive (cuenta de contratos)',
    webPreferences: { partition: PARTICION, contextIsolation: true, nodeIntegration: false },
  })
  ventana.setMenuBarVisibility(false)
  ventana.loadURL(enlace)
  return new Promise((resolver, rechazar) => {
    let terminado = false
    const reloj = setInterval(async () => {
      if (terminado || ventana.isDestroyed()) return
      if (!new URL(ventana.webContents.getURL() || 'about:blank').hostname.endsWith('sharepoint.com')) return
      try {
        await probar(datos)
        terminado = true
        clearInterval(reloj)
        guardarEnlace(enlace)
        ventana.close()
        resolver({ ...datos, nombre: datos.ruta.split('/').pop() })
      } catch { /* todavía iniciando sesión */ }
    }, 2500)
    ventana.on('closed', () => {
      clearInterval(reloj)
      if (!terminado) rechazar(new Error('Se cerró la ventana sin terminar de iniciar sesión.'))
    })
  })
}

async function todos(url) {
  const items = []
  let siguiente = url
  while (siguiente) {
    const j = await api(siguiente)
    items.push(...(j.value || []))
    siguiente = j['odata.nextLink'] || j['@odata.nextLink'] || null
  }
  return items
}

// Mismo par listar()/traer() que fuenteLocal (buscador.js).
export function fuenteOneDrive(datos) {
  const raiz = datos.ruta
  return {
    descripcion: `OneDrive: ${raiz}`,
    // Se recorre la BIBLIOTECA por páginas de 5000 (ordenadas por ID), que es
    // lo único que SharePoint deja hacer en bibliotecas grandes. Pedir los
    // archivos carpeta por carpeta (/Folders, /Files) dio "OneDrive respondió
    // 500" con la carpeta real de contratos (22/10/2026): pasa el límite de
    // 5000 elementos. Después se quedan solo los PDF que están dentro de la
    // carpeta elegida (y sus subcarpetas).
    async listar(avisar) {
      const partes = raiz.split('/')                       // ['', 'personal', 'usuario', 'Documents', ...]
      const biblioteca = partes.slice(0, 4).join('/')
      const prefijo = raiz.toLowerCase() + '/'
      // El tamaño va dentro de File (File_x0020_Size no existe en esta
      // biblioteca: "OneDrive respondió 400", 22/10/2026).
      const campos = 'FileLeafRef,FileRef,FileDirRef,FSObjType,File/Length'
      let siguiente = `${datos.sitio}/_api/web/GetList('${enc(biblioteca)}')/items?$select=${campos}&$expand=File&$top=5000`
      const archivos = []
      let revisados = 0
      let total = null
      try { total = Number((await api(`${datos.sitio}/_api/web/GetList('${enc(biblioteca)}')?$select=ItemCount`)).ItemCount) || null } catch { /* sin total: barra sin porcentaje */ }
      while (siguiente) {
        const j = await api(siguiente)
        for (const it of j.value || []) {
          revisados++
          if (Number(it.FSObjType) !== 0 || !/\.pdf$/i.test(it.FileLeafRef || '')) continue
          if (!String(it.FileRef || '').toLowerCase().startsWith(prefijo)) continue
          archivos.push({
            nombre: it.FileLeafRef, ruta: it.FileRef,
            carpeta: String(it.FileDirRef || '').slice(raiz.length) || '/',
            tamano: Number(it.File?.Length) || 0,
          })
        }
        avisar(`OneDrive: ${revisados}${total ? ` de ${total}` : ''} elementos revisados, ${archivos.length} PDF en la carpeta...`,
          revisados, total, 'Revisando OneDrive')
        siguiente = j['odata.nextLink'] || j['@odata.nextLink'] || null
      }
      return archivos
    },
    async traer(archivo, destino) {
      const url = `${datos.sitio}/_api/web/GetFileByServerRelativePath(decodedurl='${enc(archivo.ruta)}')/$value`
      let ultimo = ''
      for (let intento = 1; intento <= 3; intento++) {   // un corte de red no debe tirar toda la búsqueda
        try {
          const r = await ses().fetch(url)
          if (r.ok) { await writeFile(destino, Buffer.from(await r.arrayBuffer())); return }
          ultimo = `OneDrive ${r.status}`
          if (r.status === 401 || r.status === 403) break
        } catch (e) { ultimo = e.message }
        await new Promise((ok) => setTimeout(ok, 1500 * intento))
      }
      throw new Error(`No se pudo bajar ${archivo.nombre} (${ultimo}).`)
    },
  }
}
