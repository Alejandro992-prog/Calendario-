import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { useState } from 'react'

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

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { urgencia: 'Media' },
  })

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
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
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
              <label className="form-label">Urgencia *</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Baja', 'Media', 'Alta', 'Crítica'] as const).map((u) => {
                  const colors: Record<string, string> = {
                    Baja: 'border-green-500/40 text-green-400 bg-green-500/10',
                    Media: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10',
                    Alta: 'border-red-500/40 text-red-400 bg-red-500/10',
                    Crítica: 'border-red-600/60 text-red-300 bg-red-600/20',
                  }
                  return (
                    <label
                      key={u}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border cursor-pointer transition-all ${colors[u]} hover:opacity-90`}
                    >
                      <input type="radio" {...register('urgencia')} value={u} className="sr-only" />
                      <span className="text-xs font-semibold">{u}</span>
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
