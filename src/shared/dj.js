// Reglas de limpieza y validación para la DJ y Carta de Compromiso.
// Módulo puro (sin Node/DOM): lo usan el proceso main y el renderer.

export const EMAIL_MAX = 40 // casillas del correo en la DJ (2 filas x 20)

const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

// ── Texto ────────────────────────────────────────────────────────────────────
export function stripAccents(s) {
  // Quita tildes pero conserva la Ñ
  return String(s).replace(/Ñ/g, '\u0000').replace(/ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'Ñ').replace(/\u0001/g, 'ñ')
}

// Colapsa tabs, saltos de línea, espacios duros y dobles; quita bordes
export function cleanSpaces(s) {
  return String(s ?? '').replace(/[\s ​]+/g, ' ').trim()
}

// Normaliza un encabezado de Excel para compararlo: sin tildes, mayúsculas, solo letras/números
export function normHeader(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

// ── Nombres ──────────────────────────────────────────────────────────────────
const PARTICLES = new Set(['DE','DEL','LA','LAS','LOS','Y','SAN','SANTA','DA','DI','VON','VAN','MC','VDA'])

export function cleanName(s) {
  return cleanSpaces(s).toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ'\- ]/g, '').replace(/ +/g, ' ').trim()
}

// Agrupa partículas con la palabra siguiente: "DE LA CRUZ" queda como un solo grupo
function groupTokens(full) {
  const groups = []
  let pending = []
  for (const tok of full.split(' ').filter(Boolean)) {
    if (PARTICLES.has(tok)) { pending.push(tok); continue }
    groups.push([...pending, tok].join(' '))
    pending = []
  }
  if (pending.length) {
    if (groups.length) groups[groups.length - 1] += ' ' + pending.join(' ')
    else groups.push(pending.join(' '))
  }
  return groups
}

// "APELLIDOS Y NOMBRES" → { PATERNO, MATERNO, NOMBRE1, NOMBRE2, warns }
export function splitFullName(raw) {
  const full = cleanName(raw)
  const g = groupTokens(full)
  const warns = []
  const out = { PATERNO: '', MATERNO: '', NOMBRE1: '', NOMBRE2: '' }
  if (g.length === 0) return { ...out, warns }

  out.PATERNO = g[0] || ''
  out.MATERNO = g[1] || ''
  let i = 2
  // Apellido de casada: "SACHUN DE VALENTIN", "YBAÑEZ DE YAMUNAQUE"
  if (g[i] && /^(DE|VDA DE) /.test(g[i]) && g.length - i >= 2) {
    out.MATERNO += ' ' + g[i]
    i++
  }
  out.NOMBRE1 = g[i] || ''
  out.NOMBRE2 = g.slice(i + 1).join(' ')

  const tokens = full.split(' ')
  if (tokens.some(t => PARTICLES.has(t)) || g.length > 4) {
    warns.push('Revisar separación de apellidos/nombres')
  }
  return { ...out, warns }
}

// Separa "NOMBRES" en primer y segundo nombre (cuando el Excel trae columnas separadas)
export function splitGivenNames(raw) {
  const g = groupTokens(cleanName(raw))
  return { NOMBRE1: g[0] || '', NOMBRE2: g.slice(1).join(' ') }
}

export function fullNameOf(r) {
  return [r.PATERNO, r.MATERNO, r.NOMBRE1, r.NOMBRE2].map(cleanName).filter(Boolean).join(' ')
}

// ── DNI ──────────────────────────────────────────────────────────────────────
export function cleanDni(raw) {
  let s = String(raw ?? '').replace(/[\s .\-]/g, '').toUpperCase()
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
  // Excel guarda el DNI como número y se come el 0 inicial
  if (/^\d{7}$/.test(s)) s = '0' + s
  return s
}

// ── Teléfono ─────────────────────────────────────────────────────────────────
export function cleanPhone(raw) {
  // Puede venir "910266109 / 923361370", "916619553Y 922203936WHATSAPP", "+51 938 136 644"
  const parts = String(raw ?? '').split(/[^\d\s \-().+]+/)
  for (const part of parts) {
    let num = part.replace(/\D/g, '')
    if (num.length === 11 && num.startsWith('51')) num = num.slice(2)
    if (num.length === 9) return num
    // Dos celulares separados solo por espacios: tomar el primero
    if (num.length === 18 && num[0] === '9' && num[9] === '9') return num.slice(0, 9)
  }
  return String(raw ?? '').replace(/\D/g, '')
}

// ── Correo ───────────────────────────────────────────────────────────────────
const KNOWN_DOMAINS = [
  'gmail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
  'yahoo.com', 'yahoo.es', 'live.com', 'icloud.com',
]

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

// Devuelve el dominio corregido, o null si no hay corrección clara
function fixDomain(domain) {
  if (KNOWN_DOMAINS.includes(domain)) return null
  // gmail.com.pe, gmail.pe, hotmail.com.pe… no existen
  if (domain.endsWith('.pe')) {
    const base = domain.replace(/(\.com)?\.pe$/, '')
    const hit = KNOWN_DOMAINS.find(k => k.split('.')[0] === base)
    if (hit) return base + '.com'
  }
  // Errores de tipeo: gamil.com, gmail.con, gmailcom, hotmial.com, mail.com…
  let best = null, bestD = Infinity
  for (const k of KNOWN_DOMAINS) {
    const d = levenshtein(domain, k)
    if (d < bestD) { bestD = d; best = k }
  }
  return bestD <= 2 ? best : null
}

// → { value (MAYÚSCULAS), fixes[], warns[], errors[] }
export function checkEmail(raw) {
  const fixes = [], warns = [], errors = []
  const original = String(raw ?? '')
  let e = original.replace(/[\s ​]+/g, '').toLowerCase()
  if (!e) return { value: '', fixes, warns, errors: ['Sin correo'] }
  if (e.startsWith('mailto:')) e = e.slice(7)
  e = e.replace(/^[.,;]+|[.,;]+$/g, '')
  if (/[\s ​]/.test(original.trim())) fixes.push('Espacios eliminados del correo')

  const parts = e.split('@')
  if (parts.length !== 2) {
    errors.push(parts.length === 1 ? 'Correo sin @' : 'Correo con más de una @')
    return { value: e.toUpperCase(), fixes, warns, errors }
  }
  let [local, domain] = parts
  if (domain.includes(',')) {
    domain = domain.replace(/,/g, '.')
    fixes.push('Coma cambiada por punto en el dominio')
  }
  if (/[ñáéíóúü]/.test(domain)) {
    const d2 = stripAccents(domain).replace(/ñ/g, 'n')
    fixes.push(`Dominio sin tildes/ñ: ${domain} → ${d2}`)
    domain = d2
  }
  const fixed = fixDomain(domain)
  if (fixed) {
    fixes.push(`Dominio corregido: ${domain} → ${fixed}`)
    domain = fixed
  }

  if (!local) errors.push('Correo sin usuario antes de la @')
  if (/[ñ]/.test(local)) errors.push('El correo tiene Ñ (no permitido)')
  if (/[áéíóúü]/.test(local)) errors.push('El correo tiene tildes (no permitido)')
  if (/[^a-z0-9._%+\-ñáéíóúü]/.test(local)) errors.push('El correo tiene caracteres no válidos')
  if (/^\.|\.$|\.\./.test(local)) errors.push('Puntos mal ubicados en el correo')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) {
    errors.push(`Dominio no válido: ${domain || '(vacío)'}`)
  } else if (!KNOWN_DOMAINS.includes(domain)) {
    warns.push(`Dominio poco común: ${domain}`)
  }

  const value = `${local}@${domain}`.toUpperCase()
  if (value.length > EMAIL_MAX) errors.push(`Correo de ${value.length} caracteres (máx. ${EMAIL_MAX} casillas)`)
  return { value, fixes, warns, errors }
}

