// DJ y Carta de Compromiso: lectura del Excel diario y llenado del PDF plantilla
import XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  normHeader, splitFullName, splitGivenNames, validateDjRow, markDuplicates, fechaParts, EMAIL_MAX,
} from '../shared/dj.js'

// ── Detección de columnas ────────────────────────────────────────────────────
// Cada matcher recibe el encabezado normalizado (sin tildes, MAYÚSCULAS)
const COLS = {
  FULL:     h => /^(APELLIDOS? Y NOMBRES?|NOMBRES? Y APELLIDOS?|NOMBRES? COMPLETOS?|APELLIDOS? NOMBRES?|TRABAJADOR|COLABORADOR|POSTULANTE)$/.test(h),
  PATERNO:  h => /^(APELLIDO PATERNO|AP PATERNO|PATERNO)$/.test(h),
  MATERNO:  h => /^(APELLIDO MATERNO|AP MATERNO|MATERNO)$/.test(h),
  NOMBRES:  h => /^(NOMBRES?|PRIMER NOMBRE)$/.test(h),
  DNI:      h => /^(DNI|D N I|N DNI|NRO DNI|NUMERO DE DNI|DOCUMENTO|N DOCUMENTO|NRO DOCUMENTO|NUMERO DE DOCUMENTO|DOC IDENTIDAD|DNI CE)$/.test(h) || h.startsWith('DNI '),
  CORREO:   h => /CORREO|E ?MAIL/.test(h),
  TELEFONO: h => /CELULAR|TELEFONO|MOVIL/.test(h),
  FECHA:    h => /^(FECHA DE INGRESO|FECHA INGRESO|F INGRESO|FEC INGRESO|FECHA DE INICIO|FECHA INICIO)$/.test(h),
}

function findHeader(matrix) {
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const hdr = (matrix[r] || []).map(normHeader)
    const idx = {}
    for (const [key, test] of Object.entries(COLS)) {
      const i = hdr.findIndex(test) // primera coincidencia (hay dos "CELULAR": el 2.º es del contacto)
      if (i >= 0) idx[key] = i
    }
    const hasName = idx.FULL !== undefined || (idx.PATERNO !== undefined && idx.NOMBRES !== undefined)
    if (hasName && idx.DNI !== undefined) return { row: r, idx }
  }
  return null
}

function sheetMatrix(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
}

function hoy() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function readDjWorkbook(filePath, sheetName, toFecha) {
  const wb = XLSX.readFile(filePath, { cellDates: false })
  const sheets = wb.SheetNames.map(name => ({ name, ok: !!findHeader(sheetMatrix(wb.Sheets[name])) }))
  const target = sheetName || sheets.find(s => s.ok)?.name
  if (!target) return { sheets, sheet: null, rows: [], missing: [] }

  const matrix = sheetMatrix(wb.Sheets[target])
  const hdr = findHeader(matrix)
  if (!hdr) return { sheets, sheet: target, rows: [], missing: ['APELLIDOS Y NOMBRES', 'DNI'] }
  const { idx } = hdr
  const missing = []
  if (idx.CORREO === undefined) missing.push('CORREO')
  if (idx.TELEFONO === undefined) missing.push('CELULAR')
  if (idx.FECHA === undefined) missing.push('FECHA DE INGRESO')

  const cell = (row, key) => (idx[key] === undefined ? '' : row[idx[key]])
  const rows = []
  for (let r = hdr.row + 1; r < matrix.length; r++) {
    const row = matrix[r] || []
    let parts
    if (idx.FULL !== undefined) {
      const { warns, ...p } = splitFullName(cell(row, 'FULL'))
      parts = { ...p, _nameWarn: warns[0] || '' }
    } else {
      parts = {
        PATERNO: cell(row, 'PATERNO'),
        MATERNO: cell(row, 'MATERNO'),
        ...splitGivenNames(cell(row, 'NOMBRES')),
        _nameWarn: '',
      }
    }
    const dni = cell(row, 'DNI')
    if (!String(dni).trim() && !parts.PATERNO && !parts.NOMBRE1) continue // fila vacía

    let fecha = ''
    const rawFecha = cell(row, 'FECHA')
    if (rawFecha !== '') { try { fecha = toFecha(rawFecha) } catch { fecha = '' } }
    if (!fechaParts(fecha)) fecha = hoy() // sin fecha de ingreso → hoy

    rows.push(validateDjRow({
      _id: rows.length,
      _fila: r + 1, // fila real en Excel
      ...parts,
      DNI: dni,
      CORREO: cell(row, 'CORREO'),
      TELEFONO: cell(row, 'TELEFONO'),
      FECHA: fecha,
    }))
  }
  return { sheets, sheet: target, rows: markDuplicates(rows), missing }
}

