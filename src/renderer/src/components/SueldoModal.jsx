import React, { useState, useRef, useEffect } from 'react'

export default function SueldoModal({ count, current, onSave, onReset, onClose }) {
  const [sueldo, setSueldo] = useState(current || '')
  const [error, setError]   = useState(false)
  const inputRef            = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!sueldo.trim()) { setError(true); return }
    onSave(sueldo.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-light">
          <h2 className="font-semibold text-base">Cambiar sueldo</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-white/50 text-sm">
            Se aplicará solo a {count === 1 ? 'el trabajador seleccionado' : `los ${count} trabajadores seleccionados`}.
            El resto mantiene el sueldo de Configuración.
          </p>

          <div>
            <label className="block text-xs text-white/60 mb-1">Sueldo mensual</label>
            <input
              ref={inputRef}
              type="text"
              value={sueldo}
              onChange={e => { setSueldo(e.target.value); setError(false) }}
              placeholder="Ej: S/ 1,200.00"
              className={`w-full bg-navy text-white text-sm px-3 py-2 rounded border outline-none transition-colors ${
                error ? 'border-red-500' : 'border-navy-light focus:border-gold'
              }`}
            />
            {error && <p className="text-red-400 text-xs mt-0.5">Ingresa un sueldo</p>}
          </div>

          <div className="flex gap-3 justify-between pt-1">
            <button type="button" onClick={onReset}
              className="px-3 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">
              Restablecer al general
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">
                Cancelar
              </button>
              <button type="submit"
                className="px-5 py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover transition-colors">
                Aplicar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
