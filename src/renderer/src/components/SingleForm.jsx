import React, { useState } from 'react'
import Toast from './Toast'

const EMPTY = {
  NOMBRES: '', DNI: '', DIRECCION: '',
  FECHA_INICIO: '', UNIDAD: '', DIRECCION_UNIDAD: '', HORARIO: '',
}

// Fields that auto-uppercase
const UPPERCASE_FIELDS = new Set(['NOMBRES','DIRECCION','UNIDAD','DIRECCION_UNIDAD','HORARIO'])

const FIELDS = [
  { key: 'NOMBRES',          label: 'Nombres y apellidos completos', span: 2, type: 'text'   },
  { key: 'DNI',              label: 'DNI (8 dígitos) / CE (9 dígitos)', span: 1, type: 'text', inputMode: 'numeric' },
  { key: 'DIRECCION',        label: 'Dirección domicilio',           span: 2, type: 'text'   },
  { key: 'FECHA_INICIO',     label: 'Fecha de inicio',               span: 1, type: 'date'   },
  { key: 'UNIDAD',           label: 'Unidad / Sede',                  span: 2, type: 'text'   },
  { key: 'DIRECCION_UNIDAD', label: 'Dirección de la unidad',        span: 2, type: 'text'   },
  { key: 'HORARIO',          label: 'Horario',                       span: 2, type: 'text'   },
]

