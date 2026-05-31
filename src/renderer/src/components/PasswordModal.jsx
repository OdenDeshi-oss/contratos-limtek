import React, { useState, useRef, useEffect } from 'react'

export default function PasswordModal({ onSuccess, onClose }) {
  const [pwd, setPwd]     = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy]   = useState(false)
  const inputRef          = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pwd.trim()) return
    setBusy(true)
    const ok = await window.api.checkPassword(pwd)
    setBusy(false)
    if (ok) {
      onSuccess()
    } else {
      setError(true)
      setPwd('')
      setTimeout(() => setError(false), 2000)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-light">
          <h2 className="font-semibold text-base">Acceso restringido</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-white/50 text-sm">Ingresa la contraseña para acceder a la configuración.</p>

          <input
            ref={inputRef}
            type="password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            placeholder="Contraseña"
            className={`w-full bg-navy text-white text-sm px-3 py-2 rounded border outline-none transition-colors ${
              error ? 'border-red-500 animate-pulse' : 'border-navy-light focus:border-gold'
            }`}
          />
          {error && <p className="text-red-400 text-xs -mt-2">Contraseña incorrecta</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={busy || !pwd.trim()}
              className="px-5 py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50">
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