// ── Coordenadas de la plantilla (puntos, origen arriba-izquierda, medidas del PDF) ─
// Página 1 (DJ)
const P1 = {
  nameRow: { top: 111.1, bottom: 133.6 },
  nameCols: {
    PATERNO: [55.8, 253.9],
    MATERNO: [253.9, 359.2],
    NOMBRE1: [359.2, 449.0],
    NOMBRE2: [449.0, 567.2],
  },
  emailX: [170.2, 190.0, 209.8, 229.7, 249.5, 269.5, 289.2, 309.1, 329.0, 348.8, 368.7,
           388.5, 408.4, 428.3, 448.1, 468.0, 487.8, 507.7, 527.5, 547.3, 567.2],
  emailRows: [[134.5, 155.8], [156.7, 178.3]],
  fechaBase: 674.4,
  dia:  [82.4, 99.5],
  mes:  [110.4, 165.4],
  anio: [187.5, 200.6],
  dni:  { x: 80, base: 735.0, max: 178 },
  tel:  { x: 141, base: 749.0, max: 271 },
}
// Página 2 (dos cartas de compromiso)
const P2 = [
  { nombre: { x: 239, base: 127.9, max: 512 }, dni: { x: 93, base: 150.9, max: 162 } },
  { nombre: { x: 239, base: 481.4, max: 512 }, dni: { x: 100, base: 504.3, max: 169 } },
]

const INK = rgb(0, 0, 0.35) // azul oscuro, se distingue del formato impreso

export async function buildDjPdf(templateBytes, rows) {
  const tpl = await PDFDocument.load(templateBytes)
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.HelveticaBold)

  // Caracteres que Helvetica (WinAnsi) no puede dibujar se reemplazan
  const safe = s => [...String(s || '')].map(ch => {
    try { font.encodeText(ch); return ch } catch { return '?' }
  }).join('')

  const fit = (text, maxW, size, min = 6) => {
    while (size > min && font.widthOfTextAtSize(text, size) > maxW) size -= 0.25
    return size
  }

  for (const row of rows) {
    const [p1, p2] = await out.copyPages(tpl, [0, 1])
    out.addPage(p1); out.addPage(p2)
    const H1 = p1.getHeight(), H2 = p2.getHeight()

    // Texto alineado a la izquierda sobre una línea punteada (baseline un poco arriba de los puntos)
    const onLine = (page, H, text, { x, base, max }, size = 10, lift = 1.5) => {
      const t = safe(text)
      const s = fit(t, max - x, size)
      page.drawText(t, { x, y: H - base + lift, size: s, font, color: INK })
    }
    // Texto centrado en una caja
    const inBox = (page, H, text, x0, x1, top, bottom, size) => {
      const t = safe(text)
      const s = fit(t, x1 - x0 - 4, size)
      const w = font.widthOfTextAtSize(t, s)
      const y = H - ((top + bottom) / 2 + s * 0.35)
      page.drawText(t, { x: x0 + (x1 - x0 - w) / 2, y, size: s, font, color: INK })
    }

    // ─ Página 1: nombres
    for (const [key, [x0, x1]] of Object.entries(P1.nameCols)) {
      if (row[key]) inBox(p1, H1, row[key], x0, x1, P1.nameRow.top, P1.nameRow.bottom, 10)
    }
    // ─ Página 1: correo, una letra por casilla
    const chars = [...String(row.CORREO || '')].slice(0, EMAIL_MAX)
    chars.forEach((ch, i) => {
      const r = Math.floor(i / 20), c = i % 20
      const [top, bottom] = P1.emailRows[r]
      inBox(p1, H1, ch, P1.emailX[c], P1.emailX[c + 1], top, bottom, 11)
    })
    // ─ Página 1: fecha, DNI, teléfono (sede y área quedan vacías)
    const f = fechaParts(row.FECHA)
    if (f) {
      inBox(p1, H1, f.dia, P1.dia[0], P1.dia[1], P1.fechaBase - 9, P1.fechaBase - 1, 9)
      inBox(p1, H1, f.mes, P1.mes[0], P1.mes[1], P1.fechaBase - 9, P1.fechaBase - 1, 9)
      inBox(p1, H1, f.anio2, P1.anio[0], P1.anio[1], P1.fechaBase - 9, P1.fechaBase - 1, 9)
    }
    onLine(p1, H1, row.DNI, P1.dni, 9.5)
    if (row.TELEFONO) onLine(p1, H1, row.TELEFONO, P1.tel, 9.5)

    // ─ Página 2: las dos cartas
    for (const carta of P2) {
      onLine(p2, H2, row.NOMBRE_COMPLETO, carta.nombre, 11, 3)
      onLine(p2, H2, row.DNI, carta.dni, 11, 3)
    }
  }
  return out.save()
}
