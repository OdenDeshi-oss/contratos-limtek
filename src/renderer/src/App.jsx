import React, { useEffect, useState } from 'react'
import BulkView from './components/BulkView'
import SingleForm from './components/SingleForm'
import DjView from './components/DjView'
import SettingsView from './components/SettingsView'
import RenombrarView from './components/RenombrarView'
import BuscarView from './components/BuscarView'
import LoginView from './components/LoginView'
import UsuariosView from './components/UsuariosView'
import CambiarClaveModal from './components/CambiarClaveModal'

// Lo que ve cada usuario lo decide el Administrador (pantalla Usuarios).
const NAV = [
  { id: 'renombrar', label: 'Renombrar',       icon: '🏷️' },
  { id: 'buscar',    label: 'Buscar',          icon: '🔎' },
  { id: 'bulk',      label: 'Carga Masiva',    icon: '📋' },
  { id: 'single',    label: 'Nuevo Contrato',  icon: '➕' },
  { id: 'dj',        label: 'DJ y Compromiso', icon: '📝' },
  { id: 'settings',  label: 'Configuración',   icon: '⚙️' },
  { id: 'usuarios',  label: 'Usuarios',        icon: '👥' },
]

export default function App() {
  const [sesion, setSesion] = useState(null)
  const [view, setView] = useState(null)
  const [cambiarClave, setCambiarClave] = useState(false)

  useEffect(() => {
    window.api.sesionEstado().then(setSesion)
  }, [])

  const yo = sesion?.usuario
  const nav = yo ? NAV.filter((n) => yo.ve.includes(n.id)) : []
  const actual = nav.some((n) => n.id === view) ? view : nav[0]?.id

  const salir = async () => { setSesion(await window.api.sesionSalir()); setView(null) }

  let contenido = null
  if (!sesion) contenido = null
  else if (!yo) contenido = <LoginView key={sesion.hayUsuarios ? 'entrar' : 'crear'} sesion={sesion} onEntrar={setSesion} />
  else if (!nav.length) contenido = (
    <div className="p-10 text-center text-white/60">Tu usuario todavía no tiene pantallas asignadas. Pídele al Administrador que te las active.</div>
  )

  return (
    <div className="flex flex-col h-screen bg-navy text-white select-none">
      <header className="flex items-center gap-4 px-6 py-3 bg-navy-dark border-b border-navy-light shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gold flex items-center justify-center font-bold text-navy text-sm">L</div>
          <div>
            <div className="font-bold text-sm leading-none">LIMTEK</div>
            <div className="text-xs text-gold leading-none">Gestión Integral de Contratos</div>
          </div>
        </div>

        <nav className="flex gap-1 ml-6 flex-wrap">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                actual === n.id ? 'bg-gold text-navy' : 'text-white/70 hover:text-white hover:bg-navy-light'}`}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {yo && (
            <div className="text-right leading-tight">
              <p className="text-xs text-gold">{yo.nombre} · {yo.rol === 'admin' ? 'Administrador' : 'Usuario'}</p>
              <p className="text-xs space-x-2">
                <button onClick={() => setCambiarClave(true)} className="text-white/50 hover:text-white underline">Cambiar contraseña</button>
                <button onClick={salir} className="text-white/50 hover:text-white underline">Cerrar sesión</button>
              </p>
            </div>
          )}
          <div className="text-right leading-tight">
            <p className="text-xs text-white/40">Desarrollado por <span className="text-white/60">César Pariona</span></p>
            <p className="text-xs text-white/30">© {new Date().getFullYear()} Todos los derechos reservados</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {contenido}
        {yo && !contenido && (
          <>
            {actual === 'renombrar' && <RenombrarView />}
            {actual === 'buscar'    && <BuscarView />}
            {actual === 'bulk'      && <BulkView />}
            {actual === 'single'    && <SingleForm />}
            {actual === 'dj'        && <DjView />}
            {actual === 'settings'  && <SettingsView />}
            {actual === 'usuarios'  && <UsuariosView yo={yo} />}
          </>
        )}
        {yo && (yo.debeCambiar || cambiarClave) && (
          <CambiarClaveModal obligatorio={yo.debeCambiar}
            onListo={(s) => { setSesion(s); setCambiarClave(false) }}
            onClose={() => setCambiarClave(false)} />
        )}
      </main>
    </div>
  )
}
