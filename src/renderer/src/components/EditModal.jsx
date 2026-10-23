import React, { useState } from 'react'

const FIELDS = [
  { key: 'NOMBRES',         label: 'Nombres completos' },
  { key: 'DNI',             label: 'DNI (8 dígitos) / CE (9 dígitos)' },
  { key: 'DIRECCION',       label: 'Dirección' },
  { key: 'FECHA_INICIO',    label: 'Fecha de inicio (DD/MM/AAAA)' },
  { key: 'UNIDAD',          label: 'Unidad / Sede' },
  { key: 'DIRECCION_UNIDAD',label: 'Dirección de la unidad' },
  { key: 'HORARIO',         label: 'Horario' },
]

export default function EditModal({ row, onSave, onClose }) {
  const [form, setForm] = useState({ ...row })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const e = {}
    if (!/^\d{8,9}$/.test(form.DNI)) e.DNI = 'Debe tener 8 dígitos (DNI) o 9 dígitos (CE)'
    if (!form.NOMBRES?.trim()) e.NOMBRES = 'Campo requerido'
    if (!form.FECHA_INICIO?.trim()) e.FECHA_INICIO = 'Campo requerido'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-light">
          <h2 className="font-semibold text-lg">Editar registro</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-white/60 mb-1">{label}</label>
              <input
                value={form[key] || ''}
                onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: undefined })) }}
                className={`w-full bg-navy text-white text-sm px-3 py-2 rounded border outline-none transition-colors ${
                  errors[key] ? 'border-red-500' : 'border-navy-light focus:border-gold'
                }`}
              />
              {errors[key] && <p className="text-red-400 text-xs mt-0.5">{errors[key]}</p>}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-navy-light">
          <button onClick={onClose}   className="px-4 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  )
}
