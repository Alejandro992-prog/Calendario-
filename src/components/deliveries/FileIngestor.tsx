import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Clipboard, FileSpreadsheet, FileText, X,
  CheckCircle2, AlertCircle, Loader2, Plus, Trash2,
  Truck, Calendar, Sparkles, RefreshCw, Layers
} from 'lucide-react'
import { parseExcel } from '@/lib/parsers/excel'
import { parsePDF } from '@/lib/parsers/pdf'
import { extractFromImage } from '@/lib/parsers/ocr'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { ParsedItem, Supplier, Delivery } from '@/types'
import toast from 'react-hot-toast'

interface FileIngestorProps {
  suppliers: Supplier[]
  preselectedDeliveryId?: string
  onClose: () => void
  onImported: () => void
}

type ParseState = 'idle' | 'parsing' | 'preview' | 'saving' | 'done'

export default function FileIngestor({
  suppliers,
  preselectedDeliveryId,
  onClose,
  onImported,
}: FileIngestorProps) {
  const { profile } = useAuthStore()
  const [state, setState] = useState<ParseState>('idle')
  const [items, setItems] = useState<ParsedItem[]>([])
  
  // Delivery assignment state
  const [deliveryMode, setDeliveryMode] = useState<'existing' | 'new'>('existing')
  const [selectedDeliveryId, setSelectedDeliveryId] = useState(preselectedDeliveryId || '')
  const [deliveries, setDeliveries] = useState<{ id: string; label: string; date: string; supplier: string }[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)

  // New delivery inline form
  const [newSupplierId, setNewSupplierId] = useState(suppliers[0]?.id || '')
  const [newFecha, setNewFecha] = useState(new Date().toISOString().split('T')[0])
  const [newFranja, setNewFranja] = useState('')
  const [newReferencia, setNewReferencia] = useState('')
  const [newMatricula, setNewMatricula] = useState('')
  const [newNotas, setNewNotas] = useState('')

  // Processing & feedback state
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [ocrMethod, setOcrMethod] = useState<string>('')
  const [parsingStep, setParsingStep] = useState('Procesando archivo...')

  useEffect(() => {
    loadDeliveries()
    const handler = (e: ClipboardEvent) => handleClipboard(e)
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [])

  const loadDeliveries = async () => {
    setLoadingDeliveries(true)
    const { data, error } = await supabase
      .from('deliveries')
      .select('id, fecha_prevista, referencia, franja_horaria, supplier:suppliers(nombre)')
      .order('fecha_prevista', { ascending: false })
      .limit(40)

    if (!error && data) {
      setDeliveries(
        data.map((d: any) => ({
          id: d.id,
          date: d.fecha_prevista,
          supplier: d.supplier?.nombre || 'Sin proveedor',
          label: `${d.supplier?.nombre || 'Sin proveedor'} — ${d.fecha_prevista}${
            d.referencia ? ` (Ref: ${d.referencia})` : ''
          }${d.franja_horaria ? ` [${d.franja_horaria}]` : ''}`,
        }))
      )
      if (!selectedDeliveryId && data.length > 0 && !preselectedDeliveryId) {
        setSelectedDeliveryId(data[0].id)
      }
    }
    setLoadingDeliveries(false)
  }

  const processFile = async (file: File) => {
    setFileName(file.name)
    setErrorMsg('')
    setState('parsing')
    setParsingStep('Leyendo estructura del archivo...')

    try {
      let parsed: ParsedItem[] = []
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'xlsx' || ext === 'csv' || ext === 'xls') {
        setParsingStep('Analizando columnas de Excel...')
        parsed = await parseExcel(file)
      } else if (ext === 'pdf') {
        setParsingStep('Extrayendo texto y líneas del PDF...')
        parsed = await parsePDF(file)
      } else {
        throw new Error('Formato no compatible. Por favor sube un archivo Excel (.xlsx, .xls), CSV o PDF.')
      }

      if (!parsed || parsed.length === 0) {
        throw new Error('No se detectaron artículos. Comprueba el contenido del documento o añade las filas manualmente.')
      }

      setItems(parsed)
      setState('preview')
      toast.success(`${parsed.length} artículos detectados en ${file.name}`)
    } catch (e: any) {
      console.error('File parsing error:', e)
      setErrorMsg(e.message || 'Error al procesar el archivo')
      setState('idle')
    }
  }

  const handleClipboard = async (e: ClipboardEvent) => {
    const clipItems = Array.from(e.clipboardData?.items || [])
    const imageItem = clipItems.find((i) => i.type.startsWith('image/'))
    if (!imageItem) return

    e.preventDefault()
    setState('parsing')
    setParsingStep('Ejecutando OCR sobre la captura de pantalla...')
    toast('Procesando imagen del portapapeles...', { icon: '🔍' })

    try {
      const blob = imageItem.getAsFile()
      if (!blob) throw new Error('No se pudo obtener la imagen del portapapeles')
      const result = await extractFromImage(blob)
      setOcrMethod(result.method)
      if (result.items.length === 0) {
        throw new Error('No se detectaron artículos legibles en la imagen.')
      }
      setItems(result.items)
      setState('preview')
      toast.success(`${result.items.length} artículos extraídos con OCR`)
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de OCR')
      setState('idle')
    }
  }

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) processFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  })

  const updateItem = (idx: number, field: keyof ParsedItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        modelo: '',
        descripcion: '',
        ean: '',
        cantidad: 1,
        fuente: 'manual',
      },
    ])
    if (state === 'idle') {
      setState('preview')
    }
  }

  const saveItems = async () => {
    if (items.length === 0) {
      toast.error('No hay artículos para importar. Añade al menos un artículo.')
      return
    }

    // Validate that at least models are not empty
    const validItems = items.filter((i) => i.modelo.trim() !== '')
    if (validItems.length === 0) {
      toast.error('Todos los artículos deben tener al menos un Modelo o Referencia.')
      return
    }

    setState('saving')

    let targetDeliveryId = selectedDeliveryId

    // If creating a new delivery on the fly
    if (deliveryMode === 'new') {
      if (!newSupplierId) {
        toast.error('Por favor selecciona un proveedor para la nueva descarga.')
        setState('preview')
        return
      }
      if (!newFecha) {
        toast.error('Por favor introduce la fecha prevista.')
        setState('preview')
        return
      }

      const { data: newDel, error: delError } = await supabase
        .from('deliveries')
        .insert({
          supplier_id: newSupplierId,
          fecha_prevista: newFecha,
          franja_horaria: newFranja || null,
          referencia: newReferencia || fileName || 'Albarán importado',
          matricula: newMatricula || null,
          notas: newNotas || null,
          estado: 'Programada',
          created_by: profile?.id,
        })
        .select()
        .single()

      if (delError || !newDel) {
        toast.error('Error al crear la nueva descarga: ' + (delError?.message || 'Error desconocido'))
        setState('preview')
        return
      }

      targetDeliveryId = newDel.id
    }

    if (!targetDeliveryId) {
      toast.error('Selecciona una descarga de destino para los artículos.')
      setState('preview')
      return
    }

    // Insert items linked to targetDeliveryId
    const { error: itemsError } = await supabase.from('delivery_items').insert(
      validItems.map((item) => ({
        modelo: item.modelo.trim().toUpperCase(),
        descripcion: item.descripcion?.trim() || null,
        ean: item.ean?.trim() || null,
        cantidad: Number(item.cantidad) || 1,
        fuente: item.fuente,
        raw_data: item.raw_data || null,
        delivery_id: targetDeliveryId,
        created_by: profile?.id,
      }))
    )

    if (itemsError) {
      toast.error('Error al guardar los artículos: ' + itemsError.message)
      setState('preview')
    } else {
      toast.success(`¡${validItems.length} artículos importados con éxito!`)
      setState('done')
      onImported()
      setTimeout(onClose, 1200)
    }
  }

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0)

  return (
    <div className="card border-brand-500/30 bg-surface-800/95 backdrop-blur-md shadow-2xl animate-slide-in p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-700 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-inner">
            <Layers size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Importar Albarán y Artículos
            </h2>
            <p className="text-xs text-surface-400">
              Sube un archivo PDF o Excel, o pega una captura para asignar los productos a una descarga
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn-ghost btn-icon text-surface-400 hover:text-white"
          title="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {/* SECTION 1: ASIGNAR A DESCARGA (ALWAYS VISIBLE & PROMINENT) */}
      <div className="p-4 rounded-xl bg-surface-700/40 border border-surface-600/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-surface-900 text-xs font-black">
              1
            </span>
            <span className="text-sm font-semibold text-surface-100">
              Descarga de Destino
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex bg-surface-800 p-1 rounded-lg border border-surface-600 text-xs font-medium self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDeliveryMode('existing')}
              className={`px-3 py-1 rounded-md transition-all ${
                deliveryMode === 'existing'
                  ? 'bg-brand-500 text-surface-900 font-bold shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Descarga existente
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode('new')}
              className={`px-3 py-1 rounded-md transition-all flex items-center gap-1 ${
                deliveryMode === 'new'
                  ? 'bg-brand-500 text-surface-900 font-bold shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Plus size={12} /> Nueva descarga
            </button>
          </div>
        </div>

        {/* Option A: Existing Delivery Dropdown */}
        {deliveryMode === 'existing' ? (
          <div className="form-group mb-0">
            <label className="form-label text-xs text-surface-300">
              Selecciona la descarga a la que asignar los artículos *
            </label>
            <div className="flex items-center gap-2">
              <select
                className="form-select flex-1 font-medium text-sm"
                value={selectedDeliveryId}
                onChange={(e) => setSelectedDeliveryId(e.target.value)}
                disabled={state === 'saving'}
                id="ingestor-delivery-select"
              >
                <option value="">-- Elige una descarga del calendario --</option>
                {deliveries.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadDeliveries}
                className="btn-secondary btn-icon text-surface-400 hover:text-white"
                title="Refrescar lista de descargas"
              >
                <RefreshCw size={14} className={loadingDeliveries ? 'animate-spin' : ''} />
              </button>
            </div>
            {deliveries.length === 0 && !loadingDeliveries && (
              <p className="text-xs text-amber-400/90 mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> No hay descargas programadas. Puedes usar la pestaña "Nueva descarga" arriba para crear una.
              </p>
            )}
          </div>
        ) : (
          /* Option B: Inline New Delivery Form */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Proveedor *</label>
              <select
                className="form-select text-xs py-1.5"
                value={newSupplierId}
                onChange={(e) => setNewSupplierId(e.target.value)}
                id="new-del-supplier"
              >
                <option value="">Selecciona proveedor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Fecha prevista *</label>
              <input
                type="date"
                className="form-input text-xs py-1.5"
                value={newFecha}
                onChange={(e) => setNewFecha(e.target.value)}
                id="new-del-fecha"
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Nº Albarán / Referencia</label>
              <input
                type="text"
                className="form-input text-xs py-1.5"
                placeholder="Ej: ALB-2024-99"
                value={newReferencia}
                onChange={(e) => setNewReferencia(e.target.value)}
                id="new-del-ref"
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Franja Horaria (Opcional)</label>
              <input
                type="text"
                className="form-input text-xs py-1.5"
                placeholder="Ej: 08:00 - 10:00"
                value={newFranja}
                onChange={(e) => setNewFranja(e.target.value)}
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Matrícula Camión (Opcional)</label>
              <input
                type="text"
                className="form-input text-xs py-1.5"
                placeholder="0000 XXX"
                value={newMatricula}
                onChange={(e) => setNewMatricula(e.target.value)}
              />
            </div>
            <div className="form-group mb-0">
              <label className="form-label text-xs text-surface-300">Observaciones</label>
              <input
                type="text"
                className="form-input text-xs py-1.5"
                placeholder="Notas de descarga..."
                value={newNotas}
                onChange={(e) => setNewNotas(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: FILE DROPZONE & CLIPBOARD (WHEN IDLE OR PREVIEW) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-surface-900 text-xs font-black">
              2
            </span>
            <span className="text-sm font-semibold text-surface-100">
              Cargar Albarán o Documento
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addItemRow}
              className="btn-ghost btn-sm text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <Plus size={13} /> Añadir fila manual
            </button>
          </div>
        </div>

        {/* Loading / Parsing state indicator */}
        {state === 'parsing' && (
          <div className="flex flex-col items-center justify-center p-8 bg-surface-900/60 rounded-xl border border-brand-500/30 text-center space-y-3 animate-pulse">
            <Loader2 size={36} className="text-brand-400 animate-spin" />
            <div>
              <p className="text-sm font-semibold text-white">{parsingStep}</p>
              <p className="text-xs text-surface-400 mt-0.5">Analizando artículos, modelos y cantidades...</p>
            </div>
          </div>
        )}

        {/* Dropzone & Quick Paste when not actively parsing */}
        {state !== 'parsing' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Dropzone Area (Spans 2 cols on desktop) */}
            <div
              {...getRootProps()}
              className={`md:col-span-2 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                isDragActive
                  ? 'border-brand-400 bg-brand-500/10 scale-[0.99]'
                  : 'border-surface-600 hover:border-brand-500/50 bg-surface-900/40 hover:bg-surface-700/30'
              }`}
              id="file-dropzone"
            >
              <input {...getInputProps()} id="file-input" />
              <div className="flex items-center gap-3 text-brand-400">
                <FileSpreadsheet size={28} className="text-emerald-400" />
                <FileText size={28} className="text-blue-400" />
                <Upload size={24} className="text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-surface-200">
                  {isDragActive ? '¡Suelta el albarán aquí!' : 'Arrastra o haz clic para subir Excel (.xlsx, .xls, .csv) o PDF'}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  Detección automática de modelos, descripciones, códigos EAN y unidades
                </p>
              </div>
            </div>

            {/* Clipboard OCR Card */}
            <div className="border border-surface-700 rounded-xl p-4 bg-surface-900/40 flex flex-col justify-center gap-2">
              <div className="flex items-center gap-2 text-cyan-400">
                <Clipboard size={18} />
                <span className="text-xs font-bold uppercase tracking-wider">Pegar Captura</span>
              </div>
              <p className="text-xs text-surface-300">
                Pulsa <kbd className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-200 text-xs font-mono font-bold">Ctrl + V</kbd> para extraer los datos de una captura de pantalla con OCR automático.
              </p>
            </div>
          </div>
        )}

        {/* Error notification banner if any */}
        {errorMsg && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-red-300">Error al procesar el archivo:</p>
              <p className="text-red-200 mt-0.5">{errorMsg}</p>
              <p className="text-surface-400 mt-1">
                Puedes pulsar en <strong>"+ Añadir fila manual"</strong> para introducir los productos directamente o probar con otro archivo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-surface-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* SECTION 3: ITEMS PREVIEW & TABLE (WHEN ITEMS DETECTED OR ADDED) */}
      {items.length > 0 && (
        <div className="space-y-3 border-t border-surface-700 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-surface-900 text-xs font-black">
                3
              </span>
              <span className="text-sm font-semibold text-surface-100">
                Artículos Detectados ({items.length})
              </span>
              <span className="text-xs text-surface-400 font-mono">
                — {totalQuantity} unidades en total
              </span>
            </div>

            {ocrMethod && (
              <span className="badge bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs flex items-center gap-1">
                <Sparkles size={11} /> Extraído con {ocrMethod}
              </span>
            )}
          </div>

          {/* Editable Table */}
          <div className="table-wrapper max-h-72 overflow-y-auto border border-surface-700 rounded-xl">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-40 sm:w-48">Modelo / Ref *</th>
                  <th>Descripción</th>
                  <th className="w-32 hidden md:table-cell">Código EAN</th>
                  <th className="w-20 text-center">Cant.</th>
                  <th className="w-16 text-center">Fuente</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-surface-700/20">
                    <td className="w-40 sm:w-48">
                      <input
                        className="form-input py-1 px-2 text-xs font-mono font-bold text-brand-300 w-full"
                        value={item.modelo}
                        placeholder="Ej: 3HB4331X0"
                        onChange={(e) => updateItem(idx, 'modelo', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="form-input py-1 px-2.5 text-xs w-full"
                        value={item.descripcion || ''}
                        placeholder="Descripción del electrodoméstico o producto..."
                        onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                      />
                    </td>
                    <td className="w-32 hidden md:table-cell">
                      <input
                        className="form-input py-1 px-2 text-xs font-mono w-full"
                        value={item.ean || ''}
                        placeholder="8412345678901"
                        onChange={(e) => updateItem(idx, 'ean', e.target.value)}
                      />
                    </td>
                    <td className="w-20 text-center">
                      <div className="flex justify-center">
                        <input
                          type="number"
                          className="form-input py-1 px-2 text-xs font-bold text-center w-16"
                          value={item.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                          min={1}
                        />
                      </div>
                    </td>
                    <td className="text-center">
                      <span
                        className={`badge text-[10px] uppercase font-bold ${
                          item.fuente === 'excel'
                            ? 'badge-green'
                            : item.fuente === 'pdf'
                            ? 'badge-blue'
                            : item.fuente === 'ocr'
                            ? 'badge-cyan'
                            : 'badge-gray'
                        }`}
                      >
                        {item.fuente}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-surface-500 hover:text-red-400 p-1 transition-colors"
                        title="Eliminar artículo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-surface-700">
            <button
              type="button"
              onClick={addItemRow}
              className="btn-secondary btn-sm text-xs flex items-center gap-1.5"
            >
              <Plus size={13} /> Añadir otra fila
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setItems([])
                  setFileName('')
                  setErrorMsg('')
                  setState('idle')
                }}
                className="btn-ghost btn-sm text-surface-400 hover:text-surface-200"
                disabled={state === 'saving'}
              >
                Limpiar lista
              </button>

              <button
                type="button"
                onClick={saveItems}
                disabled={
                  state === 'saving' ||
                  items.length === 0 ||
                  (deliveryMode === 'existing' && !selectedDeliveryId) ||
                  (deliveryMode === 'new' && !newSupplierId)
                }
                className="btn-primary flex items-center gap-2 shadow-lg shadow-brand-500/20 px-5"
                id="btn-confirm-import"
              >
                {state === 'saving' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>
                  {state === 'saving'
                    ? 'Importando artículos...'
                    : `Confirmar e Importar (${items.length} productos)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done State Feedback */}
      {state === 'done' && (
        <div className="flex flex-col items-center justify-center p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center space-y-2">
          <CheckCircle2 size={36} className="text-green-400" />
          <p className="text-base font-bold text-green-300">¡Importación completada con éxito!</p>
          <p className="text-xs text-surface-300">
            Los artículos se han guardado y vinculado correctamente a la descarga.
          </p>
        </div>
      )}
    </div>
  )
}
