import React, { useState, useEffect } from 'react'
import Toast from './Toast'

const DEFAULTS = { SUELDO: '', mesesDias12: 5, mesesDias3mas: 6 }

export default function SettingsView() {
  const [form, setForm]   = useState(DEFAULTS)
  const [busy, setBusy]   = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    window.api.getSettings().then(s => setForm({ ...DEFAULTS, ...s })).catch(() => {})
  }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    setBusy(true)
    try {
      await window.api.saveSettings(form)
      showToast('Configuración guardada')
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-navy overflow-auto">
      <div className="max-w-xl mx-auto w-full px-6 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Configuración</h2>
          <p className="text-white/50 text-sm mt-1">Valores que se aplican a todos los contratos generados</p>
        </div>

        {/* Sueldo */}
        <Section title="Remuneración">
          <Field label="Sueldo mensual" hint="Se inserta en el campo {{SUELDO}} de la plantilla">
            <input
              type="text"
              value={form.SUELDO}
              onChange={e => set('SUELDO', e.target.value)}
              placeholder="Ej: S/ 1,025.00"
              className="w-full bg-navy-dark text-white text-sm px-3 py-2 rounded border border-navy-light focus:border-gold outline-none transition-colors"
            />
          </Field>
        </Section>

        {/* Duración */}
        <Section title="Duración del contrato">
          <p className="text-xs text-white/40 mb-4">
            La duración varía según el día de inicio del contrato
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Inicio días 1 – 2 del mes" hint="meses">
              <NumberInput value={form.mesesDias12} min={1} max={24}
                onChange={v => set('mesesDias12', v)} />
            </Field>
            <Field label="Inicio día 3 en adelante" hint="meses">
              <NumberInput value={form.mesesDias3mas} min={1} max={24}
                onChange={v => set('mesesDias3mas', v)} />
            </Field>
          </div>
        </Section>

        <button onClick={handleSave} disabled={busy}
          className="mt-2 px-6 py-2 rounded bg-gold text-navy font-semibold text-sm hover:bg-gold-hover transition-colors disabled:opacity-50">
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6 p-4 bg-navy-dark rounded-lg border border-navy-light">
      <p className="text-xs text-gold font-semibold uppercase tracking-wide mb-4">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-white/60 mb-1">{label}</label>
      {children}
      {hint && <p className="text-white/30 text-xs mt-0.5">{hint}</p>}
    </div>
  )
}

function NumberInput({ value, min, max, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="w-20 bg-navy text-white text-sm px-3 py-2 rounded border border-navy-light focus:border-gold outline-none transition-colors text-center"
      />
      <span className="text-white/50 text-sm">meses</span>
    </div>
  )
}
