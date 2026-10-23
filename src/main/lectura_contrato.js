// Lee DNI, nombre y fechas de un contrato a partir de su TEXTO (venga de la
// capa de texto de un PDF digital o de un OCR). No usa disco ni Electron.
//
// La redacción es la misma en Lima y en Provincia (plantilla de Selección):
//   ... identificada con DNI 08845760 a quien en adelante se denominará
//   "LA EMPRESA" y de la otra parte el Sr(a). NOMBRE con DNI 12345678 con
//   domicilio ... QUINTO: El presente contrato tendrá vigencia a partir del
//   10/08/2026 y su término final será el 31/10/2026.
// Lo que cambia es la fecha: la plantilla de Lima la escribe con barra y los
// contratos de Provincia que pasaron por ARCA la traen con PUNTO (22.10.2026).
// El renombrador viejo solo aceptaba barra, así que Provincia iba a FALLIDOS.
//
// Errores reales del OCR que se toleran (vistos en 30 contratos de Provincia,
// 22/10/2026): "DNi", "DNI71936217" sin espacio, "Con DNI", "aquien",
// apellidos pegados, O por 0 e I/l por 1 dentro de números.
//
// Nunca se adivina: lo que no se encuentra queda vacío y el archivo NO se
// renombra solo; lo revisa una persona.

export const DNI_FIRMANTE_EMPRESA = '08845760'   // representante que firma por LIMTEK

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
  'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

function sinTildes(t) {
  // Conserva la Ñ (MUÑOZ no es MUNOZ).
  return t.replace(/ñ/g, '\u0000').replace(/Ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'ñ').replace(/\u0001/g, 'Ñ')
}

// Letras que el OCR confunde con dígitos, solo dentro de un número.
const CASI_DIGITO = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', L: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', g: '9' }
export function aDigitos(t) {
  return [...String(t)].map((c) => CASI_DIGITO[c] ?? c).join('')
}

function fechaValida(d, m, a) {
  const f = new Date(a, m - 1, d)
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) return null
  if (a < 2000 || a > 2100) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Primera fecha del texto: 10/08/2026, 10.08.2026, 10-08-2026, 10 08 2026 o
// "10 de agosto de 2026". Devuelve "AAAA-MM-DD" o null.
export function primeraFecha(texto) {
  const t = sinTildes(texto)
  const num = /([0-9OoIlDQ|]{1,2})\s*[./\-\s]\s*([0-9OoIlDQ|]{1,2})\s*[./\-\s]\s*([0-9OoIlDQSBZ|]{4})/.exec(t)
  const pal = /(\d{1,2})\s+DE\s+([A-Z]+)\s+(?:DEL?\s+)?(\d{4})/i.exec(t)
  const candidatos = []
  if (num) {
    const f = fechaValida(+aDigitos(num[1]), +aDigitos(num[2]), +aDigitos(num[3]))
    if (f) candidatos.push([num.index, f])
  }
  if (pal) {
    const mes = MESES.indexOf(pal[2].toUpperCase().replace('SETIEMBRE', 'SEPTIEMBRE')) + 1
    const f = mes ? fechaValida(+pal[1], mes, +pal[3]) : null
    if (f) candidatos.push([pal.index, f])
  }
  candidatos.sort((x, y) => x[0] - y[0])
  return candidatos.length ? candidatos[0][1] : null
}

// Busca la fecha que viene después de una frase ancla (tolerante a OCR).
// `hasta`: frase que corta la búsqueda. Caso real (contrato 012, Tesseract,
// 22/10/2026): el OCR se comió la fecha de inicio ("a partir del y su término
// final será el 30.09.2026") y, sin corte, la de término se leía como inicio
// y el archivo se habría renombrado MAL.
function fechaTras(texto, ancla, hasta) {
  const m = ancla.exec(texto)
  if (!m) return null
  const desde = m.index + m[0].length
  let tramo = texto.slice(desde, desde + 40)
  if (hasta) {
    const corte = hasta.exec(tramo)
    if (corte) tramo = tramo.slice(0, corte.index)
  }
  return primeraFecha(tramo)
}