// ── Fecha ────────────────────────────────────────────────────────────────────
// "dd/mm/aaaa" → { dia, mes, anio2 } o null
export function fechaParts(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = +m[1], mo = +m[2], y = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { dia: String(d).padStart(2, '0'), mes: MONTHS[mo - 1], anio2: String(y).slice(-2) }
}

// ── Validación completa de una fila ──────────────────────────────────────────
// Recibe la fila con campos ya separados; devuelve la fila limpia con _errors/_warns/_fixes.
// `_nameWarn` conserva el aviso de separación de nombres hecho al cargar.
export function validateDjRow(row) {
  const errors = [], warns = [], fixes = []

  const r = {
    ...row,
    PATERNO: cleanName(row.PATERNO),
    MATERNO: cleanName(row.MATERNO),
    NOMBRE1: cleanName(row.NOMBRE1),
    NOMBRE2: cleanName(row.NOMBRE2),
  }

  const dni = cleanDni(row.DNI)
  if (/^\d{7}$/.test(String(row.DNI ?? '').trim())) fixes.push('Se agregó el 0 inicial al DNI')
  r.DNI = dni
  if (!dni) errors.push('Sin DNI')
  else if (/^\d{9}$/.test(dni)) warns.push('Documento de 9 dígitos (¿Carné de extranjería?)')
  else if (!/^\d{8}$/.test(dni)) errors.push(`DNI inválido: ${dni}`)

  if (!r.PATERNO) errors.push('Falta apellido paterno')
  if (!r.MATERNO) warns.push('Sin apellido materno')
  if (!r.NOMBRE1) errors.push('Falta primer nombre')
  if (row._nameWarn) warns.push(row._nameWarn)

  const em = checkEmail(row.CORREO)
  r.CORREO = em.value
  errors.push(...em.errors); warns.push(...em.warns); fixes.push(...em.fixes)

  r.TELEFONO = cleanPhone(row.TELEFONO)
  if (!r.TELEFONO) warns.push('Sin teléfono')
  else if (!/^9\d{8}$/.test(r.TELEFONO)) warns.push(`Teléfono poco común: ${r.TELEFONO}`)

  r.FECHA = String(row.FECHA || '').trim()
  if (!fechaParts(r.FECHA)) errors.push('Fecha inválida (DD/MM/AAAA)')

  r.NOMBRE_COMPLETO = fullNameOf(r)
  r._errors = [...new Set(errors)]
  r._warns = [...new Set(warns)]
  r._fixes = [...new Set(fixes)]
  return r
}

// Marca DNIs repetidos dentro de la carga
export function markDuplicates(rows) {
  const count = {}
  for (const r of rows) if (r.DNI) count[r.DNI] = (count[r.DNI] || 0) + 1
  return rows.map(r => {
    const dup = 'DNI repetido en la hoja'
    const warns = r._warns.filter(w => w !== dup)
    if (r.DNI && count[r.DNI] > 1) warns.push(dup)
    return { ...r, _warns: warns }
  })
}
