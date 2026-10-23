import React, { useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { leerContrato, nombreArchivo } from '../../../main/lectura_contrato.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Renombrar contratos (perfil Contratos). Se lee todo, una persona revisa la
// tabla y recién entonces se mueven los archivos a RENOMBRADOS / FALLIDOS.
// Nunca se renombra solo lo que no se leyó con seguridad.

const MAX_HOJAS = 3            // la cláusula QUINTO está en la 1.ª o 2.ª hoja
const ESCALA_OCR = 300 / 72    // 300 ppp: medido con 30 contratos reales de Provincia

async function textoDelPdf(bytes) {
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  const hojas = []
  for (let i = 1; i <= Math.min(doc.numPages, MAX_HOJAS); i++) hojas.push(await doc.getPage(i))
  return { doc, hojas }
}

async function capaDeTexto(hojas) {
  const partes = []
  for (const h of hojas) partes.push((await h.getTextContent()).items.map((x) => x.str).join(' '))
  return partes.join(' ')
}

async function ocrDeHojas(hojas, avisar) {
  const partes = []
  for (let i = 0; i < hojas.length; i++) {
    avisar(`OCR hoja ${i + 1} de ${hojas.length}…`)
    const vista = hojas[i].getViewport({ scale: ESCALA_OCR })
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.ceil(vista.width); lienzo.height = Math.ceil(vista.height)
    const ctx = lienzo.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lienzo.width, lienzo.height)
    await hojas[i].render({ canvasContext: ctx, viewport: vista }).promise
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/png'))
    partes.push(await window.api.ocrImagen(new Uint8Array(await blob.arrayBuffer())))
  }
  return partes.join(' ').replace(/\s+/g, ' ')
}

async function leerUno(ruta, avisar) {
  const bytes = await window.api.leerArchivo(ruta)
  const { doc, hojas } = await textoDelPdf(bytes)
  try {
    const texto = await capaDeTexto(hojas)
    let r = leerContrato(texto)
    let origen = 'texto del PDF'
    if (!(r.dni && r.inicio)) {          // escaneo (o texto incompleto): OCR
      r = leerContrato(await ocrDeHojas(hojas, avisar))
      origen = 'OCR'
    }
    return { ...r, origen }
  } finally { doc.destroy() }
}

const ddmmaaaa = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

