import { useState, useEffect } from 'react'
import { X, Target, Plus, Trash2, Check, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { SupplierTarget, RappelTier, Supplier } from '@/types'
import { formatCurrency, formatPercent } from '@/lib/targetCalculations'
import toast from 'react-hot-toast'

interface TargetModalProps {
  target?: SupplierTarget | null
  onClose: () => void
  onSaved: (savedTarget: Partial<SupplierTarget>) => Promise<void>
}

export default function TargetModal({ target, onClose, onSaved }: TargetModalProps) {
  const isEditing = Boolean(target?.id)
  const currentYear = new Date().getFullYear()

  const [proveedorNombre, setProveedorNombre] = useState(target?.proveedor_nombre || '')
  const [ejercicio, setEjercicio] = useState<number>(target?.ejercicio || currentYear)
  const [consumoActual, setConsumoActual] = useState<number>(target?.consumo_actual || 0)
  const [notas, setNotas] = useState(target?.notas || '')
  const [saving, setSaving] = useState(false)

  // Tramos iniciales
  const [tramos, setTramos] = useState<RappelTier[]>(
    target?.tramos && target.tramos.length > 0
      ? [...target.tramos].sort((a, b) => a.desde_euros - b.desde_euros)
      : [
          { desde_euros: 500000, porcentaje_rapel: 2.0 },
          { desde_euros: 1000000, porcentaje_rapel: 3.0 },
        ]
  )

  // Lista de proveedores registrados en la app para autocompletar
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('*')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (data) setSuppliersList(data as Supplier[])
      })
  }, [])

  const handleAddTier = () => {
    const lastTier = tramos[tramos.length - 1]
    const nextDesde = lastTier ? lastTier.desde_euros + 500000 : 500000
    const nextPercent = lastTier ? Number((lastTier.porcentaje_rapel + 1.0).toFixed(1)) : 2.0
    setTramos([...tramos, { desde_euros: nextDesde, porcentaje_rapel: nextPercent }])
  }

  const handleRemoveTier = (index: number) => {
    if (tramos.length <= 1) {
      toast.error('Debe haber al menos un tramo de rappel')
      return
    }
    setTramos(tramos.filter((_, i) => i !== index))
  }

  const handleTierChange = (index: number, field: keyof RappelTier, value: number) => {
    const updated = [...tramos]
    updated[index] = { ...updated[index], [field]: value }
    setTramos(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proveedorNombre.trim()) {
      toast.error('Indica el nombre del proveedor o marca')
      return
    }
    if (tramos.length === 0) {
      toast.error('Añade al menos un tramo de objetivo')
      return
    }

    // Validar que los tramos sean coherentes
    for (const t of tramos) {
      if (isNaN(t.desde_euros) || t.desde_euros <= 0) {
        toast.error('El importe de cada tramo debe ser mayor a 0 €')
        return
      }
      if (isNaN(t.porcentaje_rapel) || t.porcentaje_rapel <= 0) {
        toast.error('El porcentaje de rappel debe ser mayor a 0%')
        return
      }
    }

    setSaving(true)
    try {
      await onSaved({
        id: target?.id,
        proveedor_nombre: proveedorNombre.trim(),
        ejercicio: Number(ejercicio) || currentYear,
        consumo_actual: Number(consumoActual) || 0,
        tramos: [...tramos].sort((a, b) => a.desde_euros - b.desde_euros),
        notas: notas.trim() || null,
      })
      toast.success(isEditing ? 'Acuerdo actualizado' : 'Nuevo acuerdo guardado')
      onClose()
    } catch (err) {
      toast.error('Error al guardar el acuerdo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-700">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Target size={18} className="text-brand-400" />
              {isEditing ? 'Editar Acuerdo de Objetivos y Rappels' : 'Nuevo Acuerdo de Objetivos y Rappels'}
            </h2>
            <p className="text-xs text-surface-400 mt-0.5">
              Configura los umbrales de compra y los porcentajes de rappel pactados a primeros de año
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-700/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Proveedor & Año */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="form-label text-xs font-semibold text-surface-300">
                Proveedor / Marca <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                list="suppliers-suggestions"
                required
                value={proveedorNombre}
                onChange={(e) => setProveedorNombre(e.target.value)}
                placeholder="Ej. Balay, Bosch, Daitsu, Teka..."
                className="form-input text-sm w-full mt-1"
              />
              <datalist id="suppliers-suggestions">
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.nombre} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="form-label text-xs font-semibold text-surface-300">
                Año / Ejercicio <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="2020"
                max="2035"
                required
                value={ejercicio}
                onChange={(e) => setEjercicio(parseInt(e.target.value) || currentYear)}
                className="form-input text-sm w-full mt-1 font-mono"
              />
            </div>
          </div>

          {/* Consumo inicial acumulado */}
          <div>
            <label className="form-label text-xs font-semibold text-surface-300">
              Compras Consumidas Actuales (€)
            </label>
            <div className="relative mt-1">
              <input
                type="number"
                min="0"
                step="100"
                value={consumoActual || ''}
                onChange={(e) => setConsumoActual(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="form-input text-sm font-mono pl-3 pr-8 w-full"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 font-bold text-xs">
                €
              </span>
            </div>
            <p className="text-[11px] text-surface-500 mt-1">
              Podrás actualizar este dato en cualquier momento con el botón rápido de consumo.
            </p>
          </div>

          {/* Tramos de Rappel escalonados */}
          <div className="pt-2 border-t border-surface-700">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="form-label text-xs font-bold text-white uppercase tracking-wider block">
                  Tramos y Escala de Rappel
                </label>
                <span className="text-[11px] text-surface-400">
                  Porcentajes de bonificación según el volumen anual alcanzado
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddTier}
                className="btn-sm bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 border border-brand-500/30 rounded-lg text-xs py-1 px-2.5 flex items-center gap-1 transition-all"
              >
                <Plus size={13} />
                Añadir Tramo
              </button>
            </div>

            <div className="space-y-2">
              {tramos.map((tier, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-800/60 border border-surface-700/80"
                >
                  <span className="text-xs font-bold text-surface-400 w-16 flex-shrink-0">
                    Tramo {idx + 1}:
                  </span>

                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-xs text-surface-400 whitespace-nowrap">Desde:</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        step="1000"
                        value={tier.desde_euros || ''}
                        onChange={(e) =>
                          handleTierChange(idx, 'desde_euros', parseFloat(e.target.value) || 0)
                        }
                        className="form-input text-xs font-mono pl-2 pr-6 py-1 w-full"
                        placeholder="Ej. 1000000"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 text-xs">
                        €
                      </span>
                    </div>
                  </div>

                  <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
                    <span className="text-xs text-surface-400">Rappel:</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0.1"
                        max="50"
                        step="0.1"
                        value={tier.porcentaje_rapel || ''}
                        onChange={(e) =>
                          handleTierChange(idx, 'porcentaje_rapel', parseFloat(e.target.value) || 0)
                        }
                        className="form-input text-xs font-mono font-bold text-emerald-400 pl-2 pr-6 py-1 w-full"
                        placeholder="3.0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 text-xs">
                        %
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveTier(idx)}
                    className="p-1 text-surface-500 hover:text-red-400 rounded-lg transition-colors"
                    title="Eliminar este tramo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notas y Condiciones */}
          <div className="pt-2 border-t border-surface-700">
            <label className="form-label text-xs font-semibold text-surface-300">
              Condiciones Particulares y Notas del Acuerdo
            </label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Pago mediante abono en factura en enero del año siguiente. Excluye artículos en promoción neta..."
              className="form-textarea text-xs w-full mt-1"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-surface-700">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <Check size={16} />
              {saving ? 'Guardando...' : 'Guardar Acuerdo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
