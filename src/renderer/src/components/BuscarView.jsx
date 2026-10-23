import React, { useEffect, useState } from 'react'

// Buscar contratos (perfil Contratos): Excel del pedido (DNI + Renov_Desde) ->
// copia a Descargas los contratos que coinciden, con REPORTE y LOG.
// Origen: carpetas del equipo. OneDrive (en la nube) se agrega como otro origen.
export default function BuscarView() {
  const [excel, setExcel] = useState('')
  const [carpetas, setCarpetas] = useState([])
  const [progreso, setProgreso] = useState({ texto: '' })
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [origen, setOrigen] = useState('onedrive')
  const [enlace, setEnlace] = useState('')
  const [conectado, setConectado] = useState('')
  const [conectando, setConectando] = useState(false)

  useEffect(() => window.api.onBuscarProgreso((p) => setProgreso(typeof p === 'string' ? { texto: p } : p)), [])
  // Con un enlace guardado se conecta sola al abrir la pantalla (si la sesión
  // de Microsoft sigue viva no se abre ninguna ventana).
  useEffect(() => {
    window.api.onedriveEstado().then((s) => {
      setEnlace(s.enlace || '')
      setConectado(s.conectado || '')
      if (s.enlace && !s.conectado) conectar(s.enlace)
    })
  }, [])

  const conectar = async (link = enlace) => {
    setConectando(true); setError('')
    try { setConectado((await window.api.onedriveConectar(link)).conectado) }
    catch (e) { setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
    setConectando(false)
  }

  const elegirExcel = async () => { const p = await window.api.pickExcel(); if (p) { setExcel(p); setRes(null) } }
  const agregarCarpeta = async () => {
    const p = await window.api.pickFolder()
    if (p && !carpetas.includes(p)) setCarpetas([...carpetas, p])
  }

  const buscar = async () => {
    setBusy(true); setError(''); setRes(null); setProgreso({ texto: 'Empezando...' })
    try { setRes(await window.api.buscarEjecutar({ excel, carpetas, origen })) }
    catch (e) { setError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) }
    setBusy(false)
  }

  const nombre = (p) => p.split(/[\\/]/).pop()

  return (
    <div className="h-full overflow-auto p-6 space-y-5 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold">Buscar contratos</h2>
        <p className="text-sm text-white/60">
          Busca por DNI y fecha de inicio (columna <b>Renov_Desde</b>) los contratos ya renombrados
          ("DNI - dd-mm-aaaa.pdf") y los copia a Descargas con un reporte.
        </p>
      </div>

      <section className="bg-navy-dark border border-navy-light rounded-lg p-4 space-y-3">
        <div className="text-sm font-medium">1. Excel del pedido</div>
        <div className="flex items-center gap-3">
          <button onClick={elegirExcel} className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold">Elegir Excel…</button>
          <span className="text-sm text-white/70 truncate">{excel ? nombre(excel) : 'Ninguno'}</span>
        </div>
        <p className="text-xs text-white/40">Columnas: DNI y Renov_Desde (si no tienen ese nombre se usan la 1.ª y la 6.ª).</p>
      </section>

      <section className="bg-navy-dark border border-navy-light rounded-lg p-4 space-y-3">
        <div className="text-sm font-medium">2. Dónde buscar</div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={origen === 'onedrive'} onChange={() => setOrigen('onedrive')} /> ☁ OneDrive (en la nube)</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={origen === 'local'} onChange={() => setOrigen('local')} /> 💻 Carpetas del equipo</label>
        </div>
        {origen === 'onedrive' && (
          <div className="space-y-2">
            <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="Pega aquí el enlace de la carpeta de OneDrive"
              className="w-full bg-navy text-white text-xs px-3 py-2 rounded border border-navy-light focus:border-gold outline-none" />
            <div className="flex items-center gap-3">
              <button onClick={() => conectar()} disabled={conectando || !enlace.trim()}
                className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold disabled:opacity-50">
                {conectando ? 'Esperando el inicio de sesión…' : conectado ? 'Volver a conectar' : '☁ Conectar a OneDrive'}
              </button>
              <span className={`text-sm ${conectado ? 'text-green-400' : 'text-white/50'}`}>
                {conectado ? `Conectado: ${conectado}` : 'Se abre una ventana: inicia sesión con la cuenta de contratos (una sola vez).'}
              </span>
            </div>
          </div>
        )}
        {origen === 'local' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={agregarCarpeta} className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold">+ Carpeta del equipo…</button>
        </div>
        )}
        {origen === 'local' && carpetas.length > 0 && (
          <ul className="space-y-1">
            {carpetas.map((c) => (
              <li key={c} className="flex items-center gap-2 text-sm">
                <span className="truncate text-white/80">{c}</span>
                <button onClick={() => setCarpetas(carpetas.filter((x) => x !== c))} className="text-white/40 hover:text-red-400">×</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-white/40">Se revisan también todas las subcarpetas.</p>
      </section>

      <div className="flex items-center gap-4">
        <button onClick={buscar} disabled={busy || !excel || (origen === 'local' ? !carpetas.length : !conectado)}
          className="px-5 py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover disabled:opacity-50">
          {busy ? 'Buscando…' : 'Buscar y copiar'}
        </button>
        {busy && <span className="text-sm text-white/60">{progreso.texto}</span>}
        {!busy && (!excel || (origen === 'local' ? !carpetas.length : !conectado)) && (
          <span className="text-sm text-yellow-300">
            Falta: {[!excel && 'elegir el Excel del pedido',
              origen === 'local' && !carpetas.length && 'agregar una carpeta',
              origen === 'onedrive' && !conectado && (conectando ? 'terminar de conectar OneDrive' : 'conectar OneDrive')]
              .filter(Boolean).join(' y ')}.
          </span>
        )}
      </div>

      {busy && (
        <div className="space-y-1 max-w-xl">
          <div className="flex justify-between text-xs text-white/60">
            <span>{progreso.etapa || 'Trabajando'}</span>
            {progreso.total ? <span>{Math.min(100, Math.round((100 * (progreso.hecho || 0)) / progreso.total))}%</span> : null}
          </div>
          <div className="h-3 bg-navy-dark border border-navy-light rounded overflow-hidden">
            {progreso.total
              ? <div className="h-full bg-gold transition-all" style={{ width: `${Math.min(100, (100 * (progreso.hecho || 0)) / progreso.total)}%` }} />
              : <div className="h-full w-1/3 bg-gold/60 animate-pulse" />}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {res && (
        <section className="bg-navy-dark border border-navy-light rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Dato n={res.trabajadores} t="en el Excel" />
            <Dato n={res.encontrados} t="encontrados" color="text-green-400" />
            <Dato n={res.sinFecha} t="DNI sin esa fecha" color="text-yellow-300" />
            <Dato n={res.sinDni} t="DNI no encontrado" color="text-red-400" />
          </div>
          <p className="text-xs text-white/50">{res.pdfsRevisados} PDF revisados · {res.copiados} copiados</p>
          <div className="flex gap-2">
            <button onClick={() => window.api.openPath(res.destino)} className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold">Abrir carpeta</button>
            <button onClick={() => window.api.openPath(res.destino + '\\REPORTE_EXTRACCION.xlsx')} className="px-3 py-1.5 rounded text-sm border border-navy-light hover:border-gold">Abrir reporte</button>
          </div>
        </section>
      )}
    </div>
  )
}

function Dato({ n, t, color = 'text-white' }) {
  return (
    <div className="bg-navy rounded p-3">
      <div className={`text-2xl font-bold ${color}`}>{n}</div>
      <div className="text-xs text-white/50">{t}</div>
    </div>
  )
}
