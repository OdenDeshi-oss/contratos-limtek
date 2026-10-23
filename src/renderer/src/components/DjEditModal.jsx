import React, { useState, useMemo } from 'react'
import { validateDjRow, EMAIL_MAX } from '../../../shared/dj.js'

const FIELDS = [
  { key: 'PATERNO',  label: 'Apellido paterno' },
  { key: 'MATERNO',  label: 'Apellido materno' },
  { key: 'NOMBRE1',  label: 'Primer nombre' },
  { key: 'NOMBRE2',  label: 'Segundo nombre' },
  { key: 'DNI',      label: 'DNI' },
  { key: 'CORREO',   label: `Correo (máx. ${EMAIL_MAX} caracteres)` },
  { key: 'TELEFONO', label: 'Teléfono' },
  { key: 'FECHA',    label: 'Fecha (DD/MM/AAAA)' },
]

export default function DjEditModal({ row, onSave, onClose }) {
  const [form, setForm] = useState({ ...row })

  // Vista previa de cómo quedará tras la limpieza/validación
  const preview = useMemo(() => validateDjRow({ ...form, _nameWarn: '' }), [form])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-dark border border-navy-light rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-light">
          <h2 className="font-semibold text-lg">Editar registro <span className="text-white/40 text-sm">· fila {row._fila}</span></h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className={key === 'CORREO' ? 'col-span-2' : ''}>
                <label className="block text-xs text-white/60 mb-1">{label}</label>
                <input
                  value={form[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-navy text-white text-sm px-3 py-2 rounded border border-navy-light focus:border-gold outline-none transition-colors uppercase"
                />
              </div>
            ))}
          </div>

          <div className="rounded bg-navy px-3 py-2 text-xs space-y-0.5">
            <div className="text-white/50">Así saldrá en el PDF:</div>
            <div className="text-white/90">{preview.NOMBRE_COMPLETO || '—'}</div>
            <div className="text-white/90 font-mono">{preview.CORREO || '—'}</div>
            {preview._errors.map(m => <div key={m} className="text-red-300">✖ {m}</div>)}
            {preview._warns.map(m  => <div key={m} className="text-amber-300">⚠ {m}</div>)}
            {preview._fixes.map(m  => <div key={m} className="text-sky-300">✔ {m}</div>)}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-navy-light">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 rounded text-sm bg-gold text-navy font-semibold hover:bg-gold-hover transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  )
}
