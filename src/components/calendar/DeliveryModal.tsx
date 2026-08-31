import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Trash2, Truck, Package, Plus, CheckCircle2, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Delivery, DeliveryItem, Supplier } from '@/types'
import FileIngestor from '@/components/deliveries/FileIngestor'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const schema = z.object({
  supplier_id: z.string().min(1, 'Selecciona un proveedor'),
  referencia: z.string().optional(),
  fecha_prevista: z.string().min(1, 'Selecciona una fecha'),
  franja_horaria: z.string().optional(),
  estado: z.enum(['Programada', 'En muelle', 'Descargada', 'Cancelada']),
  matricula: z.string().optional(),
  notas: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface DeliveryModalProps {
  delivery: Delivery | null
  defaultDate?: string
  suppliers: Supplier[]
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

const statusBadge: Record<string, string> = {
  Programada: 'status-Programada',
  'En muelle': 'status-En muelle',
  Descargada: 'status-Descargada',
  Cancelada: 'status-Cancelada',
}

export default function DeliveryModal({
  delivery, defaultDate, suppliers, canEdit, onClose, onSaved,
}: DeliveryModalProps) {
  const { profile } = useAuthStore()
  const isNew = !delivery
  const [items, setItems] = useState<DeliveryItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newItemModel, setNewItemModel] = useState('')
  const [newItemQty, setNewItemQty] = useState(1)
  const [addingItem, setAddingItem] = useState(false)
  const [showIngestorInModal, setShowIngestorInModal] = useState(false)
  const isBackdropClick = useRef(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_id: delivery?.supplier_id || '',
      referencia: delivery?.referencia || '',
      fecha_prevista: delivery?.fecha_prevista || defaultDate || new Date().toISOString().split('T')[0],
      franja_horaria: delivery?.franja_horaria || '',
      estado: delivery?.estado || 'Programada',
      matricula: delivery?.matricula || '',
      notas: delivery?.notas || '',
    },
  })

  useEffect(() => {
    if (delivery?.id) {
      loadItems(delivery.id)
    }
  }, [delivery?.id])

  const loadItems = async (deliveryId: string) => {
    setLoadingItems(true)
    const { data } = await supabase
      .from('delivery_items')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true })
    setItems((data || []) as DeliveryItem[])
    setLoadingItems(false)
  }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    if (isNew) {
      const { error } = await supabase.from('deliveries').insert({
        ...data,
        created_by: profile?.id,
      })
      if (error) toast.error(error.message)
      else { toast.success('Descarga programada'); onSaved() }
    } else {
      const { error } = await supabase
        .from('deliveries')
        .update(data)
        .eq('id', delivery.id)
      if (error) toast.error(error.message)
      else { toast.success('Descarga actualizada'); onSaved() }
    }
    setSaving(false)
  }

  const handleAddItem = async () => {
    if (!newItemModel.trim() || !delivery?.id) return
    setAddingItem(true)
    const { data, error } = await supabase.from('delivery_items').insert({
      delivery_id: delivery.id,
      modelo: newItemModel.trim(),
      cantidad: newItemQty,
      fuente: 'manual',
      created_by: profile?.id,
    }).select().single()

    if (error) toast.error(error.message)
    else {
      setItems((prev) => [...prev, data as DeliveryItem])
      setNewItemModel('')
      setNewItemQty(1)
      toast.success('Artículo añadido')
    }
    setAddingItem(false)
  }

  const handleMarkCompleted = async (newStatus: 'Descargada' | 'Programada' = 'Descargada') => {
    if (!delivery?.id) return
    setSaving(true)
    const { error } = await supabase
      .from('deliveries')
      .update({
        estado: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)

    if (error) {
      toast.error(`Error al actualizar estado: ${error.message}`)
    } else {
      toast.success(
        newStatus === 'Descargada'
          ? '¡Descarga marcada como Completada / Descargada!'
          : 'Descarga reactivada como Programada'
      )
      window.dispatchEvent(new CustomEvent('garde_notification_update'))
      onSaved()
      onClose()
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!delivery?.id || !window.confirm('¿Seguro que deseas eliminar esta descarga?')) return
    setDeleting(true)
    const { error } = await supabase.from('deliveries').delete().eq('id', delivery.id)
    if (error) toast.error(error.message)
    else { toast.success('Descarga eliminada'); onSaved() }
    setDeleting(false)
  }

  const handleDeleteItem = async (itemId: string) => {
    await supabase.from('delivery_items').delete().eq('id', itemId)
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        isBackdropClick.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropClick.current) {
          onClose()
        }
        isBackdropClick.current = false
      }}
    >
      <div className="modal-panel max-w-2xl w-full">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
              <Truck size={18} className="text-brand-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="modal-title truncate">
                  {isNew ? 'Nueva Descarga' : 'Detalle de Descarga'}
                </h2>
                {!isNew && delivery && (
                  <span
                    className={`badge text-[11px] ${
                      delivery.estado === 'Descargada'
                        ? 'badge-green'
                        : delivery.estado === 'En muelle'
                        ? 'badge-yellow'
                        : 'badge-blue'
                    }`}
                  >
                    {delivery.estado}
                  </span>
                )}
              </div>
              {delivery?.fecha_prevista && (
                <p className="text-xs text-surface-400 capitalize truncate">
                  {format(new Date(delivery.fecha_prevista + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: es })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!isNew && delivery && canEdit && (
              delivery.estado !== 'Descargada' ? (
                <button
                  type="button"
                  onClick={() => handleMarkCompleted('Descargada')}
                  disabled={saving}
                  className="btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/30 transition-all cursor-pointer"
                  title="Marcar esta descarga como completada / realizada"
                  id="btn-mark-completed-header"
                >
                  <CheckCircle2 size={14} />
                  <span className="hidden sm:inline">Marcar Completada</span>
                  <span className="sm:hidden">Completar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMarkCompleted('Programada')}
                  disabled={saving}
                  className="btn-ghost btn-sm text-xs text-surface-400 hover:text-white flex items-center gap-1"
                  title="Volver a poner en estado Programada"
                >
                  <RotateCcw size={13} />
                  <span>Reabrir</span>
                </button>
              )
            )}
            <button onClick={onClose} className="btn-ghost btn-icon" title="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Proveedor */}
              <div className="form-group col-span-2">
                <label className="form-label">Proveedor *</label>
                <select
                  {...register('supplier_id')}
                  className="form-select"
                  disabled={!canEdit}
                  id="del-supplier"
                >
                  <option value="">Selecciona proveedor...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
                {errors.supplier_id && <p className="form-error">{errors.supplier_id.message}</p>}
              </div>

              {/* Fecha */}
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input
                  type="date"
                  {...register('fecha_prevista')}
                  className="form-input"
                  disabled={!canEdit}
                  id="del-fecha"
                />
                {errors.fecha_prevista && <p className="form-error">{errors.fecha_prevista.message}</p>}
              </div>

              {/* Franja horaria */}
              <div className="form-group">
                <label className="form-label">Franja horaria</label>
                <input
                  type="text"
                  {...register('franja_horaria')}
                  className="form-input"
                  placeholder="Ej: 08:00-10:00"
                  disabled={!canEdit}
                  id="del-franja"
                />
              </div>

              {/* Estado */}
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  {...register('estado')}
                  className="form-select"
                  disabled={!canEdit}
                  id="del-estado"
                >
                  <option>Programada</option>
                  <option>En muelle</option>
                  <option>Descargada</option>
                  <option>Cancelada</option>
                </select>
              </div>

              {/* Matrícula */}
              <div className="form-group">
                <label className="form-label">Matrícula</label>
                <input
                  type="text"
                  {...register('matricula')}
                  className="form-input"
                  placeholder="0000 XXX"
                  disabled={!canEdit}
                  id="del-matricula"
                />
              </div>

              {/* Referencia */}
              <div className="form-group col-span-2">
                <label className="form-label">Nº Albarán / Referencia</label>
                <input
                  type="text"
                  {...register('referencia')}
                  className="form-input"
                  placeholder="Ej: ALB-2024-001"
                  disabled={!canEdit}
                  id="del-referencia"
                />
              </div>

              {/* Notas */}
              <div className="form-group col-span-2">
                <label className="form-label">Notas</label>
                <textarea
                  {...register('notas')}
                  rows={2}
                  className="form-textarea"
                  placeholder="Observaciones adicionales..."
                  disabled={!canEdit}
                  id="del-notas"
                />
              </div>
            </div>

            {/* Items list & controls (only for existing deliveries) */}
            {!isNew && (
              <div className="space-y-3 pt-2 border-t border-surface-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-surface-300 flex items-center gap-2">
                    <Package size={15} className="text-brand-400" />
                    Artículos ({items.length})
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowIngestorInModal(true)}
                      className="btn-secondary btn-sm text-xs flex items-center gap-1.5"
                    >
                      <Plus size={13} /> Importar Albarán (PDF/Excel)
                    </button>
                  )}
                </div>

                {/* Quick Add Row */}
                {canEdit && (
                  <div className="flex items-center gap-2 bg-surface-700/30 p-2 rounded-xl border border-surface-700">
                    <input
                      type="text"
                      className="form-input py-1 px-2.5 text-xs flex-1 font-mono"
                      placeholder="Modelo / Referencia..."
                      value={newItemModel}
                      onChange={(e) => setNewItemModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddItem()
                        }
                      }}
                    />
                    <input
                      type="number"
                      className="form-input py-1 px-2 text-xs w-16 text-right font-bold"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                      min={1}
                    />
                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={addingItem || !newItemModel.trim()}
                      className="btn-primary btn-sm text-xs py-1 px-3"
                    >
                      {addingItem ? 'Añadiendo...' : 'Añadir'}
                    </button>
                  </div>
                )}

                {/* Table */}
                {items.length > 0 ? (
                  <div className="border border-surface-700 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Modelo</th>
                          <th>Descripción</th>
                          <th>EAN</th>
                          <th className="text-right">Cant.</th>
                          {canEdit && <th className="w-8"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="hover:bg-surface-700/20">
                            <td className="font-mono font-bold text-brand-400">{item.modelo}</td>
                            <td className="text-surface-300 max-w-[180px] truncate">{item.descripcion || '—'}</td>
                            <td className="font-mono text-xs text-surface-400">{item.ean || '—'}</td>
                            <td className="text-right font-semibold">{item.cantidad}</td>
                            {canEdit && (
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="text-surface-500 hover:text-red-400 transition-colors p-1"
                                  title="Eliminar artículo"
                                >
                                  <X size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-surface-500 italic text-center py-3 bg-surface-800/50 rounded-xl border border-surface-700/50">
                    No hay artículos registrados para esta descarga todavía.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {canEdit && (
            <div className="modal-footer flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!isNew && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="btn-danger"
                    id="del-delete-btn"
                  >
                    <Trash2 size={14} />
                    {deleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                )}
                {!isNew && delivery && delivery.estado !== 'Descargada' && (
                  <button
                    type="button"
                    onClick={() => handleMarkCompleted('Descargada')}
                    disabled={saving}
                    className="btn-sm flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/30 transition-all cursor-pointer"
                    id="btn-mark-completed-footer"
                  >
                    <CheckCircle2 size={15} />
                    <span>✓ Completar Descarga</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary" id="del-save-btn">
                  {saving && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? 'Guardando...' : isNew ? 'Crear Descarga' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Ingestor sub-modal for this delivery */}
        {showIngestorInModal && delivery?.id && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[70] flex items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-2xl w-full">
              <FileIngestor
                suppliers={suppliers}
                preselectedDeliveryId={delivery.id}
                onClose={() => setShowIngestorInModal(false)}
                onImported={() => {
                  setShowIngestorInModal(false)
                  loadItems(delivery.id)
                  onSaved()
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
