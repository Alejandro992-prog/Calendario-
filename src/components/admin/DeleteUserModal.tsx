import { useState, useRef } from 'react'
import {
  Trash2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  X,
  UserX,
  CheckCircle2,
  Lock,
  Database,
  History,
} from 'lucide-react'
import { adminDeleteUser } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types'
import toast from 'react-hot-toast'

interface DeleteUserModalProps {
  user: Profile
  onClose: () => void
  onDeleted: () => void
}

const roleBadgeColor: Record<UserRole, string> = {
  Administrador: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  Compras: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Comercial: 'bg-green-500/20 text-green-300 border border-green-500/30',
}

export default function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: DeleteUserModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmedCheck, setConfirmedCheck] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isBackdropClick = useRef(false)

  const handleDelete = async () => {
    if (step !== 2) return
    setDeleting(true)

    try {
      const res = await adminDeleteUser(user.id)
      if (!res.success) {
        toast.error(res.error || 'Error al eliminar el usuario')
        setDeleting(false)
      } else {
        toast.success(`Usuario "${user.nombre_completo}" eliminado correctamente`)
        onDeleted()
        onClose()
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error inesperado al procesar la eliminación')
      setDeleting(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        isBackdropClick.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropClick.current && !deleting) {
          onClose()
        }
        isBackdropClick.current = false
      }}
    >
      <div className="modal-panel max-w-lg w-full overflow-hidden border border-red-500/30 shadow-2xl shadow-red-950/30 animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header con indicador de pasos */}
        <div className="modal-header border-b border-surface-700/60 pb-4 bg-surface-800/80">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl flex items-center justify-center transition-colors ${
                step === 1
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
              }`}
            >
              {step === 1 ? <ShieldAlert size={22} /> : <Trash2 size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="modal-title text-base font-bold text-surface-100">
                  {step === 1 ? 'Eliminar Usuario / Contacto' : 'Confirmación Definitiva'}
                </h2>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    step === 1
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/10 text-red-300 border-red-500/30'
                  }`}
                >
                  Paso {step} de 2
                </span>
              </div>
              <p className="text-xs text-surface-400 mt-0.5">
                {step === 1
                  ? 'Revisa el impacto de esta acción antes de continuar'
                  : 'Verificación de seguridad para evitar eliminaciones accidentales'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="btn-ghost btn-icon text-surface-400 hover:text-surface-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Barra de progreso de 2 pasos */}
        <div className="w-full bg-surface-800 grid grid-cols-2 h-1 border-b border-surface-700/50">
          <div className="bg-amber-500 h-full transition-all duration-300" />
          <div
            className={`h-full transition-all duration-300 ${
              step === 2 ? 'bg-red-500' : 'bg-surface-700/40'
            }`}
          />
        </div>

        {/* Contenido según el paso */}
        <div className="modal-body space-y-4 py-5">
          {/* Ficha resumen del usuario a eliminar */}
          <div className="p-3.5 rounded-xl bg-surface-800/90 border border-surface-700/70 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
                {user.nombre_completo?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-surface-100 text-sm truncate">
                  {user.nombre_completo}
                </p>
                <p className="text-xs text-surface-400 truncate">{user.email}</p>
                {user.cargo && (
                  <p className="text-[11px] text-surface-500 truncate mt-0.5">
                    Cargo: {user.cargo}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${roleBadgeColor[user.rol] || 'badge-gray'}`}>
                {user.rol}
              </span>
              <span className={`text-[10px] ${user.activo ? 'text-green-400' : 'text-surface-500'}`}>
                {user.activo ? '● Activo' : '○ Inactivo'}
              </span>
            </div>
          </div>

          {step === 1 ? (
            /* PASO 1: IMPACTO Y CONSECUENCIAS */
            <div className="space-y-3 animate-in fade-in-50 duration-200">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-medium text-xs text-amber-300">
                  <AlertTriangle size={15} className="flex-shrink-0" />
                  <span>Impacto de eliminar esta cuenta en el sistema:</span>
                </div>
                <ul className="text-xs text-surface-300 space-y-2 pl-1">
                  <li className="flex items-start gap-2">
                    <Lock size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Pérdida inmediata de acceso:</strong> El usuario no podrá autenticarse ni volver a acceder a la plataforma.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Database size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Integridad de datos preservada:</strong> Las descargas de camiones, faltas reportadas y comentarios registrados por este usuario no se borrarán (su histórico operativo queda a salvo).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <History size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Acción no reversible:</strong> Si necesitas reactivar a esta persona en el futuro, deberás volver a crear una nueva cuenta.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-surface-800/40 rounded-lg border border-surface-700/50 text-[11px] text-surface-400">
                <p>
                  💡 <em>Consejo:</em> Si solo deseas suspender temporalmente el acceso del usuario sin eliminar su registro, puedes usar la opción de <strong>Desactivar</strong> en lugar de eliminar.
                </p>
              </div>
            </div>
          ) : (
            /* PASO 2: CONFIRMACIÓN DEFINITIVA */
            <div className="space-y-4 animate-in fade-in-50 duration-200">
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 space-y-3">
                <div className="flex items-center gap-2.5">
                  <UserX size={20} className="text-red-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-red-300">
                    ¿Estás absolutamente seguro de eliminar a este usuario?
                  </h3>
                </div>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Vas a eliminar permanentemente al usuario{' '}
                  <strong className="text-white font-semibold">{user.nombre_completo}</strong> (
                  <span className="font-mono text-red-300">{user.email}</span>).
                  Esta acción es definitiva y no podrá ser revertida.
                </p>
              </div>

              {/* Casilla de verificación de seguridad */}
              <label
                htmlFor="confirm-delete-checkbox"
                className="flex items-start gap-3 p-3 rounded-xl bg-surface-800 border border-surface-700 hover:border-surface-600 transition-colors cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  id="confirm-delete-checkbox"
                  checked={confirmedCheck}
                  onChange={(e) => setConfirmedCheck(e.target.checked)}
                  className="mt-0.5 rounded border-surface-600 bg-surface-900 text-red-500 focus:ring-red-500 h-4 w-4"
                />
                <span className="text-xs text-surface-200 leading-normal">
                  Confirmo que he revisado las consecuencias y deseo <strong>eliminar definitivamente</strong> la cuenta de {user.nombre_completo}.
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer con navegación entre pasos */}
        <div className="modal-footer bg-surface-800/80 border-t border-surface-700/60 flex items-center justify-between">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-2 border-amber-500"
                id="btn-delete-step1-continue"
              >
                <span>Continuar a confirmación</span>
                <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={deleting}
                className="btn-secondary flex items-center gap-2"
                id="btn-delete-step2-back"
              >
                <ArrowLeft size={15} />
                <span>Volver al paso 1</span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!confirmedCheck || deleting}
                className="btn-danger flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-red-950/50"
                id="btn-delete-user-confirm"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Eliminando usuario...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Sí, eliminar definitivamente</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
