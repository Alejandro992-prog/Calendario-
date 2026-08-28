import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, TrendingDown, Upload, Image, Loader2 } from 'lucide-react'
import { supabase, uploadFile, getSignedUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'

const schema = z.object({
  modelo: z.string().min(1, 'Introduce el modelo'),
  marca: z.string().optional(),
  competidor: z.string().min(1, 'Indica el competidor'),
  precio_detectado: z.coerce.number().positive().optional(),
  precio_nuestro: z.coerce.number().positive().optional(),
  canal_tienda: z.string().optional(),
  notas: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const MARCAS = ['Bosch', 'Siemens', 'Balay', 'Samsung', 'LG', 'Haier', 'Candy', 'Indesit', 'Whirlpool', 'AEG', 'Electrolux', 'Otra']

interface AlertFormProps {
  onClose: () => void
  onSaved: () => void
}

export default function AlertForm({ onClose, onSaved }: AlertFormProps) {
  const { profile } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [captureFile, setCaptureFile] = useState<File | null>(null)
  const [capturePreview, setCapturePreview] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const precioDetectado = watch('precio_detectado')
  const precioNuestro = watch('precio_nuestro')
  const diff = precioDetectado && precioNuestro
    ? ((Number(precioNuestro) - Number(precioDetectado)) / Number(precioNuestro) * 100)
    : null

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    onDrop: (accepted) => {
      if (accepted[0]) {
        setCaptureFile(accepted[0])
        setCapturePreview(URL.createObjectURL(accepted[0]))
      }
    },
  })

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    let captura_url: string | null = null

    // Upload image if present
    if (captureFile && profile) {
      const path = `${profile.id}/${Date.now()}_${captureFile.name}`
      const storagePath = await uploadFile('price-alert-captures', path, captureFile)
      if (storagePath) {
        captura_url = await getSignedUrl('price-alert-captures', storagePath, 60 * 60 * 24 * 365)
      }
    }

    const { error } = await supabase.from('price_alerts').insert({
      ...data,
      captura_url,
      reportado_por: profile?.id,
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Alerta de precio registrada')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-xl w-full">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <TrendingDown size={18} className="text-cyan-400" />
            </div>
            <h2 className="modal-title">Reportar Agresión de Precio</h2>
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Modelo */}
              <div className="form-group">
                <label className="form-label">Modelo *</label>
                <input
                  type="text"
                  {...register('modelo')}
                  className="form-input font-mono"
                  placeholder="Ref. del electrodoméstico"
                  id="alert-modelo"
                />
                {errors.modelo && <p className="form-error">{errors.modelo.message}</p>}
              </div>

              {/* Marca */}
              <div className="form-group">
                <label className="form-label">Marca</label>
                <select {...register('marca')} className="form-select" id="alert-marca">
                  <option value="">Seleccionar...</option>
                  {MARCAS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>

              {/* Competidor */}
              <div className="form-group col-span-2">
                <label className="form-label">Competidor / Distribuidor *</label>
                <input
                  type="text"
                  {...register('competidor')}
                  className="form-input"
                  placeholder="Ej: MediaMarkt, Amazon, El Corte Inglés..."
                  id="alert-competidor"
                />
                {errors.competidor && <p className="form-error">{errors.competidor.message}</p>}
              </div>

              {/* Precios */}
              <div className="form-group">
                <label className="form-label">Precio detectado (€)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('precio_detectado')}
                  className="form-input"
                  placeholder="0.00"
                  id="alert-precio-detectado"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nuestro precio (€)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('precio_nuestro')}
                  className="form-input"
                  placeholder="0.00"
                  id="alert-precio-nuestro"
                />
              </div>

              {/* Price diff preview */}
              {diff !== null && (
                <div className="col-span-2 flex items-center gap-3 p-3 rounded-xl bg-surface-700/40">
                  <TrendingDown size={16} className={diff < 0 ? 'text-red-400' : 'text-green-400'} />
                  <span className="text-sm text-surface-300">
                    Diferencia:{' '}
                    <strong className={diff < 0 ? 'text-red-400' : 'text-green-400'}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </strong>
                    {diff < 0 && (
                      <span className="text-red-400 ml-1">
                        (nos superan en {Math.abs(diff).toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Canal */}
              <div className="form-group col-span-2">
                <label className="form-label">Canal / Tienda</label>
                <input
                  type="text"
                  {...register('canal_tienda')}
                  className="form-input"
                  placeholder="Ej: Online, Tienda física Sevilla, App..."
                  id="alert-canal"
                />
              </div>

              {/* Notas */}
              <div className="form-group col-span-2">
                <label className="form-label">Notas</label>
                <textarea
                  {...register('notas')}
                  rows={2}
                  className="form-textarea"
                  placeholder="Contexto adicional..."
                  id="alert-notas"
                />
              </div>
            </div>

            {/* Capture upload */}
            <div className="form-group">
              <label className="form-label">Captura de pantalla / Justificante</label>
              {capturePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-surface-700">
                  <img src={capturePreview} alt="Preview" className="w-full max-h-40 object-contain bg-surface-900" />
                  <button
                    type="button"
                    onClick={() => { setCaptureFile(null); setCapturePreview(null) }}
                    className="absolute top-2 right-2 p-1 bg-surface-900/80 rounded-lg text-surface-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}
                  id="alert-capture-dropzone"
                >
                  <input {...getInputProps()} id="alert-capture-input" />
                  <div className="flex flex-col items-center gap-2">
                    <Image size={28} className="text-surface-500" />
                    <p className="text-sm text-surface-400">
                      {isDragActive ? 'Suelta la imagen' : 'Arrastra o haz clic para subir captura'}
                    </p>
                    <p className="text-xs text-surface-600">PNG, JPG, WEBP · máx. 10MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary" id="alert-submit">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Guardando...' : 'Registrar Alerta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
