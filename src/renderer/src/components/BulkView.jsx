import React, { useState, useCallback, useMemo, useRef } from 'react'
import EditModal from './EditModal'
import Toast from './Toast'

const VISIBLE_COLS = ['NOMBRES','DNI','DIRECCION','FECHA_INICIO','FECHA_FIN','UNIDAD','HORARIO']

export default function BulkView() {
  const [rows, setRows]           = useState([])
  const [selected, setSelected]   = useState(new Set())
  const [search, setSearch]       = useState('')
  const [sortKey, setSortKey]     = useState(null)
  const [sortAsc, setSortAsc]     = useState(true)
  const [editRow, setEditRow]     = useState(null)
  const [outputDir, setOutputDir] = useState('')
  const [tipos, setTipos]         = useState({ contrato: true, compromiso: false })
  const [formato, setFormato]     = useState('word')
  const [progress, setProgress]   = useState(0)
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState(null)
  const lastClickRef              = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Load Excel ───────────────────────────────────────────────────────────
  const handleLoad = useCallback(async () => {
    const path = await window.api.pickExcel()
    if (!path) return
    try {
      const data = await window.api.loadExcel(path)
      setRows(data)
      setSelected(new Set())
      setSearch('')
      showToast(`${data.length} registros cargados`)
    } catch (e) {
      showToast(`Error al cargar: ${e.message}`, 'error')
    }
  }, [])

  // ── Filtered + sorted rows ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows
    if (search) {
      const t = search.toLowerCase()
      r = r.filter(row => VISIBLE_COLS.some(c => String(row[c] || '').toLowerCase().includes(t)))
    }
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const va = String(a[sortKey] || ''), vb = String(b[sortKey] || '')
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    }
    return r
  }, [rows, search, sortKey, sortAsc])

  // ── Selection ────────────────────────────────────────────────────────────
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
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r._id)))
    }
  }

  // ── Sort ─────────────────────────────────────────────────────────────────
  const handleSort = col => {
    if (sortKey === col) setSortAsc(a => !a)
    else { setSortKey(col); setSortAsc(true) }
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const tipoList = Object.entries(tipos).filter(([,v]) => v).map(([k]) => k === 'contrato' ? 'contrato' : 'compromiso')
    if (tipoList.length === 0) return showToast('Selecciona al menos un tipo de documento', 'error')

    const targetRows = selected.size > 0
      ? rows.filter(r => selected.has(r._id))
      : filtered

    if (targetRows.length === 0) return showToast('No hay filas para generar', 'error')

    const invalidCount = targetRows.filter(r => !r._dniValid).length
    if (invalidCount > 0 && targetRows.every(r => !r._dniValid)) {
      return showToast('Todos los registros tienen DNI inválido', 'error')
    }

    setBusy(true); setProgress(10)
    try {
      const usePdf  = formato === 'pdf' || formato === 'ambos'
      const useWord = formato === 'word' || formato === 'ambos'
      const result = await window.api.generateDocs({
        rows: targetRows,
        outputDir,
        tipos: tipoList,
        pdf: usePdf,
        wordOnly: !useWord,
      })
      setProgress(100)
      if (result.errors?.length > 0) {
        showToast(`Generado con ${result.errors.length} error(es)`, 'warn')
      } else {
        showToast(`Documentos generados correctamente`)
      }
      if (result.outPaths?.[0]) {
        window.api.openFolder(outputDir || await window.api.getDownloads())
      }
    } catch (e) {
      showToast(`Error: ${e.message}`, 'error')
    } finally {
      setBusy(false)
      setTimeout(() => setProgress(0), 1500)
    }
  }, [rows, filtered, selected, outputDir, tipos, formato])

  // ── Edit ─────────────────────────────────────────────────────────────────
  const handleEdit = () => {
    if (selected.size !== 1) return showToast('Selecciona exactamente una fila para editar', 'warn')
    const id = [...selected][0]
    setEditRow(rows.find(r => r._id === id))
  }

  const handleSaveEdit = async (updated) => {
    const dates = await window.api.computeDates(updated.FECHA_INICIO)
    const merged = { ...updated, ...dates, _dniValid: /^\d{8,9}$/.test(updated.DNI) }
    setRows(prev => prev.map(r => r._id === merged._id ? merged : r))
    setEditRow(null)
  }

  // ── Misc ─────────────────────────────────────────────────────────────────
  const handleDownloadFormat = async () => {
    const dst = await window.api.copyFormat(outputDir)
    showToast(`Formato guardado en ${dst}`)
  }

  const handlePickFolder = async () => {
    const dir = await window.api.pickFolder()
    if (dir) setOutputDir(dir)
  }

  const validCount    = rows.filter(r => r._dniValid).length
  const selectedCount = selected.size
  const allChecked    = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="flex flex-col h-full bg-navy">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-navy-dark border-b border-navy-light shrink-0">
        {/* Acciones principales */}
        <Btn onClick={handleDownloadFormat} disabled={busy}>Formato Excel</Btn>
        <Btn onClick={handleLoad}           disabled={busy} primary>Cargar Excel</Btn>
        <div className="w-px h-6 bg-navy-light" />
        <Btn onClick={handleEdit}           disabled={busy || rows.length === 0 || selectedCount !== 1}>Editar</Btn>
        <Btn onClick={handleGenerate}       disabled={busy || rows.length === 0} primary>
          {busy ? 'Generando…' : 'Generar'}
        </Btn>
        <div className="w-px h-6 bg-navy-light" />

        {/* Tipos */}
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox checked={tipos.contrato}    onChange={v => setTipos(t => ({...t, contrato: v}))} />
          Contratos
        </label>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox checked={tipos.compromiso}  onChange={v => setTipos(t => ({...t, compromiso: v}))} />
          Compromisos
        </label>
        <div className="flex items-center border border-navy-light rounded overflow-hidden text-xs">
          {[['word','Word'],['pdf','PDF'],['ambos','Ambos']].map(([val, lbl]) => (
            <button key={val} onClick={() => setFormato(val)}
              className={`px-2.5 py-1 transition-colors ${formato === val ? 'bg-gold text-navy font-semibold' : 'text-white/60 hover:text-white'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Carpeta de salida */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePickFolder}
            className="text-xs text-white/60 hover:text-white border border-navy-light hover:border-white/40 px-2 py-1 rounded transition-colors"
          >
            {outputDir ? '📁 ' + outputDir.split(/[\\/]/).pop() : '📁 Downloads'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress > 0 && (
        <div className="h-1 bg-navy-dark shrink-0">
          <div
            className="h-full bg-gold transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Search + stats */}
      <div className="flex items-center gap-3 px-4 py-2 bg-navy shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="bg-navy-light text-white placeholder-white/40 text-sm px-3 py-1.5 rounded border border-navy-light focus:border-gold outline-none w-56 transition-colors"
        />
        <span className="text-xs text-white/50">
          {rows.length > 0 && `${validCount} válidos · ${filtered.length} mostrados${selectedCount > 0 ? ` · ${selectedCount} seleccionados` : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {rows.length === 0 ? (
          <EmptyState onLoad={handleLoad} onFormat={handleDownloadFormat} />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-navy-dark px-3 py-2 text-left w-8">
                  <Checkbox checked={allChecked} onChange={toggleAll} />
                </th>
                {VISIBLE_COLS.map(col => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="bg-navy-dark px-3 py-2 text-left text-xs font-semibold text-gold uppercase tracking-wide cursor-pointer hover:bg-navy-light transition-colors whitespace-nowrap"
                  >
                    {col.replace(/_/g, ' ')}
                    {sortKey === col && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const isSelected = selected.has(row._id)
                const isInvalid  = !row._dniValid
                return (
                  <tr
                    key={row._id}
                    onClick={e => toggleSelect(row._id, e.shiftKey)}
                    onDoubleClick={() => { setSelected(new Set([row._id])); setEditRow(row) }}
                    className={`cursor-pointer transition-colors border-b border-navy-light/30 ${
                      isSelected
                        ? 'bg-gold/20 hover:bg-gold/25'
                        : isInvalid
                        ? 'bg-red-900/30 hover:bg-red-900/40'
                        : i % 2 === 0
                        ? 'bg-navy hover:bg-navy-light/50'
                        : 'bg-navy-dark/60 hover:bg-navy-light/50'
                    }`}
                  >
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onChange={() => toggleSelect(row._id, false)} />
                    </td>
                    {VISIBLE_COLS.map(col => (
                      <td key={col} className={`px-3 py-2 whitespace-nowrap ${isInvalid && col === 'DNI' ? 'text-red-400 font-medium' : 'text-white/90'}`}>
                        {String(row[col] || '')}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editRow && (
        <EditModal
          row={editRow}
          onSave={handleSaveEdit}
          onClose={() => setEditRow(null)}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
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

function Checkbox({ checked, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="accent-gold cursor-pointer"
    />
  )
}

function EmptyState({ onLoad, onFormat }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div className="text-6xl opacity-30">📄</div>
      <div>
        <p className="text-white/60 mb-1">No hay datos cargados</p>
        <p className="text-white/40 text-sm">Carga un Excel con los datos del personal</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onFormat}
          className="px-4 py-2 rounded border border-white/20 text-sm text-white/70 hover:text-white hover:border-white/40 transition-colors"
        >
          Descargar formato Excel
        </button>
        <button
          onClick={onLoad}
          className="px-4 py-2 rounded bg-gold text-navy font-medium text-sm hover:bg-gold-hover transition-colors"
        >
          Cargar Excel
        </button>
      </div>
    </div>
  )
}
