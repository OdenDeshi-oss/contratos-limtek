import React, { useState, useCallback, useMemo, useRef } from 'react'
import DjEditModal from './DjEditModal'
import Toast from './Toast'
import { validateDjRow, markDuplicates } from '../../../shared/dj.js'

const COLS = [
  { key: 'DNI',      label: 'DNI' },
  { key: 'PATERNO',  label: 'Ap. Paterno' },
  { key: 'MATERNO',  label: 'Ap. Materno' },
  { key: 'NOMBRE1',  label: '1er Nombre' },
  { key: 'NOMBRE2',  label: '2do Nombre' },
  { key: 'CORREO',   label: 'Correo' },
  { key: 'TELEFONO', label: 'Teléfono' },
  { key: 'FECHA',    label: 'Fecha' },
]

const FILTERS = [
  { id: 'all',   label: 'Todos',      test: () => true },
  { id: 'error', label: 'Con errores', test: r => r._errors.length > 0 },
  { id: 'warn',  label: 'Revisar',    test: r => r._errors.length === 0 && r._warns.length > 0 },
  { id: 'fix',   label: 'Corregidos', test: r => r._fixes.length > 0 },
  { id: 'ok',    label: 'OK',         test: r => r._errors.length === 0 && r._warns.length === 0 },
]

