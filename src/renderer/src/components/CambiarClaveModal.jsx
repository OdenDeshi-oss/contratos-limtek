import React, { useState } from 'react'
import { mensaje } from '../errores'

const campo = 'w-full bg-navy text-white text-sm px-3 py-2 rounded border border-navy-light focus:border-gold outline-none'

// obligatorio: el Administrador le dio una clave temporal y hay que cambiarla.
export default function CambiarClaveModal({ obligatorio, onListo, onClose }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [nueva2, setNueva2] = useState('')
  const [error, setError] = useState('')

  const enviar = async (e) => {
    e.preventDefault()
    if (nueva !== nueva2) { setError('Las dos contraseñas nuevas no coinciden.'); return }
    if (nueva === actual) { setError('La nueva contraseña tiene que ser distinta.'); return }
    try { onListo(await window.api.sesionCambiarClave({ actual, nueva })) } catch (err) { setError(mensaje(err)) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <form onSubmit={enviar} className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-sm p-6 space-y-3">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        {obligatorio && <p className="text-sm text-yellow-300">Tu contraseña es temporal: cámbiala para continuar.</p>}
        <input type="password" placeholder={obligatorio ? 'Contraseña temporal' : 'Contraseña actual'} value={actual} onChange={(e) => setActual(e.target.value)} className={campo} autoFocus />
        <input type="password" placeholder="Nueva contraseña (mínimo 6)" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} />
        <input type="password" placeholder="Repetir nueva contraseña" value={nueva2} onChange={(e) => setNueva2(e.target.value)} className={campo} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          {!obligatorio && <button type="button" onClick={onClose} className="px-4 py-2 rounded text-sm border border-navy-light text-white/70">Cancelar</button>}
          <button type="submit" disabled={!actual || !nueva} className="px-4 py-2 rounded text-sm bg-gold text-navy font-semibold disabled:opacity-50">Guardar</button>
        </div>
      </form>
    </div>
  )
}
