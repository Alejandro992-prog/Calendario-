import { useState } from 'react'
import { X, TrendingUp, Check, AlertCircle, ArrowRight } from 'lucide-react'
import type { SupplierTarget } from '@/types'
import { calculateTargetMetrics, formatCurrency, formatPercent } from '@/lib/targetCalculations'
import toast from 'react-hot-toast'

interface UpdateConsumptionModalProps {
  target: SupplierTarget
  onClose: () => void
  onSaved: (nuevoConsumo: number) => Promise<void>
}

export default function UpdateConsumptionModal({ target, onClose, onSaved }: UpdateConsumptionModalProps) {
  const [consumo, setConsumo] = useState<number>(target.consumo_actual || 0)
  const [saving, setSaving] = useState(false)

  // Simular métricas con el nuevo valor en tiempo real
  const previewTarget = { ...target, consumo_actual: consumo }
  const metrics = calculateTargetMetrics(previewTarget)

  const handleAdd = (amount: number) => {
    setConsumo((prev) => Math.max(0, Number(prev || 0) + amount))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isNaN(consumo) || consumo < 0) {
      toast.error('Introduce un importe válido')
      return
    }
    setSaving(true)
    try {
      await onSaved(consumo)
      toast.success('Consumo actualizado correctamente')
      onClose()
    } catch (err) {
      toast.error('Error al actualizar el consumo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel max-w-lg w-full">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-700">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-brand-400" />
              Actualizar Consumo Acumulado
            </h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {target.proveedor_nombre} — Ejercicio {target.ejercicio}
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
          <div>
            <label className="form-label text-xs font-semibold uppercase tracking-wider text-surface-300">
              Compras Consumidas Acumuladas (€)
            </label>
            <div className="relative mt-1">
              <input
                type="number"
                min="0"
                step="100"
                value={consumo || ''}
                onChange={(e) => setConsumo(parseFloat(e.target.value) || 0)}
                className="form-input text-xl font-bold font-mono pl-4 pr-12 text-brand-300 w-full"
                placeholder="0"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 font-bold">
                €
              </span>
            </div>
            <p className="text-[11px] text-surface-400 mt-1">
              Consumo registrado anteriormente: <span className="text-surface-200 font-mono font-medium">{formatCurrency(target.consumo_actual)}</span>
            </p>
          </div>

          {/* Quick buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-surface-400">Sumar rápido:</span>
            <button
              type="button"
              onClick={() => handleAdd(10000)}
              className="btn-sm bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-lg text-xs py-1 px-2 font-mono"
            >
              +10.000 €
            </button>
            <button
              type="button"
              onClick={() => handleAdd(50000)}
              className="btn-sm bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-lg text-xs py-1 px-2 font-mono"
            >
              +50.000 €
            </button>
            <button
              type="button"
              onClick={() => handleAdd(100000)}
              className="btn-sm bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-lg text-xs py-1 px-2 font-mono"
            >
              +100.000 €
            </button>
          </div>

          {/* Previsualización del impacto */}
          <div className="p-3.5 rounded-xl bg-surface-800/80 border border-surface-700 space-y-2.5">
            <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
              Impacto de este consumo en el Rappel
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[11px] text-surface-400 block">Tramo Alcanzado</span>
                <span className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                  {metrics.tramoActual ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {formatPercent(metrics.porcentajeRapelActual)} de rappel
                    </>
                  ) : (
                    <span className="text-surface-400 font-normal">Sin tramo aún (0%)</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-surface-400 block">Rappel Devengado</span>
                <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
                  {formatCurrency(metrics.rapelDevengadoEuros)}
                </span>
              </div>
            </div>

            {metrics.proximoTramo && (
              <div className="pt-2 border-t border-surface-700/60 flex items-center justify-between text-xs">
                <span className="text-surface-400">
                  Próximo escalón ({formatPercent(metrics.proximoTramo.porcentaje_rapel)}):
                </span>
                <span className="text-brand-300 font-medium flex items-center gap-1">
                  faltan <strong className="font-mono">{formatCurrency(metrics.faltaParaProximoTramo)}</strong>
                </span>
              </div>
            )}
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
              {saving ? 'Guardando...' : 'Guardar Consumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
