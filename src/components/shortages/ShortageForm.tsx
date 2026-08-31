import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Package, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { useState, useRef } from 'react'

const CATEGORIAS = ['Frío', 'Lavado', 'Cocción', 'Lavavajillas', 'Imagen', 'Pequeño Electrodoméstico', 'Climatización', 'Otro']

const schema = z.object({
  categoria: z.string().min(1, 'Selecciona una categoría'),
  especificacion: z.string().optional(),
  modelo: z.string().optional(),
  urgencia: z.enum(['Baja', 'Media', 'Alta', 'Crítica']),
  notas: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface ShortageFormProps {
  onClose: () => void
  onSaved: () => void
}

export default function ShortageForm({ onClose, onSaved }: ShortageFormProps) {
  const { profile } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const isBackdropClick = useRef(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { urgencia: 'Media' },
  })

  const currentUrgency = watch('urgencia')

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    const { error } = await supabase.from('stock_shortages').insert({
      ...data,
      reportado_por: profile?.id,
      estado: 'Pendiente',
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Falta registrada correctamente')
      onSaved()
    }
    setSaving(false)
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
      <div className="modal-panel max-w-lg w-full">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Package size={18} className="text-red-400" />
            </div>
            <h2 className="modal-title">Reportar Falta</h2>
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-4">
            {/* Categoría */}
            <div className="form-group">
              <label className="form-label">Categoría *</label>
              <select {...register('categoria')} className="form-select" id="shortage-categoria">
                <option value="">Selecciona categoría...</option>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
              {errors.categoria && <p className="form-error">{errors.categoria.message}</p>}
            </div>

            {/* Especificación */}
            <div className="form-group">
              <label className="form-label">
                Especificación / Medida
                <span className="text-surface-500 font-normal"> (opcional)</span>
              </label>
              <input
                type="text"
                {...register('especificacion')}
                className="form-input"
                placeholder="Ej: Combi Inox 2m, Integrable 60cm..."
                id="shortage-especificacion"
              />
            </div>

            {/* Modelo */}
            <div className="form-group">
              <label className="form-label">
                Modelo concreto
                <span className="text-surface-500 font-normal"> (si se conoce)</span>
              </label>
              <input
                type="text"
                {...register('modelo')}
                className="form-input font-mono"
                placeholder="Ej: KAD93AIEP, WDB4140S0ES..."
                id="shortage-modelo"
              />
            </div>

            {/* Urgencia */}
            <div className="form-group">
              <label className="form-label flex items-center justify-between">
                <span>Nivel de Urgencia *</span>
                <span className="text-xs text-surface-400 font-normal">
                  Seleccionado: <strong className="text-surface-200">{currentUrgency}</strong>
                </span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(['Baja', 'Media', 'Alta', 'Crítica'] as const).map((u) => {
                  const isSelected = currentUrgency === u

                  const selectedStyles: Record<string, string> = {
                    Baja: 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/60 shadow-lg shadow-emerald-950/40',
                    Media: 'border-amber-500 bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/60 shadow-lg shadow-amber-950/40',
                    Alta: 'border-orange-500 bg-orange-500/20 text-orange-300 ring-2 ring-orange-500/60 shadow-lg shadow-orange-950/40',
                    Crítica: 'border-red-500 bg-red-600/25 text-red-200 ring-2 ring-red-500/70 shadow-lg shadow-red-950/50',
                  }

                  const unselectedStyles: Record<string, string> = {
                    Baja: 'border-surface-700 bg-surface-800/40 text-surface-400 hover:border-emerald-500/40 hover:text-surface-200 hover:bg-surface-800',
                    Media: 'border-surface-700 bg-surface-800/40 text-surface-400 hover:border-amber-500/40 hover:text-surface-200 hover:bg-surface-800',
                    Alta: 'border-surface-700 bg-surface-800/40 text-surface-400 hover:border-orange-500/40 hover:text-surface-200 hover:bg-surface-800',
                    Crítica: 'border-surface-700 bg-surface-800/40 text-surface-400 hover:border-red-500/40 hover:text-surface-200 hover:bg-surface-800',
                  }

                  const dotColors: Record<string, string> = {
                    Baja: 'bg-emerald-400',
                    Media: 'bg-amber-400',
                    Alta: 'bg-orange-400',
                    Crítica: 'bg-red-400 animate-pulse',
                  }

                  return (
                    <label
                      key={u}
                      className={`relative flex items-center justify-center gap-1.5 p-2.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
                        isSelected
                          ? `${selectedStyles[u]} scale-[1.02] font-bold`
                          : `${unselectedStyles[u]} font-medium`
                      }`}
                    >
                      <input type="radio" {...register('urgencia')} value={u} className="sr-only" />
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? dotColors[u] : 'bg-surface-600'}`} />
                      <span className="text-xs">{u}</span>
                      {isSelected && (
                        <Check size={13} className="ml-auto stroke-[2.5]" />
                      )}
                    </label>
                  )
                })}
              </div>
              {errors.urgencia && <p className="form-error">{errors.urgencia.message}</p>}
            </div>

            {/* Notas */}
            <div className="form-group">
              <label className="form-label">Notas adicionales</label>
              <textarea
                {...register('notas')}
                rows={3}
                className="form-textarea"
                placeholder="Contexto adicional: cliente que lo pide, qué hay de alternativa, etc."
                id="shortage-notas"
              />
            </div>

            {/* Reporter info */}
            <div className="flex items-center gap-2 p-3 bg-surface-700/40 rounded-lg text-xs text-surface-400">
              <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold">
                {profile?.nombre_completo?.[0] || '?'}
              </div>
              Reportando como <strong className="text-surface-200">{profile?.nombre_completo}</strong>
              {profile?.cargo && <span>· {profile.cargo}</span>}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary" id="shortage-submit">
              {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Guardando...' : 'Reportar Falta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
