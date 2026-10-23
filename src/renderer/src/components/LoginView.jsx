import React, { useEffect, useRef, useState } from 'react'
import { mensaje } from '../errores'

const RECORDADA = '••••••••'   // marca: la clave está guardada (cifrada) en este equipo

const campo = 'w-full bg-navy text-white text-sm px-3 py-2 rounded border border-navy-light focus:border-gold outline-none'

// Entrada con usuario y contraseña. Si todavía no hay usuarios en este equipo,
// se crea el Administrador.
export default function LoginView({ sesion, onEntrar }) {
  const primera = !sesion.hayUsuarios
  const [usuario, setUsuario] = useState(sesion.recordado?.usuario || '')
  const [clave, setClave] = useState(sesion.recordado?.conClave ? RECORDADA : '')
  const [nombre, setNombre] = useState('')
  const [clave2, setClave2] = useState('')
  const [recordarme, setRecordarme] = useState(!!sesion.recordado)
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => { ref.current?.focus() }, [])

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    if (primera && clave !== clave2) { setError('Las dos contraseñas no coinciden.'); return }
    setBusy(true)
    try {
      const r = primera
        ? await window.api.sesionCrearAdmin({ usuario, nombre, clave })
        : await window.api.sesionEntrar({
            usuario, recordarme,
            usarRecordada: clave === RECORDADA,
            clave: clave === RECORDADA ? null : clave,
          })
      onEntrar(r)
    } catch (err) {
      setError(mensaje(err))
      if (clave === RECORDADA) setClave('')
    }
    setBusy(false)
  }

  return (
    <div className="flex items-center justify-center h-full p-6">
      <form onSubmit={enviar} className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{primera ? 'Crear el Administrador' : 'Iniciar sesión'}</h2>
          {primera && (
            <p className="text-sm text-white/60 mt-1">
              Es la primera vez en este equipo. El Administrador ve todo y decide qué ve cada usuario.
            </p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-white/60">Usuario</span>
          <input ref={ref} value={usuario} onChange={(e) => setUsuario(e.target.value)} className={campo} autoComplete="username" />
        </label>

        {primera && (
          <label className="block space-y-1">
            <span className="text-xs text-white/60">Nombre completo</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-white/60">Contraseña</span>
          <div className="flex gap-2">
            <input type={ver && clave !== RECORDADA ? 'text' : 'password'} value={clave}
              onChange={(e) => setClave(e.target.value)}
              onFocus={() => { if (clave === RECORDADA) setClave('') }}
              className={campo} autoComplete={primera ? 'new-password' : 'current-password'} />
            <button type="button" onClick={() => setVer(!ver)} className="px-2 text-white/50 hover:text-white text-sm" title="Mostrar u ocultar">
              {ver ? '🙈' : '👁'}
            </button>
          </div>
        </label>

        {primera && (
          <label className="block space-y-1">
            <span className="text-xs text-white/60">Repetir contraseña</span>
            <input type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} className={campo} autoComplete="new-password" />
          </label>
        )}

        {!primera && (
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={recordarme} onChange={(e) => setRecordarme(e.target.checked)} />
            Recordar usuario y contraseña en este equipo
          </label>
        )}

        {sesion.hayAdmin === false && (
          <p className="text-yellow-300 text-xs">Esta copia de la app no trae el Administrador integrado (falta resources/admin.json).</p>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={busy || !usuario.trim() || !clave}
          className="w-full py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover disabled:opacity-50">
          {busy ? 'Verificando…' : primera ? 'Crear y entrar' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
