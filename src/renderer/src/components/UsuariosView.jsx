import React, { useEffect, useState } from 'react'
import { mensaje } from '../errores'

const campo = 'bg-navy text-white text-sm px-2 py-1.5 rounded border border-navy-light focus:border-gold outline-none'
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Solo Administrador: crea usuarios y decide qué pantallas ve cada uno.
// Cada casilla se guarda al marcarla.
export default function UsuariosView({ yo }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [nuevo, setNuevo] = useState({ usuario: '', nombre: '', clave: '', rol: 'usuario', permisos: [] })

  const correr = async (fn, ok) => {
    setError(''); setAviso('')
    try { setDatos(await fn()); if (ok) setAviso(ok); return true } catch (e) { setError(mensaje(e)); return false }
  }

  useEffect(() => { correr(() => window.api.usuariosListar()) }, [])
  if (!datos) return <div className="p-6 text-white/50">{error || 'Cargando…'}</div>

  const { usuarios, pantallas, plantillas } = datos
  const grupos = [...new Set(pantallas.map((p) => p.grupo))]

  const editar = (usuario, cambios, ok) => correr(() => window.api.usuariosEditar({ usuario, cambios }), ok)
  const alternar = (u, id) => editar(u.usuario, {
    permisos: u.permisos.includes(id) ? u.permisos.filter((p) => p !== id) : [...u.permisos, id],
  })

  const restablecer = (u) => {
    const clave = window.prompt(`Nueva contraseña TEMPORAL para "${u.usuario}" (mínimo 6).\nAl entrar se le pedirá cambiarla.`)
    if (clave) correr(() => window.api.usuariosRestablecerClave({ usuario: u.usuario, clave }), `Contraseña de ${u.usuario} restablecida.`)
  }

  const crear = async (e) => {
    e.preventDefault()
    const ok = await correr(() => window.api.usuariosCrear(nuevo), `Usuario "${nuevo.usuario.trim().toLowerCase()}" creado. Al entrar por primera vez cambiará su contraseña.`)
    if (ok) setNuevo({ usuario: '', nombre: '', clave: '', rol: 'usuario', permisos: [] })
  }

  const marcarNuevo = (id) => setNuevo((n) => ({
    ...n, permisos: n.permisos.includes(id) ? n.permisos.filter((p) => p !== id) : [...n.permisos, id],
  }))

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <p className="text-sm text-white/60">
          Solo tú eres Administrador (viene integrado en la app). A cada usuario de este equipo márcale las pantallas que puede usar; el cambio vale desde su siguiente clic.
        </p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {aviso && <p className="text-green-400 text-sm">{aviso}</p>}

      <div className="overflow-auto border border-navy-light rounded">
        <table className="text-sm w-full">
          <thead className="bg-navy-dark text-xs text-white/70">
            <tr>
              <th className="p-2 text-left" rowSpan={2}>Usuario</th>
              {grupos.map((g) => (
                <th key={g} className="p-1 text-center border-l border-navy-light" colSpan={pantallas.filter((p) => p.grupo === g).length}>{g}</th>
              ))}
              <th className="p-2 text-left border-l border-navy-light" rowSpan={2}>Activo</th>
              <th className="p-2 text-left" rowSpan={2}>Último ingreso</th>
              <th className="p-2" rowSpan={2}></th>
            </tr>
            <tr>
              {pantallas.map((p) => <th key={p.id} className="p-1 font-normal text-center w-20">{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const soyYo = u.usuario === yo.usuario
              return (
                <tr key={u.usuario} className={`border-t border-navy-light/50 ${u.activo ? '' : 'opacity-50'}`}>
                  <td className="p-2">
                    <div className="font-medium">{u.usuario}{soyYo && <span className="text-gold text-xs"> (tú)</span>}</div>
                    <div className="text-xs text-white/50">{u.nombre}</div>
                    {u.debeCambiar && <div className="text-xs text-yellow-300">contraseña temporal</div>}
                  </td>
                  {pantallas.map((p) => (
                    <td key={p.id} className="p-1 text-center">
                      <input type="checkbox"
                        checked={u.permisos.includes(p.id)}
                        onChange={() => alternar(u, p.id)} />
                    </td>
                  ))}
                  <td className="p-2 border-l border-navy-light/50">
                    <input type="checkbox" checked={u.activo} disabled={soyYo}
                      onChange={(e) => editar(u.usuario, { activo: e.target.checked })} />
                  </td>
                  <td className="p-2 text-xs text-white/60">{fecha(u.ultimoIngreso)}</td>
                  <td className="p-2">
                    {!soyYo && <button onClick={() => restablecer(u)} className="text-xs underline text-gold whitespace-nowrap">Restablecer contraseña</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="bg-navy-dark border border-navy-light rounded-lg p-4 space-y-3 max-w-3xl">
        <div className="font-medium text-sm">Nuevo usuario</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input placeholder="Usuario (ej. rvargas)" value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} className={campo} />
          <input placeholder="Nombre completo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={campo} />
          <input placeholder="Contraseña temporal" type="text" value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })} className={campo} />
        </div>
        {(
          <div className="space-y-2">
            <div className="flex gap-2 text-xs">
              <span className="text-white/50">Marcar como:</span>
              <button type="button" onClick={() => setNuevo({ ...nuevo, permisos: plantillas.contratos })} className="underline text-gold">Contratos</button>
              <button type="button" onClick={() => setNuevo({ ...nuevo, permisos: plantillas.seleccion })} className="underline text-gold">Selección</button>
              <button type="button" onClick={() => setNuevo({ ...nuevo, permisos: [] })} className="underline text-white/50">Ninguna</button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {pantallas.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={nuevo.permisos.includes(p.id)} onChange={() => marcarNuevo(p.id)} />
                  {p.label} <span className="text-white/30 text-xs">({p.grupo})</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button type="submit" disabled={!nuevo.usuario.trim() || !nuevo.clave}
          className="px-4 py-2 rounded text-sm bg-gold text-navy font-semibold disabled:opacity-50">Crear usuario</button>
      </form>
    </div>
  )
}
