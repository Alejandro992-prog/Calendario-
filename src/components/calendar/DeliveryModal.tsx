import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Trash2, Truck, Package, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Delivery, DeliveryItem, Supplier } from '@/types'
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
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_id: delivery?.supplier_id || '',
      referencia: delivery?.referencia || '',
      fecha_prevista: delivery?.fecha_prevista || defaultDate || '',
      franja_horaria: delivery?.franja_horaria || '',
      estado: delivery?.estado || 'Programada',
      matricula: delivery?.matricula || '',
      notas: delivery?.notas || '',
    },
  })

  useEffect(() => {
    if (delivery?.id) loadItems(delivery.id)
  }, [delivery])

  const loadItems = async (deliveryId: string) => {
    const { data } = await supabase
      .from('delivery_items')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true })
    setItems((data || []) as DeliveryItem[])
  }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      if (isNew) {
        const { error } = await supabase.from('deliveries').insert({
          ...data,
          created_by: profile?.id,
        })
        if (error) throw error
        toast.success('Descarga creada correctamente')
      } else {
        const { error } = await supabase
          .from('deliveries')
          .update(data)
          .eq('id', delivery.id)
        if (error) throw error
        toast.success('Descarga actualizada')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!delivery?.id) return
    if (!confirm('¿Eliminar esta descarga y todos sus artículos?')) return
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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-2xl w-full">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Truck size={18} className="text-brand-400" />
            </div>
            <div>
              <h2 className="modal-title">
                {isNew ? 'Nueva Descarga' : 'Detalle de Descarga'}
              </h2>
              {delivery?.fecha_prevista && (
                <p className="text-xs text-surface-400">
                  {format(new Date(delivery.fecha_prevista + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: es })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon">
            <X size={18} />
          </button>
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

            {/* Items list (only for existing deliveries) */}
            {!isNew && items.length > 0 && (
              <div>
                <p className="text-sm font-medium text-surface-300 mb-2 flex items-center gap-2">
                  <Package size={14} className="text-brand-400" />
                  Artículos ({items.length})
                </p>
                <div className="border border-surface-700 rounded-xl overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th>Descripción</th>
                        <th>EAN</th>
                        <th className="text-right">Cant.</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-surface-700/20">
                          <td className="font-mono text-brand-400">{item.modelo}</td>
                          <td className="text-surface-300 max-w-[180px] truncate">{item.descripcion || '—'}</td>
                          <td className="font-mono text-xs text-surface-400">{item.ean || '—'}</td>
                          <td className="text-right font-semibold">{item.cantidad}</td>
                          {canEdit && (
                            <td>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="text-surface-500 hover:text-red-400 transition-colors"
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
              </div>
            )}
          </div>

          {/* Footer */}
          {canEdit && (
            <div className="modal-footer">
              {!isNew && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn-danger mr-auto"
                  id="del-delete-btn"
                >
                  <Trash2 size={14} />
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              )}
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
          )}
        </form>
      </div>
    </div>
  )
}
