// Lógica del buscador de contratos, sin disco ni Electron (se prueba con node --test).
//
// Portada tal cual de BuscaContratos (extraer_contratos.py), que ya está en uso:
// los contratos se llaman "DNI - dd-mm-aaaa.pdf" (también "DNI-ddmmaaaa.pdf" y
// "DNI - dd-mm-aaaa (1).pdf") y se busca por DNI + fecha Renov_Desde del Excel.
// Ese formato de nombre es el que deja el renombrador: es lo que une a las dos
// herramientas y no se puede cambiar.

// DNI de 7 u 8 dígitos al inicio del nombre, seguido de algo que no sea dígito.
// Tolera un guion o un cero de más al inicio: "-32919081-...", "003663758-...".
export const PATRON_DNI = /^\s*-?0?(\d{7,8})(?!\d)/
// dd-mm-aaaa o ddmmaaaa
export const PATRON_FECHA = /(?<!\d)(\d{2})-?(\d{2})-?(\d{4})(?!\d)/

export const ENCONTRADO = 'ENCONTRADO'
export const SIN_FECHA = 'DNI EXISTE, PERO NO CON ESA FECHA'
export const SIN_DNI = 'DNI NO ENCONTRADO'

// Fecha "AAAA-MM-DD" (texto, para comparar sin zonas horarias) o null.
export function fechaDeNombre(resto) {
  const m = PATRON_FECHA.exec(resto)
  if (!m) return null
  const [d, mes, a] = [+m[1], +m[2], +m[3]]
  const f = new Date(a, mes - 1, d)
  if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function ddmmaaaa(iso) {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// Excel pierde los ceros iniciales: 8154910 -> 08154910
export function normalizarDni(valor) {
  const solo = String(valor ?? '').replace(/\D/g, '')
  return solo ? solo.padStart(8, '0') : ''
}

// Lo que trae una celda de Excel como fecha: Date, número de serie o "dd/mm/aaaa".
// Devuelve "AAAA-MM-DD" o null. Las Date de la librería xlsx vienen a medianoche
// UTC: se usan los componentes UTC (si no, en Perú se resta un día).
export function fechaDeCelda(valor) {
  if (valor == null || valor === '') return null
  let a, m, d
  if (valor instanceof Date) {
    a = valor.getUTCFullYear(); m = valor.getUTCMonth() + 1; d = valor.getUTCDate()
  } else if (typeof valor === 'number') {
    const utc = new Date(Math.round((valor - 25569) * 86400 * 1000))
    a = utc.getUTCFullYear(); m = utc.getUTCMonth() + 1; d = utc.getUTCDate()
  } else {
    const t = String(valor).trim()
    let x = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
    if (x) { d = +x[1]; m = +x[2]; a = +x[3] } else {
      x = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (!x) return null
      a = +x[1]; m = +x[2]; d = +x[3]
    }
  }
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Ubica una columna por su título (sin mayúsculas ni tildes); si no, la posición.
export function columna(encabezado, nombre, porDefecto) {
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  const buscado = norm(nombre)
  const i = encabezado.findIndex((t) => norm(t).startsWith(buscado))
  return i >= 0 ? i : porDefecto
}

// archivos: [{ nombre, ruta, tamano, carpeta }] -> Map(dni -> [{ fecha, archivo }])
export function indexar(archivos) {
  const indice = new Map()
  let pdfs = 0
  for (const archivo of archivos) {
    if (!archivo.nombre.toLowerCase().endsWith('.pdf')) continue
    pdfs++
    const m = PATRON_DNI.exec(archivo.nombre)
    if (!m) continue
    const dni = m[1].padStart(8, '0')
    const fecha = fechaDeNombre(archivo.nombre.slice(m[0].length, -4))
    if (!indice.has(dni)) indice.set(dni, [])
    indice.get(dni).push({ fecha, archivo })
  }
  return { indice, pdfs }
}

// Para cada trabajador: qué archivos copiar o por qué no se encontró.
// Mismo contrato repetido (en otra carpeta o con "(1)"): se copia una sola vez
// si pesa igual; si pesa distinto se copian todos para revisión.
export function cruzar(trabajadores, indice) {
  return trabajadores.map((t) => {
    const delDni = indice.get(t.dni) || []
    const coinciden = delDni.filter((x) => x.fecha && t.renov && x.fecha === t.renov)
    const disponibles = [...new Set(delDni.map((x) => x.fecha).filter(Boolean))].sort().map(ddmmaaaa)
    if (!coinciden.length) {
      return { ...t, estado: delDni.length ? SIN_FECHA : SIN_DNI, copiar: [], disponibles }
    }
    const porTamano = new Map()
    for (const x of coinciden) if (!porTamano.has(x.archivo.tamano)) porTamano.set(x.archivo.tamano, x.archivo)
    const copiar = [...porTamano.values()]
    return { ...t, estado: ENCONTRADO, copiar, disponibles, varios: copiar.length > 1 }
  })
}