export default function DjView() {
  const [file, setFile]           = useState(null)
  const [sheets, setSheets]       = useState([])
  const [sheet, setSheet]         = useState(null)
  const [missing, setMissing]     = useState([])
  const [rows, setRows]           = useState([])
  const [selected, setSelected]   = useState(new Set())
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState('all')
  const [editRow, setEditRow]     = useState(null)
  const [outputDir, setOutputDir] = useState('')
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState(null)
  const lastClickRef              = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  // ── Carga ────────────────────────────────────────────────────────────────
  const load = useCallback(async (filePath, sheetName) => {
    try {
      const res = await window.api.djLoadExcel({ filePath, sheet: sheetName })
      setFile(filePath)
      setSheets(res.sheets)
      setSheet(res.sheet)
      setMissing(res.missing)
      setRows(res.rows)
      setSelected(new Set())
      setSearch('')
      setFilter('all')
      if (!res.sheet) return showToast('Ninguna hoja tiene columnas de APELLIDOS Y NOMBRES y DNI', 'error')
      const errs = res.rows.filter(r => r._errors.length).length
      showToast(`${res.rows.length} registros cargados de "${res.sheet}"${errs ? ` · ${errs} con errores` : ''}`, errs ? 'warn' : 'success')
    } catch (e) {
      showToast(`Error al cargar: ${e.message}`, 'error')
    }
  }, [])

  const handleLoad = async () => {
    const path = await window.api.pickExcel()
    if (path) load(path, null)
  }

  // ── Filtro + búsqueda ────────────────────────────────────────────────────
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(f => [f.id, rows.filter(f.test).length])),
    [rows],
  )

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter)
    let r = rows.filter(f.test)
    if (search) {
      const t = search.toUpperCase()
      r = r.filter(row => COLS.some(c => String(row[c.key] || '').toUpperCase().includes(t)))
    }
    return r
  }, [rows, filter, search])

  // ── Selección ────────────────────────────────────────────────────────────
  const toggleSelect = (id, shiftKey) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClickRef.current !== null) {
        const ids = filtered.map(r => r._id)
        const a = ids.indexOf(lastClickRef.current)
        const b = ids.indexOf(id)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        ids.slice(lo, hi + 1).forEach(i => next.add(i))
      } else {
        next.has(id) ? next.delete(id) : next.add(id)
      }
      lastClickRef.current = id
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(r => r._id)))
  }

  // ── Edición ──────────────────────────────────────────────────────────────
  const handleSaveEdit = (updated) => {
    // Al editar a mano, el aviso de separación ya fue revisado
    const fixed = validateDjRow({ ...updated, _nameWarn: '' })
    // Conservar el registro de correcciones automáticas hechas al cargar
    fixed._fixes = [...new Set([...editRow._fixes, ...fixed._fixes])]
    setRows(prev => markDuplicates(prev.map(r => r._id === fixed._id ? fixed : r)))
    setEditRow(null)
  }

  // ── Generar ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const target = selected.size > 0 ? rows.filter(r => selected.has(r._id)) : filtered
    if (target.length === 0) return showToast('No hay filas para generar', 'error')
    if (target.every(r => r._errors.length > 0)) {
      return showToast('Todas las filas tienen errores. Corrígelas antes de generar', 'error')
    }
    setBusy(true)
    try {
      const res = await window.api.djGenerate({ rows: target, outputDir })
      const extra = res.skipped ? ` · ${res.skipped} omitido(s) por errores` : ''
      showToast(`PDF generado con ${res.count} trabajador(es)${extra}`, res.skipped ? 'warn' : 'success')
      if (res.outPath) window.api.openPath(res.outPath)
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [rows, filtered, selected, outputDir])

  const handlePickFolder = async () => {
    const dir = await window.api.pickFolder()
    if (dir) setOutputDir(dir)
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length
  const validSheets = sheets.filter(s => s.ok)

  return (
    <div className="flex flex-col h-full bg-navy">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-navy-dark border-b border-navy-light shrink-0">
        <Btn onClick={handleLoad} disabled={busy} primary>Cargar Excel</Btn>
        {validSheets.length > 0 && (
          <select
            value={sheet || ''}
            onChange={e => load(file, e.target.value)}
            disabled={busy}
            className="bg-navy-light text-white text-sm px-2 py-1.5 rounded border border-white/10 outline-none focus:border-gold"
            title="Hoja del Excel"
          >
            {validSheets.map(s => <option key={s.name} value={s.name}>Hoja: {s.name}</option>)}
          </select>
        )}
        <div className="w-px h-6 bg-navy-light" />
        <Btn
          onClick={() => setEditRow(rows.find(r => r._id === [...selected][0]))}
          disabled={busy || selected.size !== 1}
        >
          Editar
        </Btn>
        <Btn onClick={handleGenerate} disabled={busy || rows.length === 0} primary>
          {busy ? 'Generando…' : 'Generar PDF'}
        </Btn>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePickFolder}
            className="text-xs text-white/60 hover:text-white border border-navy-light hover:border-white/40 px-2 py-1 rounded transition-colors"
          >
            {outputDir ? '📁 ' + outputDir.split(/[\\/]/).pop() : '📁 Downloads'}
          </button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="px-4 py-1.5 text-xs bg-amber-900/40 text-amber-200 border-b border-amber-700/40 shrink-0">
          No se encontró la columna: {missing.join(', ')}
        </div>
      )}

      {/* Búsqueda + filtros */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-navy shrink-0">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="bg-navy-light text-white placeholder-white/40 text-sm px-3 py-1.5 rounded border border-navy-light focus:border-gold outline-none w-56 transition-colors"
          />
          <div className="flex items-center gap-1">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filter === f.id ? 'bg-gold text-navy font-semibold' : 'text-white/60 hover:text-white hover:bg-navy-light'
                }`}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
          {selected.size > 0 && <span className="text-xs text-white/50">{selected.size} seleccionados</span>}
        </div>
      )}

      {/* Tabla */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {rows.length === 0 ? (
          <EmptyState onLoad={handleLoad} />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-navy-dark px-2 py-2 text-left w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-gold cursor-pointer" />
                </th>
                <Th>Fila</Th>
                {COLS.map(c => (
                  <React.Fragment key={c.key}>
                    <Th>{c.label}</Th>
                    {c.key === 'CORREO' && <Th>Observaciones</Th>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const isSelected = selected.has(row._id)
                const hasErr  = row._errors.length > 0
                const hasWarn = row._warns.length > 0
                return (
                  <tr
                    key={row._id}
                    onClick={e => toggleSelect(row._id, e.shiftKey)}
                    onDoubleClick={() => { setSelected(new Set([row._id])); setEditRow(row) }}
                    className={`cursor-pointer transition-colors border-b border-navy-light/30 ${
                      isSelected ? 'bg-gold/20 hover:bg-gold/25'
                      : hasErr   ? 'bg-red-900/30 hover:bg-red-900/40'
                      : hasWarn  ? 'bg-amber-900/25 hover:bg-amber-900/35'
                      : i % 2 === 0 ? 'bg-navy hover:bg-navy-light/50' : 'bg-navy-dark/60 hover:bg-navy-light/50'
                    }`}
                  >
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(row._id, false)} className="accent-gold cursor-pointer" />
                    </td>
                    <td className="px-2 py-2 text-white/40 text-xs">{row._fila}</td>
                    {COLS.map(c => (
                      <React.Fragment key={c.key}>
                        <td className={`px-2 py-2 whitespace-nowrap ${c.key === 'CORREO' ? 'font-mono text-xs' : ''} text-white/90`}>
                          {row[c.key] || <span className="text-white/25">—</span>}
                        </td>
                        {c.key === 'CORREO' && (
                          <td className="px-2 py-2 text-xs leading-snug min-w-[15rem]">
                            {row._errors.map(m => <div key={m} className="text-red-300">✖ {m}</div>)}
                            {row._warns.map(m  => <div key={m} className="text-amber-300">⚠ {m}</div>)}
                            {row._fixes.map(m  => <div key={m} className="text-sky-300">✔ {m}</div>)}
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editRow && <DjEditModal row={editRow} onSave={handleSaveEdit} onClose={() => setEditRow(null)} />}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="bg-navy-dark px-2 py-2 text-left text-xs font-semibold text-gold uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

function Btn({ children, onClick, disabled, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'bg-gold text-navy hover:bg-gold-hover'
          : 'bg-navy-light text-white hover:bg-navy-light/80 border border-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ onLoad }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div className="text-6xl opacity-30">📝</div>
      <div>
        <p className="text-white/60 mb-1">No hay datos cargados</p>
        <p className="text-white/40 text-sm">Carga el Excel del día: se leen APELLIDOS Y NOMBRES, DNI, CORREO, CELULAR y FECHA DE INGRESO</p>
      </div>
      <button
        onClick={onLoad}
        className="px-4 py-2 rounded bg-gold text-navy font-medium text-sm hover:bg-gold-hover transition-colors"
      >
        Cargar Excel
      </button>
    </div>
  )
}
