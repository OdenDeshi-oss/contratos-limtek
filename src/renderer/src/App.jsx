import React, { useState } from 'react'
import BulkView from './components/BulkView'
import SingleForm from './components/SingleForm'
import SettingsView from './components/SettingsView'
import PasswordModal from './components/PasswordModal'

const NAV = [
  { id: 'bulk',     label: 'Carga Masiva',   icon: '📋' },
  { id: 'single',   label: 'Nuevo Contrato', icon: '➕' },
  { id: 'settings', label: 'Configuración',  icon: '⚙️' },
]

export default function App() {
  const [view, setView]               = useState('bulk')
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [settingsUnlocked, setSettingsUnlocked] = useState(false)

  const handleNav = (id) => {
    if (id === 'settings' && !settingsUnlocked) {
      setShowPwdModal(true)
      return
    }
    setView(id)
  }

  return (
    <div className="flex flex-col h-screen bg-navy text-white select-none">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 bg-navy-dark border-b border-navy-light shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-gold flex items-center justify-center font-bold text-navy text-sm">L</div>
          <div>
            <div className="font-bold text-sm leading-none">LIMTEK</div>
            <div className="text-xs text-gold leading-none">Generador de Contratos</div>
          </div>
        </div>

        <nav className="flex gap-1 ml-6">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => handleNav(n.id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === n.id
                  ? 'bg-gold text-navy'
                  : 'text-white/70 hover:text-white hover:bg-navy-light'
              }`}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right leading-tight">
            <p className="text-xs text-white/40">Desarrollado por <span className="text-white/60">César Pariona</span></p>
            <p className="text-xs text-white/30">© {new Date().getFullYear()} Todos los derechos reservados</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {view === 'bulk'     && <BulkView />}
        {view === 'single'   && <SingleForm />}
        {view === 'settings' && <SettingsView />}

        {showPwdModal && (
          <PasswordModal
            onSuccess={() => { setSettingsUnlocked(true); setShowPwdModal(false); setView('settings') }}
            onClose={() => setShowPwdModal(false)}
          />
        )}
      </main>
    </div>
  )
}