export default function RenombrarView() {
  const [carpeta, setCarpeta] = useState('')
  const [filas, setFilas] = useState([])
  const [leyendo, setLeyendo] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const cancelar = useRef(false)

  const elegir = async () => {
    const c = await window.api.pickFolder()
    if (!c) return
    setCarpeta(c); setRes(null); setError('')
    const pdfs = await window.api.renombrarListar(c)
    setFilas(pdfs.map((p) => ({ ...p, estado: 'pendiente', incluir: true })))
  }

  const actualizar = (ruta, cambios) => setFilas((fs) => fs.map((f) => (f.ruta === ruta ? { ...f, ...cambios } : f)))

  const leerTodo = async () => {
    setLeyendo(true); cancelar.current = false
    const pendientes = filas.filter((f) => f.estado === 'pendiente' || f.estado === 'error')
    for (let i = 0; i < pendientes.length; i++) {
      if (cancelar.current) break
      const f = pendientes[i]
      const avisar = (m) => setProgreso(`${i + 1} de ${pendientes.length} · ${f.nombre} · ${m}`)
      avisar('leyendo…')
      actualizar(f.ruta, { estado: 'leyendo' })
      try {
        const r = await leerUno(f.ruta, avisar)
        actualizar(f.ruta, { estado: 'leido', dni: r.dni, trabajador: r.nombre, inicio: r.inicio || '',
          fin: r.fin || '', avisos: r.avisos, confianza: r.confianza, origen: r.origen, editado: false })
      } catch (e) {
        actualizar(f.ruta, { estado: 'error', avisos: [`No se pudo leer: ${e.message}`] })
      }
    }
    setProgreso(''); setLeyendo(false)
  }

  // Estado final de cada fila (incluye nombres repetidos dentro de la carpeta).
  const vista = useMemo(() => {
    const nuevos = filas.map((f) => (f.estado === 'leido' ? nombreArchivo(f.dni, f.inicio) : null))
    const cuenta = {}
    nuevos.forEach((n) => { if (n) cuenta[n] = (cuenta[n] || 0) + 1 })
    return filas.map((f, i) => {
      const nuevo = nuevos[i]
      const repetido = nuevo && cuenta[nuevo] > 1
      const seguro = f.editado || (f.confianza?.dni === 'alta' && !(f.avisos || []).length)
      let veredicto = f.estado
      if (f.estado === 'leido') veredicto = !nuevo ? 'fallido' : repetido ? 'repetido' : seguro ? 'listo' : 'revisar'
      return { ...f, nuevo, veredicto }
    })
  }, [filas])

  const n = (v) => vista.filter((f) => f.veredicto === v).length
  const leidos = vista.filter((f) => f.estado === 'leido')
  const aMover = vista.filter((f) => f.incluir && f.estado === 'leido' && f.veredicto !== 'repetido' && f.veredicto !== 'revisar')

  const aplicar = async () => {
    const ok = aMover.filter((f) => f.veredicto === 'listo').length
    const mal = aMover.length - ok
    if (!window.confirm(`Se van a mover ${ok} contrato(s) a RENOMBRADOS y ${mal} a FALLIDOS.\n` +
      `Los que dicen "Revisar" o "Repetido" no se tocan hasta que los corrijas.\n\n¿Continuar?`)) return
    try {
      const r = await window.api.renombrarAplicar({
        carpeta,
        filas: aMover.map((f) => ({
          ruta: f.ruta, nuevo: f.veredicto === 'listo' ? f.nuevo : null, dni: f.dni, trabajador: f.trabajador,
          inicio: f.inicio, fin: f.fin,
          avisos: [...(f.avisos || []), ...(f.editado ? ['Corregido a mano antes de renombrar.'] : []), `Leído por ${f.origen}.`],
        })),
      })
      setRes(r)
      const movidos = new Set(aMover.map((f) => f.ruta))
      setFilas((fs) => fs.filter((f) => !movidos.has(f.ruta)))
    } catch (e) { setError(String(e.message || e)) }
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Renombrar contratos</h2>
          <p className="text-sm text-white/60">
            Lee DNI y fecha de inicio de cada contrato (Lima y Provincia) y lo renombra "DNI - dd-mm-aaaa.pdf".
            Revisa la tabla antes de aplicar: nada se mueve hasta que confirmes.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={elegir} disabled={leyendo} className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold disabled:opacity-50">Elegir carpeta…</button>
        <span className="text-sm text-white/70 truncate max-w-md">{carpeta || 'Ninguna'}</span>
        {filas.length > 0 && !leyendo && n('pendiente') + n('error') > 0 && (
          <button onClick={leerTodo} className="px-4 py-1.5 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover">
            Leer {n('pendiente') + n('error')} contrato(s)
          </button>
        )}
        {leyendo && <button onClick={() => { cancelar.current = true }} className="px-3 py-1.5 rounded text-sm border border-red-500 text-red-300">Detener</button>}
        {leidos.length > 0 && !leyendo && (
          <button onClick={aplicar} disabled={!aMover.length} className="px-4 py-1.5 rounded text-sm bg-green-600 hover:bg-green-500 font-semibold disabled:opacity-40">
            Aplicar ({aMover.length})
          </button>
        )}
      </div>

      {leyendo && <p className="text-sm text-gold">{progreso}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {res && (
        <div className="text-sm bg-navy-dark border border-navy-light rounded p-3 flex items-center gap-4">
          <span>✅ {res.renombrados} renombrado(s) · ⚠ {res.fallidos} a FALLIDOS</span>
          <button onClick={() => window.api.openPath(res.carpeta)} className="underline text-gold">Abrir carpeta</button>
          <button onClick={() => window.api.openPath(res.log)} className="underline text-gold">Abrir log</button>
        </div>
      )}

      {leidos.length > 0 && (
        <div className="text-xs text-white/60 flex gap-4">
          <span className="text-green-400">Listos: {n('listo')}</span>
          <span className="text-yellow-300">Revisar: {n('revisar')}</span>
          <span className="text-orange-300">Repetidos: {n('repetido')}</span>
          <span className="text-red-400">Sin datos (a FALLIDOS): {n('fallido')}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto border border-navy-light rounded">
        <table className="w-full text-sm">
          <thead className="bg-navy-dark sticky top-0 text-white/70 text-xs">
            <tr>
              <th className="p-2"></th>
              <th className="p-2 text-left">Archivo</th>
              <th className="p-2 text-left">DNI</th>
              <th className="p-2 text-left">Trabajador</th>
              <th className="p-2 text-left">Inicio</th>
              <th className="p-2 text-left">Término</th>
              <th className="p-2 text-left">Nuevo nombre</th>
              <th className="p-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {vista.map((f) => (
              <tr key={f.ruta} className="border-t border-navy-light/50 align-top">
                <td className="p-2"><input type="checkbox" checked={f.incluir} onChange={(e) => actualizar(f.ruta, { incluir: e.target.checked })} /></td>
                <td className="p-2">
                  <button onClick={() => window.api.openPath(f.ruta)} className="text-left hover:text-gold underline decoration-dotted" title="Abrir el PDF">{f.nombre}</button>
                </td>
                <td className="p-2">
                  {f.estado === 'leido'
                    ? <input value={f.dni || ''} maxLength={8} onChange={(e) => actualizar(f.ruta, { dni: e.target.value.replace(/\D/g, ''), editado: true })}
                        className="w-24 bg-navy border border-navy-light rounded px-1 py-0.5 focus:border-gold outline-none" />
                    : '—'}
                </td>
                <td className="p-2 text-white/80">{f.trabajador || ''}</td>
                <td className="p-2">
                  {f.estado === 'leido'
                    ? <input type="date" value={f.inicio || ''} onChange={(e) => actualizar(f.ruta, { inicio: e.target.value, editado: true })}
                        className="bg-navy border border-navy-light rounded px-1 py-0.5 focus:border-gold outline-none" />
                    : '—'}
                </td>
                <td className="p-2 text-white/70">{ddmmaaaa(f.fin)}</td>
                <td className="p-2 text-white/90">{f.nuevo || ''}</td>
                <td className="p-2">
                  <Estado f={f} />
                  {f.veredicto === 'revisar' && (
                    <button onClick={() => actualizar(f.ruta, { editado: true })}
                      className="mt-1 px-2 py-0.5 rounded text-xs border border-yellow-400 text-yellow-200 hover:bg-yellow-400/10"
                      title="Ya abriste el PDF y el DNI y la fecha están bien">Confirmar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <p className="p-6 text-center text-white/40 text-sm">Elige la carpeta con los contratos escaneados.</p>}
      </div>
    </div>
  )
}

const ETIQUETAS = {
  pendiente: ['Sin leer', 'text-white/40'],
  leyendo: ['Leyendo…', 'text-gold'],
  error: ['Error', 'text-red-400'],
  listo: ['Listo', 'text-green-400'],
  revisar: ['Revisar', 'text-yellow-300'],
  repetido: ['Repetido', 'text-orange-300'],
  fallido: ['Sin datos', 'text-red-400'],
}

function Estado({ f }) {
  const [txt, color] = ETIQUETAS[f.veredicto] || [f.veredicto, '']
  const notas = [...(f.avisos || [])]
  if (f.veredicto === 'repetido') notas.unshift('Otro archivo de esta carpeta tendría el mismo nombre.')
  return (
    <div>
      <span className={`font-medium ${color}`}>{txt}</span>
      {f.origen && <span className="text-white/30 text-xs"> · {f.origen}</span>}
      {f.editado && <span className="text-white/40 text-xs"> · corregido</span>}
      {notas.map((a, i) => <div key={i} className="text-xs text-white/50">{a}</div>)}
    </div>
  )
}