// Convert YYYY-MM-DD (input[type=date] value) → DD/MM/YYYY
function isoToDmy(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Convert DD/MM/YYYY → YYYY-MM-DD (for input[type=date] value)
function dmyToIso(dmy) {
  if (!dmy) return ''
  const [d, m, y] = dmy.split('/')
  return `${y}-${m}-${d}`
}

export default function SingleForm() {
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [tipos, setTipos]         = useState({ contrato: true, compromiso: false })
  // formato: 'word' | 'pdf' | 'ambos'
  const [formato, setFormato]     = useState('word')
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState(null)
  const [computed, setComputed]   = useState({ FECHA_TEXTO: '', FECHA_FIN: '' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleChange = async (key, rawValue) => {
    // Auto-uppercase for text fields (except DNI and date)
    const value = UPPERCASE_FIELDS.has(key) ? rawValue.toUpperCase() : rawValue

    if (key === 'FECHA_INICIO') {
      // rawValue comes from input[type=date] as YYYY-MM-DD
      const dmy = isoToDmy(rawValue)
      setForm(f => ({ ...f, FECHA_INICIO: dmy }))
      setErrors(e => ({ ...e, FECHA_INICIO: undefined }))
      if (dmy) {
        try {
          const dates = await window.api.computeDates(dmy)
          setComputed({ FECHA_TEXTO: dates.FECHA_TEXTO, FECHA_FIN: dates.FECHA_FIN })
        } catch { setComputed({ FECHA_TEXTO: '', FECHA_FIN: '' }) }
      }
      return
    }

    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!form.NOMBRES?.trim())          e.NOMBRES = 'Requerido'
    if (!/^\d{8,9}$/.test(form.DNI))    e.DNI = 'Debe tener 8 dígitos (DNI) o 9 dígitos (CE)'
    if (!form.DIRECCION?.trim())         e.DIRECCION = 'Requerido'
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(form.FECHA_INICIO)) e.FECHA_INICIO = 'Selecciona una fecha'
    if (!form.UNIDAD?.trim())            e.UNIDAD = 'Requerido'
    if (!form.DIRECCION_UNIDAD?.trim())  e.DIRECCION_UNIDAD = 'Requerido'
    if (!form.HORARIO?.trim())           e.HORARIO = 'Requerido'
    if (!tipos.contrato && !tipos.compromiso) e._tipos = 'Selecciona al menos un tipo de documento'
    return e
  }

  const handleGenerate = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    setBusy(true)
    try {
      const dates  = await window.api.computeDates(form.FECHA_INICIO)
      const row    = { ...form, ...dates, _id: 0, _dniValid: true }
      const tipoList = Object.entries(tipos).filter(([,v]) => v).map(([k]) => k)
      const usePdf   = formato === 'pdf' || formato === 'ambos'
      const useWord  = formato === 'word' || formato === 'ambos'

      const result = await window.api.generateSingle({ row, tipos: tipoList, pdf: usePdf, wordOnly: !useWord })
      showToast('Documento generado correctamente')
      if (result.outPaths?.[0]) {
        const folder = result.outPaths[0].replace(/[/\\][^/\\]+$/, '')
        window.api.openFolder(folder)
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleReset = () => {
    setForm(EMPTY)
    setErrors({})
    setComputed({ FECHA_TEXTO: '', FECHA_FIN: '' })
  }

  return (
    <div className="flex flex-col h-full bg-navy overflow-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Nuevo Contrato</h2>
          <p className="text-white/50 text-sm mt-1">Genera un contrato individual sin necesidad de cargar un Excel</p>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {FIELDS.map(({ key, label, span, type, inputMode }) => (
            <div key={key} className={span === 2 ? 'col-span-2' : 'col-span-1'}>
              <label className="block text-xs text-white/60 mb-1">{label}</label>

              {type === 'date' ? (
                <input
                  type="date"
                  value={form[key] ? dmyToIso(form[key]) : ''}
                  onChange={e => handleChange(key, e.target.value)}
                  className={`w-full bg-navy-dark text-white text-sm px-3 py-2 rounded border outline-none transition-colors
                    [color-scheme:dark]
                    ${errors[key] ? 'border-red-500' : 'border-navy-light focus:border-gold'}`}
                />
              ) : (
                <input
                  type="text"
                  inputMode={inputMode}
                  value={form[key]}
                  onChange={e => handleChange(key, e.target.value)}
                  maxLength={key === 'DNI' ? 9 : undefined}
                  className={`w-full bg-navy-dark text-white text-sm px-3 py-2 rounded border outline-none transition-colors
                    ${errors[key] ? 'border-red-500' : 'border-navy-light focus:border-gold'}`}
                />
              )}
              {errors[key] && <p className="text-red-400 text-xs mt-0.5">{errors[key]}</p>}
            </div>
          ))}
        </div>

        {/* Computed dates preview */}
        {(computed.FECHA_TEXTO || computed.FECHA_FIN) && (
          <div className="mb-6 p-4 bg-navy-dark rounded-lg border border-navy-light">
            <p className="text-xs text-gold font-semibold mb-2 uppercase tracking-wide">Fechas calculadas</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-white/50 text-xs">Fecha en texto</span>
                <p className="text-white">{computed.FECHA_TEXTO}</p>
              </div>
              <div>
                <span className="text-white/50 text-xs">Fecha fin (6 meses)</span>
                <p className="text-white">{computed.FECHA_FIN}</p>
              </div>
            </div>
          </div>
        )}

        {/* Document type */}
        <div className="mb-4 p-4 bg-navy-dark rounded-lg border border-navy-light">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wide mb-3">Tipo de documento</p>
          <div className="flex gap-6">
            {[['contrato','Contrato'],['compromiso','Carta de Compromiso']].map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={tipos[k]}
                  onChange={e => setTipos(t => ({ ...t, [k]: e.target.checked }))}
                  className="accent-gold" />
                {lbl}
              </label>
            ))}
          </div>
          {errors._tipos && <p className="text-red-400 text-xs mt-2">{errors._tipos}</p>}
        </div>

        {/* Output format */}
        <div className="mb-6 p-4 bg-navy-dark rounded-lg border border-navy-light">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wide mb-3">Formato de salida</p>
          <div className="flex gap-4">
            {[
              ['word',  '📄 Solo Word (.docx)'],
              ['pdf',   '📕 Solo PDF'],
              ['ambos', '📦 Ambos'],
            ].map(([val, lbl]) => (
              <label key={val} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded border transition-colors ${
                formato === val
                  ? 'border-gold bg-gold/10 text-white'
                  : 'border-navy-light text-white/60 hover:text-white hover:border-white/30'
              }`}>
                <input type="radio" name="formato" value={val} checked={formato === val}
                  onChange={() => setFormato(val)} className="accent-gold" />
                {lbl}
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleReset}
            className="px-4 py-2 rounded text-sm text-white/60 hover:text-white border border-navy-light hover:border-white/40 transition-colors">
            Limpiar
          </button>
          <button onClick={handleGenerate} disabled={busy}
            className="px-6 py-2 rounded bg-gold text-navy font-semibold text-sm hover:bg-gold-hover transition-colors disabled:opacity-50">
            {busy ? 'Generando…' : 'Generar Documento'}
          </button>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
