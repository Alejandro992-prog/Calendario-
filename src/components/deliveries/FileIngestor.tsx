import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Clipboard, FileSpreadsheet, FileText, X,
  CheckCircle2, AlertCircle, Loader2, ChevronDown, Trash2,
} from 'lucide-react'
import { parseExcel } from '@/lib/parsers/excel'
import { parsePDF } from '@/lib/parsers/pdf'
import { extractFromImage } from '@/lib/parsers/ocr'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { ParsedItem, Supplier } from '@/types'
import toast from 'react-hot-toast'

interface FileIngestorProps {
  suppliers: Supplier[]
  onClose: () => void
  onImported: () => void
}

type ParseState = 'idle' | 'parsing' | 'preview' | 'saving' | 'done' | 'error'

export default function FileIngestor({ suppliers, onClose, onImported }: FileIngestorProps) {
  const { profile } = useAuthStore()
  const [state, setState] = useState<ParseState>('idle')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('')
  const [deliveries, setDeliveries] = useState<{ id: string; label: string }[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [ocrMethod, setOcrMethod] = useState<string>('')

  useEffect(() => {
    loadDeliveries()
    // Listen for clipboard paste
    const handler = (e: ClipboardEvent) => handleClipboard(e)
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const loadDeliveries = async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('id, fecha_prevista, supplier:suppliers(nombre)')
      .order('fecha_prevista', { ascending: false })
      .limit(30)
    setDeliveries(
      (data || []).map((d: any) => ({
        id: d.id,
        label: `${d.supplier?.nombre || 'Sin proveedor'} — ${d.fecha_prevista}`,
      }))
    )
  }

  const processFile = async (file: File) => {
    setState('parsing')
    try {
      let parsed: ParsedItem[] = []
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'xlsx' || ext === 'csv' || ext === 'xls') {
        parsed = await parseExcel(file)
      } else if (ext === 'pdf') {
        parsed = await parsePDF(file)
      } else {
        throw new Error('Formato de archivo no soportado. Usa .xlsx, .csv o .pdf')
      }
      if (parsed.length === 0) throw new Error('No se encontraron artículos en el archivo')
      setItems(parsed)
      setState('preview')
    } catch (e: any) {
      setErrorMsg(e.message)
      setState('error')
    }
  }

  const handleClipboard = async (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imageItem = items.find((i) => i.type.startsWith('image/'))
    if (!imageItem) return

    e.preventDefault()
    setState('parsing')
    toast('Procesando captura de pantalla con OCR...', { icon: '🔍' })

    try {
      const blob = imageItem.getAsFile()
      if (!blob) throw new Error('No se pudo leer la imagen del portapapeles')
      const result = await extractFromImage(blob)
      setOcrMethod(result.method)
      if (result.items.length === 0) throw new Error('No se detectaron artículos en la imagen')
      setItems(result.items)
      setState('preview')
    } catch (e: any) {
      setErrorMsg(e.message)
      setState('error')
    }
  }

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) processFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  })

  const updateItem = (idx: number, field: keyof ParsedItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const saveItems = async () => {
    if (!selectedDeliveryId) { toast.error('Selecciona una descarga primero'); return }
    if (items.length === 0) { toast.error('No hay artículos para importar'); return }

    setState('saving')
    const { error } = await supabase.from('delivery_items').insert(
      items.map((item) => ({
        ...item,
        delivery_id: selectedDeliveryId,
        created_by: profile?.id,
      }))
    )
    if (error) {
      toast.error('Error al guardar: ' + error.message)
      setState('preview')
    } else {
      toast.success(`${items.length} artículos importados correctamente`)
      setState('done')
      onImported()
      setTimeout(onClose, 1500)
    }
  }

  return (
    <div className="card border-brand-500/20 animate-slide-in">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <Upload size={16} className="text-brand-400" />
          Importar Albarán
        </h3>
        <button onClick={onClose} className="btn-ghost btn-icon">
          <X size={16} />
        </button>
      </div>

      {state === 'idle' && (
        <div className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}
            id="file-dropzone"
          >
            <input {...getInputProps()} id="file-input" />
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 text-surface-500">
                <FileSpreadsheet size={32} />
                <FileText size={32} />
              </div>
              <div>
                <p className="text-sm font-medium text-surface-200">
                  {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra un archivo Excel, CSV o PDF'}
                </p>
                <p className="text-xs text-surface-500 mt-1">o haz clic para seleccionar</p>
              </div>
            </div>
          </div>

          {/* Clipboard hint */}
          <div className="flex items-center gap-3 p-4 bg-surface-700/40 rounded-xl border border-surface-700">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 flex-shrink-0">
              <Clipboard size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-200">Pega una captura de pantalla</p>
              <p className="text-xs text-surface-400">
                Copia una imagen y pulsa <kbd className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-300 text-xs font-mono">Ctrl+V</kbd> para extraer artículos con OCR automático
              </p>
            </div>
          </div>
        </div>
      )}

      {state === 'parsing' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 size={40} className="text-brand-400 animate-spin" />
          <p className="text-sm text-surface-300">Procesando archivo...</p>
          <p className="text-xs text-surface-500">Extrayendo artículos automáticamente</p>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-sm font-medium text-red-400">Error al procesar</p>
          <p className="text-xs text-surface-400 text-center max-w-sm">{errorMsg}</p>
          <button onClick={() => { setState('idle'); setErrorMsg('') }} className="btn-secondary btn-sm mt-2">
            Intentar de nuevo
          </button>
        </div>
      )}

      {state === 'done' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <CheckCircle2 size={40} className="text-green-400" />
          <p className="text-sm font-medium text-green-400">¡Importación completada!</p>
          <p className="text-xs text-surface-400">{items.length} artículos guardados</p>
        </div>
      )}

      {(state === 'preview' || state === 'saving') && (
        <div className="space-y-4">
          {ocrMethod && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <CheckCircle2 size={14} className="text-cyan-400" />
              <span className="text-xs text-cyan-300">
                Extraído con {ocrMethod === 'openai-vision' ? 'OpenAI GPT-4o Vision' : 'Tesseract OCR'}
              </span>
            </div>
          )}

          {/* Delivery selector */}
          <div className="form-group">
            <label className="form-label">Asignar a descarga *</label>
            <select
              className="form-select"
              value={selectedDeliveryId}
              onChange={(e) => setSelectedDeliveryId(e.target.value)}
              id="ingestor-delivery-select"
            >
              <option value="">Selecciona una descarga...</option>
              {deliveries.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Items preview table */}
          <div>
            <p className="text-sm font-medium text-surface-300 mb-2">
              {items.length} artículos detectados — revisa y edita antes de importar
            </p>
            <div className="table-wrapper max-h-64 overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Descripción</th>
                    <th>EAN</th>
                    <th>Cant.</th>
                    <th>Fuente</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="form-input py-1 px-2 text-xs font-mono"
                          value={item.modelo}
                          onChange={(e) => updateItem(idx, 'modelo', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input py-1 px-2 text-xs"
                          value={item.descripcion || ''}
                          onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input py-1 px-2 text-xs font-mono w-32"
                          value={item.ean || ''}
                          onChange={(e) => updateItem(idx, 'ean', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-input py-1 px-2 text-xs w-16 text-right"
                          value={item.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                          min={1}
                        />
                      </td>
                      <td>
                        <span className={`badge badge-${item.fuente === 'excel' ? 'green' : item.fuente === 'pdf' ? 'blue' : 'cyan'}`}>
                          {item.fuente}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => removeItem(idx)} className="text-surface-500 hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-surface-700">
            <button
              onClick={() => { setState('idle'); setItems([]) }}
              className="btn-ghost btn-sm"
              disabled={state === 'saving'}
            >
              Empezar de nuevo
            </button>
            <button
              onClick={saveItems}
              disabled={state === 'saving' || !selectedDeliveryId}
              className="btn-primary"
              id="btn-confirm-import"
            >
              {state === 'saving' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {state === 'saving' ? 'Importando...' : `Confirmar importación (${items.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