// Lo que separa la fecha de inicio de la de término en la cláusula QUINTO.
const FIN_DEL_INICIO = /\by\s+su\b|\bsu\s+t|[tTIl1]\s*[eé]\s*r?\s*m\s*[iíl1]\s*n\s*o/i

const ANCLA_INICIO = /a\s*partir\s*del?/i
// "término final será el" con lo que hace el OCR: "termino", "Iermino",
// "t ermino" y "témino" (se comió la r; contrato real 025 del set de prueba).
const ANCLA_FIN = /[tTIl1]\s*[eé]\s*r?\s*m\s*[iíl1]\s*n\s*o\s+final\s+ser[aá]?\s*el/i

const DNI_EN_TEXTO = /D\s*\.?\s*N\s*\.?\s*[Iil1]\s*\.?\s*(?:N\s*[°ºo.]?\s*)?[:.]?\s*([0-9OoIlDQ|]{8})(?![0-9])/gi

function dnisDe(texto) {
  const lista = []
  for (const m of texto.matchAll(DNI_EN_TEXTO)) {
    const dni = aDigitos(m[1])
    if (/^\d{8}$/.test(dni)) lista.push({ dni, pos: m.index })
  }
  return lista
}

function limpiarNombre(t) {
  return sinTildes(t).toUpperCase()
    .replace(/[^A-ZÑ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// texto: todo el contrato (todas las hojas juntas).
// Devuelve { dni, nombre, inicio, fin, confianza: {dni, inicio, fin}, avisos }.
export function leerContrato(texto) {
  const plano = String(texto || '').replace(/\s+/g, ' ')
  const avisos = []
  const confianza = { dni: 'no', inicio: 'no', fin: 'no' }

  // --- trabajador: "Sr(a). NOMBRE con DNI 12345678"
  let dni = ''
  let nombre = ''
  const sr = /S\s*r\s*\.?\s*\(?\s*a\s*\)?\s*\.?\s*(.{3,90}?)\s*[cC][oO0]n\s*D\s*\.?\s*N\s*\.?\s*[Iil1]/.exec(plano)
  if (sr) {
    nombre = limpiarNombre(sr[1])
    const tras = dnisDe(plano.slice(sr.index)).find((x) => x.dni !== DNI_FIRMANTE_EMPRESA)
    if (tras && tras.pos < 140) { dni = tras.dni; confianza.dni = 'alta' }
  }
  if (!dni) {
    // Sin el ancla "Sr(a)": el primer DNI después de "LA EMPRESA" que no sea el del firmante.
    const desde = plano.search(/LA\s+EMPRESA/i)
    const tras = dnisDe(desde >= 0 ? plano.slice(desde) : plano).find((x) => x.dni !== DNI_FIRMANTE_EMPRESA)
    if (tras) { dni = tras.dni; confianza.dni = 'media'; avisos.push('DNI tomado sin la frase "Sr(a) ... con DNI": revisar.') }
  }
  if (!dni) avisos.push('No se encontró el DNI del trabajador.')

  // --- fechas (cláusula QUINTO)
  let inicio = fechaTras(plano, ANCLA_INICIO, FIN_DEL_INICIO)
  if (inicio) confianza.inicio = 'alta'
  let fin = fechaTras(plano, ANCLA_FIN)
  if (fin) confianza.fin = 'alta'
  if (inicio && fin && inicio === fin) {
    // Un contrato de un solo día no existe aquí: lo más probable es que se
    // haya leído la misma fecha dos veces. No se renombra solo.
    avisos.push('La fecha de inicio es igual a la de término: revisar.')
    inicio = null
    confianza.inicio = 'no'
  }
  if (!inicio) avisos.push('No se encontró la fecha de inicio ("a partir del ...").')
  if (inicio && fin && fin < inicio) {
    avisos.push('La fecha de término es anterior a la de inicio: revisar.')
    confianza.fin = 'media'
  }
  return { dni, nombre, inicio, fin, confianza, avisos }
}

// Nombre final del archivo. Formato que espera el buscador: "DNI - dd-mm-aaaa.pdf".
export function nombreArchivo(dni, inicioIso) {
  if (!/^\d{8}$/.test(dni || '') || !inicioIso) return null
  const [a, m, d] = inicioIso.split('-')
  return `${dni} - ${d}-${m}-${a}.pdf`
}
