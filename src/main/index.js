import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { join } from 'path'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync, utimesSync } from 'fs'
import { tmpdir, homedir } from 'os'
import { execSync } from 'child_process'
import XLSX from 'xlsx'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { readDjWorkbook, buildDjPdf } from './dj.js'
import * as usuarios from './usuarios.js'
import { buscarContratos, fuenteLocal } from './buscador.js'
import { aplicar, cerrarOcr, listarPdfs, ocrImagen } from './renombrador.js'
import { conectar as conectarOneDrive, enlaceGuardado, fuenteOneDrive } from './onedrive.js'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// ── Usuarios ──────────────────────────────────────────────────────────────────
// Reemplaza el control remoto del Generador (license.json en GitHub + clave fija
// de recuperación). Solo usuario y contraseña (usuarios.js): qué pantallas ve
// cada persona lo decide el Administrador (pedido del usuario, 22/10/2026). La
// licencia por equipo que hubo un día se quitó (decisión del usuario,
// 23/10/2026: "quedamos sin licencia, solo con usuario").
// La pantalla oculta lo que no corresponde y, además, aquí se rechaza cualquier
// pedido de una pantalla que el usuario con sesión no tiene.
const PANTALLA_DE = {
  'load-excel': 'bulk', 'generate-docs': 'bulk', 'copy-format': 'bulk',
  'generate-single': 'single', 'compute-dates': ['bulk', 'single'],
  'dj-load-excel': 'dj', 'dj-generate': 'dj',
  'save-settings': 'settings', 'open-manual': ['bulk', 'single', 'dj', 'settings'],
  'buscar-ejecutar': 'buscar', 'onedrive-estado': 'buscar', 'onedrive-conectar': 'buscar',
  'renombrar-listar': 'renombrar', 'leer-archivo': 'renombrar', 'ocr-imagen': 'renombrar', 'renombrar-aplicar': 'renombrar',
}
const SIN_SESION = new Set(['sesion-estado', 'sesion-entrar', 'sesion-crear-admin'])
const manejarOriginal = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (canal, fn) => manejarOriginal(canal, (e, ...args) => {
  if (!SIN_SESION.has(canal)) {
    const yo = usuarios.usuarioActual()
    if (!yo) throw new Error('Inicia sesión primero.')
    if (yo.debeCambiar && !canal.startsWith('sesion-')) throw new Error('Primero cambia tu contraseña temporal.')
    const pantallas = [].concat(PANTALLA_DE[canal] || [])
    if (pantallas.length && !pantallas.some((p) => usuarios.puedeVer(p))) {
      throw new Error('Tu usuario no tiene permiso para esta función.')
    }
  }
  return fn(e, ...args)
})

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { SUELDO: '', mesesDias12: 5, mesesDias3mas: 6 }

function settingsPath() {
  return join(app.getPath('userData'), 'limtek-settings.json')
}

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(settingsPath(), 'utf8')) }
  } catch { return { ...DEFAULT_SETTINGS } }
}

function resourcePath(rel) {
  // app.isPackaged is false in dev, true in production installer
  // Fallback to VITE_DEV_SERVER_URL check for safety
  const isDev = !app.isPackaged || !!VITE_DEV_SERVER_URL
  return isDev
    ? join(__dirname, '..', '..', 'resources', rel)
    : join(process.resourcesPath, 'resources', rel)
}

const DOWNLOADS = join(homedir(), 'Downloads')

// ── Date helpers ─────────────────────────────────────────────────────────────
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio',
                'julio','agosto','septiembre','octubre','noviembre','diciembre']

function calcEndDate(dt, settings) {
  const s = settings || DEFAULT_SETTINGS
  const add = dt.getDate() <= 2 ? s.mesesDias12 : s.mesesDias3mas
  const totalMonths = dt.getMonth() + add
  const year = dt.getFullYear() + Math.floor(totalMonths / 12)
  const mo = totalMonths % 12
  const lastDay = new Date(year, mo + 1, 0).getDate()
  return new Date(year, mo, lastDay)
}

function toFechaTexto(dt) {
  return `${dt.getDate()} DE ${MONTHS[dt.getMonth()].toUpperCase()} DE ${dt.getFullYear()}`
}

