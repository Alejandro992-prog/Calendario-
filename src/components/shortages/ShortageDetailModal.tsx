import { useState, useEffect, useRef } from 'react'
import { X, MessageSquare, Send, AlertTriangle, User, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { StockShortage, ShortageComment } from '@/types'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADOS = ['Pendiente', 'Visto', 'En Revisión', 'Pedido', 'En Tránsito', 'Descartado']

const urgencyColors: Record<string, string> = {
  Baja: 'text-green-400 bg-green-500/10',
  Media: 'text-yellow-400 bg-yellow-500/10',
  Alta: 'text-red-400 bg-red-500/10',
  Crítica: 'text-red-300 bg-red-600/20',
}

interface Props {
  shortage: StockShortage
  canManage: boolean
  onClose: () => void
  onUpdated: () => void
}

export default function ShortageDetailModal({ shortage, canManage, onClose, onUpdated }: Props) {
  const { profile } = useAuthStore()
  const [comments, setComments] = useState<ShortageComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [currentEstado, setCurrentEstado] = useState(shortage.estado)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const canDelete = profile?.rol === 'Administrador' || profile?.rol === 'Compras' || profile?.id === shortage.reportado_por

  useEffect(() => {
    loadComments()
  }, [shortage.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const loadComments = async () => {
    const { data } = await supabase
      .from('shortage_comments')
      .select('*, autor:profiles!autor_id(nombre_completo, cargo, rol)')
      .eq('shortage_id', shortage.id)
      .order('created_at', { ascending: true })
    setComments((data || []) as ShortageComment[])
  }

  const sendComment = async () => {
    if (!newComment.trim()) return
    setSendingComment(true)
    const { error } = await supabase.from('shortage_comments').insert({
      shortage_id: shortage.id,
      autor_id: profile?.id,
      contenido: newComment.trim(),
    })
    if (error) toast.error(error.message)
    else {
      setNewComment('')
      await loadComments()
    }
    setSendingComment(false)
  }

  const updateStatus = async (estado: string) => {
    setUpdatingStatus(true)
    const { error } = await supabase
      .from('stock_shortages')
      .update({ estado, gestionado_por: profile?.id })
      .eq('id', shortage.id)
    if (error) toast.error(error.message)
    else {
      setCurrentEstado(estado as any)
      toast.success('Estado actualizado')
      onUpdated()
    }
    setUpdatingStatus(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase
      .from('stock_shortages')
      .delete()
      .eq('id', shortage.id)

    if (error) {
      toast.error(`Error al eliminar: ${error.message}`)
      setDeleting(false)
    } else {
      toast.success('Falta de stock eliminada correctamente')
      onUpdated()
      onClose()
    }
  }

  const rolColors: Record<string, string> = {
    Administrador: 'bg-purple-500/20 text-purple-300',
    Compras: 'bg-blue-500/20 text-blue-300',
    Comercial: 'bg-green-500/20 text-green-300',
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-2xl w-full flex flex-col" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="modal-header flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${urgencyColors[shortage.urgencia] || ''}`}>
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="modal-title">
                {shortage.categoria}
                {shortage.especificacion && (
                  <span className="text-surface-400 font-normal"> · {shortage.especificacion}</span>
                )}
              </h2>
              {shortage.modelo && (
                <p className="text-xs font-mono text-brand-400">{shortage.modelo}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg">
                  <span className="text-xs text-red-400">¿Eliminar?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded font-medium transition-colors"
                  >
                    {deleting ? '...' : 'Sí'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-surface-400 hover:text-surface-200 px-1 py-0.5"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Eliminar falta"
                  id="btn-delete-shortage"
                >
                  <Trash2 size={16} />
                </button>
              )
            )}
            <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-surface-700/30 border-b border-surface-700 text-xs text-surface-400 flex-shrink-0">
          <span>
            Reportado por <strong className="text-surface-200">
              {(shortage as any).reporter?.nombre_completo || '—'}
            </strong>
            {(shortage as any).reporter?.cargo && ` (${(shortage as any).reporter.cargo})`}
          </span>
          <span>·</span>
          <span>{format(new Date(shortage.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}</span>
          {canManage && (
            <>
              <span className="ml-auto">Estado:</span>
              <select
                className="form-select py-0.5 text-xs"
                value={currentEstado}
                onChange={(e) => updateStatus(e.target.value)}
                disabled={updatingStatus}
                id="detail-estado"
              >
                {ESTADOS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </>
          )}
        </div>

        {/* Notes */}
        {shortage.notas && (
          <div className="px-5 py-3 bg-surface-700/20 border-b border-surface-700 flex-shrink-0">
            <p className="text-sm text-surface-300">{shortage.notas}</p>
          </div>
        )}

        {/* Comments thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-surface-500 mb-3">
            <MessageSquare size={12} />
            <span>{comments.length} comentario{comments.length !== 1 ? 's' : ''}</span>
          </div>

          {comments.length === 0 && (
            <div className="text-center py-8 text-surface-600">
              <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aún no hay comentarios. Sé el primero.</p>
            </div>
          )}

          {comments.map((c) => {
            const isMe = c.autor_id === profile?.id
            const autor = (c as any).autor
            return (
              <div key={c.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isMe ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-600 text-surface-300'
                }`}>
                  {autor?.nombre_completo?.[0] || '?'}
                </div>
                {/* Bubble */}
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-surface-300">
                      {autor?.nombre_completo || 'Desconocido'}
                    </span>
                    {autor?.rol && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rolColors[autor.rol] || ''}`}>
                        {autor.rol}
                      </span>
                    )}
                    <span className="text-[10px] text-surface-600">
                      {format(new Date(c.created_at), 'HH:mm dd/MM')}
                    </span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl text-sm ${
                    isMe
                      ? 'bg-brand-600/20 text-surface-100 border border-brand-500/20'
                      : 'bg-surface-700 text-surface-200'
                  }`}>
                    {c.contenido}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {/* Comment input */}
        <div className="flex-shrink-0 border-t border-surface-700 p-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold flex-shrink-0">
              {profile?.nombre_completo?.[0] || '?'}
            </div>
            <input
              type="text"
              className="form-input flex-1 py-2"
              placeholder="Escribe un comentario..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendComment()}
              id="shortage-comment-input"
            />
            <button
              onClick={sendComment}
              disabled={sendingComment || !newComment.trim()}
              className="btn-primary btn-icon"
              id="shortage-comment-send"
            >
              {sendingComment
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
