import { useState, useRef } from 'react'
import { KeyRound, Eye, EyeOff, Copy, Check, Sparkles, X } from 'lucide-react'
import { adminResetUserPassword } from '@/lib/supabase'
import type { Profile } from '@/types'
import toast from 'react-hot-toast'

interface ResetPasswordModalProps {
  targetUser: Profile
  isCurrentUser: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function ResetPasswordModal({
  targetUser,
  isCurrentUser,
  onClose,
  onSuccess,
}: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const isBackdropClick = useRef(false)

  // Generador de contraseñas seguras y legibles
  const handleGeneratePassword = () => {
    const prefixes = ['Garde', 'Electro', 'Norte', 'Almacen', 'Compras']
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const year = new Date().getFullYear()
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let rand = ''
    for (let i = 0; i < 3; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const generated = `${prefix}${year}!${rand}`
    setPassword(generated)
    setShowPass(true)
    toast.success('Contraseña generada')
  }

  const handleCopy = async () => {
    if (!password) return
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      toast.success('¡Contraseña copiada al portapapeles!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password || password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setSaving(true)
    try {
      const res = await adminResetUserPassword(targetUser.id, password, isCurrentUser)
      if (!res.success) {
        toast.error(res.error || 'Error al cambiar la contraseña')
      } else {
        toast.success(
          isCurrentUser
            ? 'Tu contraseña se ha actualizado correctamente'
            : `Contraseña de ${targetUser.nombre_completo} cambiada con éxito`
        )
        if (onSuccess) onSuccess()
        onClose()
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error inesperado al guardar')
    } finally {
      setSaving(false)
    }
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
      }}
    >
      <div className="modal-panel max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-surface-700/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Cambiar Contraseña</h3>
              <p className="text-xs text-surface-400 mt-0.5">
                {targetUser.nombre_completo} • <span className="font-mono text-surface-300">{targetUser.email}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-700/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Note info */}
        <div className="mt-3.5 p-3 rounded-xl bg-surface-800/80 border border-surface-700/80 text-xs text-surface-300 space-y-1">
          <p className="flex items-center gap-1.5 font-semibold text-brand-300">
            <span>🛡️</span> Permiso de Administrador
          </p>
          <p className="text-surface-400 leading-relaxed">
            Puedes asignar una nueva clave de acceso directamente. No es necesario conocer ni solicitar la contraseña anterior del usuario.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="form-label text-xs font-semibold text-surface-300 mb-0">
                Nueva Contraseña <span className="text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="text-[11px] font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
              >
                <Sparkles size={12} />
                Generar sugerencia
              </button>
            </div>

            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Escribe la nueva contraseña (mín. 6 car.)"
                className="form-input text-sm w-full pr-20 font-mono"
                autoFocus
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {password && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1 text-surface-400 hover:text-white rounded transition-colors"
                    title="Copiar contraseña"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="p-1 text-surface-400 hover:text-white rounded transition-colors"
                  title={showPass ? 'Ocultar' : 'Mostrar'}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-surface-500 mt-1">
              Mínimo 6 caracteres. Recuerda comunicarle la nueva contraseña al usuario tras guardarla.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-700/80">
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
              disabled={saving || !password || password.length < 6}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              {saving ? 'Guardando...' : 'Establecer Contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