function fmtDate(dt) {
  const d = String(dt.getDate()).padStart(2, '0')
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${dt.getFullYear()}`
}

function parseDate(val) {
  if (val instanceof Date) {
    // XLSX puede devolver fechas en UTC midnight — extraer componentes UTC para evitar desfase de zona horaria
    return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate())
  }
  if (typeof val === 'number') {
    // Número serial de Excel → extraer componentes UTC para evitar restar un día en UTC-5 (Perú)
    const utc = new Date(Math.round((val - 25569) * 86400 * 1000))
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
  }
  if (typeof val === 'string') {
    const parts = val.split('/')
    if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0])
    // Formato ISO YYYY-MM-DD (JS lo interpreta como UTC) → convertir a fecha local
    const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
    return new Date(val)
  }
  return new Date(val)
}

function enrichRow(row, index, settings) {
  const s = settings || DEFAULT_SETTINGS
  const dni = String(row.DNI || '').trim()
  const dniValid = /^\d{8,9}$/.test(dni)
  let fechaTexto = '', fechaFin = '', fechaInicio = String(row.FECHA_INICIO || '')
  try {
    const dt = parseDate(row.FECHA_INICIO)
    fechaInicio = fmtDate(dt)
    fechaTexto = toFechaTexto(dt)
    fechaFin = fmtDate(calcEndDate(dt, s))
  } catch { /* leave defaults */ }

  return {
    _id: index,
    _dniValid: dniValid,
    NOMBRES: String(row.NOMBRES || '').trim(),
    DNI: dni,
    DIRECCION: String(row.DIRECCION || '').trim(),
    FECHA_INICIO: fechaInicio,
    UNIDAD: String(row.UNIDAD || '').trim(),
    DIRECCION_UNIDAD: String(row.DIRECCION_UNIDAD || '').trim(),
    HORARIO: String(row.HORARIO || '').trim(),
    FECHA_TEXTO: fechaTexto,
    FECHA_FIN: fechaFin,
    SUELDO: String(row.SUELDO || s.SUELDO || ''),
  }
}

// ── Document generation ───────────────────────────────────────────────────────
function renderDocx(templatePath, context) {
  // Copy to temp to avoid file-lock when template is open in Word
  const tmp = join(tmpdir(), `limtek_tpl_${Date.now()}.docx`)
  copyFileSync(templatePath, tmp)
  const zip = new PizZip(readFileSync(tmp))
  // Templates use {{ }} delimiters (docxtpl/Jinja2 syntax)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  })
  doc.render(context)
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Merge multiple docx buffers by appending body content with page breaks
function mergeDocxBuffers(buffers) {
  if (buffers.length === 1) return buffers[0]

  const baseZip = new PizZip(buffers[0])
  let baseXml = baseZip.file('word/document.xml').asText()

  for (let i = 1; i < buffers.length; i++) {
    const zip = new PizZip(buffers[i])
    const xml = zip.file('word/document.xml').asText()
    // Extract content inside <w:body>...</w:body>
    const match = xml.match(/<w:body>([\s\S]*)<\/w:body>/)
    if (!match) continue
    // Strip the last sectPr from the appended content
    let bodyContent = match[1].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, '')
    // Insert page break before appended content
    const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
    // Insert before closing </w:body> of base
    baseXml = baseXml.replace('</w:body>', `${pageBreak}${bodyContent}</w:body>`)
  }

  baseZip.file('word/document.xml', baseXml)
  return baseZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('load-excel', async (_e, filePath) => {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  const settings = readSettings()
  return raw.map((row, i) => enrichRow(row, i, settings))
})

ipcMain.handle('generate-docs', async (_e, { rows, outputDir, tipos, pdf, wordOnly }) => {
  const dir = outputDir || DOWNLOADS
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const docxPaths = []
  const errors = []

  for (const tipo of tipos) {
    const tplFile = tipo === 'contrato' ? 'plantilla.docx' : 'COMPROMISO.docx'
    const label   = tipo === 'contrato' ? 'CONTRATOS_MASIVOS' : 'CARTAS_COMPROMISO_MASIVAS'
    const tplPath = resourcePath(tplFile)
    const outPath = join(dir, `${label}.docx`)

    const settings = readSettings()
    const buffers = []
    for (const row of rows) {
      if (!row._dniValid) continue
      try {
        buffers.push(renderDocx(tplPath, { SUELDO: settings.SUELDO, ...row }))
      } catch (e) {
        errors.push(`${row.NOMBRES}: ${e.message}`)
      }
    }
    if (buffers.length === 0) continue

    writeFileSync(outPath, mergeDocxBuffers(buffers))
    docxPaths.push(outPath)
  }

  let outPaths = [...docxPaths]
  if (pdf && docxPaths.length > 0) {
    try {
      const pdfPaths = await batchConvertToPdf(docxPaths)
      if (wordOnly === false) {
        // Solo PDF — remove intermediate docx
        for (const p of docxPaths) try { unlinkSync(p) } catch { /* ignore */ }
        outPaths = pdfPaths
      } else {
        outPaths.push(...pdfPaths)
      }
    } catch (e) {
      errors.push(`PDF: ${e.message}`)
    }
  }

  return { outPaths, errors }
})

ipcMain.handle('generate-single', async (_e, { row, outputDir, tipos, pdf, wordOnly }) => {
  const dir = outputDir || DOWNLOADS
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Phase 1: generate all docx files
  const settings = readSettings()
  const fullRow  = { SUELDO: settings.SUELDO, ...row }
  const docxPaths = []
  for (const tipo of tipos) {
    const tplFile = tipo === 'contrato' ? 'plantilla.docx' : 'COMPROMISO.docx'
    const label   = tipo === 'contrato' ? `CONTRATO_${row.DNI}` : `CARTA_COMPROMISO_${row.DNI}`
    const outPath = join(dir, `${label}.docx`)
    writeFileSync(outPath, renderDocx(resourcePath(tplFile), fullRow))
    docxPaths.push(outPath)
  }

  // Phase 2: convert to PDF in one session if needed
  if (!pdf) return { outPaths: docxPaths, errors: [] }

  const outPaths = []
  try {
    const pdfPaths = await batchConvertToPdf(docxPaths)
    outPaths.push(...pdfPaths)
  } catch {
    // PDF failed — return docx as fallback
    return { outPaths: docxPaths, errors: [] }
  }

  if (wordOnly === false) {
    // Solo PDF — remove intermediate docx files
    for (const p of docxPaths) try { unlinkSync(p) } catch { /* ignore */ }
  } else {
    // Ambos — include docx too
    outPaths.push(...docxPaths)
  }

  return { outPaths, errors: [] }
})

// Convert multiple docx files to PDF in a single Word/LibreOffice session
async function batchConvertToPdf(docxPaths) {
  const lo = findLibreOffice()
  if (lo) {
    const outDir = join(docxPaths[0], '..')
    const files  = docxPaths.map(p => `"${p}"`).join(' ')
    execSync(`"${lo}" --headless --convert-to pdf --outdir "${outDir}" ${files}`, { timeout: 120000 })
    return docxPaths.map(p => p.replace(/\.docx$/i, '.pdf'))
  }

  // Word COM — open Word once, convert all files, quit once
  const lines = ['$w = New-Object -ComObject Word.Application', '$w.Visible = $false']
  for (const docxPath of docxPaths) {
    const docxWin = docxPath.replace(/\//g, '\\')
    const pdfWin  = docxPath.replace(/\.docx$/i, '.pdf').replace(/\//g, '\\')
    lines.push(`$d = $w.Documents.Open('${docxWin}')`)
    lines.push(`$d.SaveAs('${pdfWin}', 17)`)
    lines.push('$d.Close()')
  }
  lines.push('$w.Quit()')
  execSync(`powershell -NoProfile -Command "${lines.join('; ')}"`, { timeout: 120000 })
  return docxPaths.map(p => p.replace(/\.docx$/i, '.pdf'))
}

function findLibreOffice() {
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]
  return candidates.find(p => existsSync(p)) || null
}

// ── DJ y Carta de Compromiso ─────────────────────────────────────────────────
ipcMain.handle('dj-load-excel', async (_e, { filePath, sheet }) =>
  readDjWorkbook(filePath, sheet, val => fmtDate(parseDate(val))))

ipcMain.handle('dj-generate', async (_e, { rows, outputDir }) => {
  const dir = outputDir || DOWNLOADS
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const valid   = rows.filter(r => r._errors.length === 0)
  const skipped = rows.length - valid.length
  if (valid.length === 0) return { outPath: null, count: 0, skipped }

  const bytes = await buildDjPdf(readFileSync(resourcePath('DJ_COMPROMISO.pdf')), valid)
  const now   = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const base  = join(dir, `DJ_COMPROMISO_${stamp}`)
  let outPath = `${base}.pdf`
  let n = 1
  while (existsSync(outPath)) outPath = `${base} (${n++}).pdf`
  writeFileSync(outPath, bytes)
  return { outPath, count: valid.length, skipped }
})

ipcMain.handle('compute-dates', (_e, fechaInicio) => {
  try {
    const settings = readSettings()
    const dt = parseDate(fechaInicio)
    return {
      FECHA_INICIO: fmtDate(dt),
      FECHA_TEXTO:  toFechaTexto(dt),
      FECHA_FIN:    fmtDate(calcEndDate(dt, settings)),
    }
  } catch { return { FECHA_INICIO: fechaInicio, FECHA_TEXTO: '', FECHA_FIN: '' } }
})

ipcMain.handle('get-settings', () => readSettings())

ipcMain.handle('save-settings', (_e, data) => {
  const merged = { ...DEFAULT_SETTINGS, ...data }
  writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
})

ipcMain.handle('open-folder',  (_e, p) => shell.openPath(p))
ipcMain.handle('open-manual',  ()    => shell.openPath(resourcePath('MANUAL.pdf')))
ipcMain.handle('get-downloads',()    => DOWNLOADS)

ipcMain.handle('pick-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('pick-excel', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('copy-format', async (_e, outputDir) => {
  const base = join(outputDir || DOWNLOADS, 'FORMATO_EXCEL_CONTRATOS')
  let dst = `${base}.xlsx`
  let n = 1
  while (existsSync(dst)) dst = `${base} (${n++}).xlsx`
  copyFileSync(resourcePath('FORMATO_EXCEL_CONTRATOS.xlsx'), dst)
  const now = new Date()
  utimesSync(dst, now, now)
  return dst
})

// ── Window ────────────────────────────────────────────────────────────────────
function setupAutoUpdater(win) {
  if (!app.isPackaged) return  // no verificar en modo desarrollo

  autoUpdater.autoDownload = false  // preguntar antes de descargar

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Actualización disponible',
      message: `Nueva versión ${info.version} disponible.`,
      detail: 'Se descargará en segundo plano. Te avisaremos cuando esté lista.',
      buttons: ['Actualizar', 'Después'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Actualización lista',
      message: 'La actualización se descargó correctamente.',
      detail: 'La aplicación se reiniciará para instalar la nueva versión.',
      buttons: ['Reiniciar ahora', 'Después'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'Error de actualización',
      message: String(err?.message || err),
      buttons: ['OK'],
    })
  })

  // Verificar al iniciar y cada 4 horas
  autoUpdater.checkForUpdates()
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}

function createWindow() {
  Menu.setApplicationMenu(null)
  const win = new BrowserWindow({
    width: 1200, height: 720, minWidth: 900, minHeight: 580,
    backgroundColor: '#002663',
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Usar timeout en vez de ready-to-show para mayor compatibilidad con app instalada
  // Actualizaciones desde los releases de contratos-limtek (mismo canal que la 1.5.x).
  setTimeout(() => setupAutoUpdater(win), 4000)
}

app.whenReady().then(() => {
  usuarios.configurarAdmin(resourcePath('admin.json'))   // Administrador integrado (ver usuarios.js)
  createWindow()
})

// ── Sesión y usuarios ─────────────────────────────────────────────────────────
ipcMain.handle('sesion-estado', () => usuarios.estado())
ipcMain.handle('sesion-crear-admin', (_e, datos) => usuarios.crearPrimerAdmin(datos))
ipcMain.handle('sesion-entrar', (_e, datos) => usuarios.entrar(datos))
ipcMain.handle('sesion-salir', () => usuarios.salir())
ipcMain.handle('sesion-cambiar-clave', (_e, datos) => usuarios.cambiarMiClave(datos))
ipcMain.handle('usuarios-listar', () => usuarios.listar())
ipcMain.handle('usuarios-crear', (_e, datos) => usuarios.crearUsuario(datos))
ipcMain.handle('usuarios-editar', (_e, { usuario, cambios }) => usuarios.editarUsuario(usuario, cambios))
ipcMain.handle('usuarios-restablecer-clave', (_e, { usuario, clave }) => usuarios.restablecerClave(usuario, clave))

// ── Buscar contratos (perfil Contratos) ───────────────────────────────────────
let oneDrive = null   // carpeta conectada en esta sesión de la app

ipcMain.handle('onedrive-estado', () => ({ enlace: enlaceGuardado(), conectado: oneDrive ? oneDrive.nombre : '' }))
ipcMain.handle('onedrive-conectar', async (e, enlace) => {
  oneDrive = await conectarOneDrive(enlace, BrowserWindow.fromWebContents(e.sender))
  return { conectado: oneDrive.nombre }
})

ipcMain.handle('buscar-ejecutar', async (e, { excel, carpetas, origen }) => {
  const avisar = (texto, hecho = null, total = null, etapa = '') => {
    try { e.sender.send('buscar-progreso', { texto, hecho, total, etapa }) } catch { /* ventana cerrada */ }
  }
  let fuente
  if (origen === 'onedrive') {
    if (!oneDrive) throw new Error('Primero conecta OneDrive.')
    fuente = fuenteOneDrive(oneDrive)
  } else {
    fuente = fuenteLocal(carpetas)
  }
  return buscarContratos({ excel, fuente, descargas: DOWNLOADS, avisar })
})

// ── Renombrar contratos (perfil Contratos) ────────────────────────────────────
ipcMain.handle('renombrar-listar', (_e, carpeta) => listarPdfs(carpeta))
ipcMain.handle('leer-archivo', (_e, ruta) => readFileSync(ruta))
ipcMain.handle('ocr-imagen', (_e, bytes) => ocrImagen(bytes, resourcePath('tessdata')))
ipcMain.handle('renombrar-aplicar', (_e, { carpeta, filas }) => aplicar(carpeta, filas))

app.on('before-quit', () => { cerrarOcr() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
