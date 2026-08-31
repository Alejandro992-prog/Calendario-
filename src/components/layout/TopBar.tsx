import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Menu,
  X,
  Truck,
  Package,
  TrendingDown,
  LogOut,
  Shield,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  MessageSquare,
  RefreshCw as StatusIcon,
  Trash2,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import {
  fetchUserNotifications,
  saveDismissedId,
  saveDismissedIds,
  type AppNotification,
} from '@/lib/notifications'
import toast from 'react-hot-toast'

interface TopBarProps {
  title: string
  subtitle?: string
  onToggleMobileMenu?: () => void
  isMobileMenuOpen?: boolean
}

export default function TopBar({
  title,
  subtitle,
  onToggleMobileMenu,
  isMobileMenuOpen,
}: TopBarProps) {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const now = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Load notifications from database + listen for real-time changes
  useEffect(() => {
    if (profile?.id) {
      loadNotifications()
    }

    // Custom event listener for instant local updates across components
    const handleUpdate = () => {
      loadNotifications()
    }
    window.addEventListener('garde_notification_update', handleUpdate)

    // Supabase realtime subscription for instant notifications
    const channel = supabase
      .channel('realtime_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shortage_comments' },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock_shortages' },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_shortages' },
        () => loadNotifications()
      )
      .subscribe()

    return () => {
      window.removeEventListener('garde_notification_update', handleUpdate)
      supabase.removeChannel(channel)
    }
  }, [profile?.id, profile?.rol])

  const loadNotifications = async () => {
    if (!profile) return
    setLoadingNotifications(true)
    try {
      const items = await fetchUserNotifications(profile)
      setNotifications(items)
    } catch (err) {
      console.error('Error fetching notifications:', err)
    } finally {
      setLoadingNotifications(false)
    }
  }

  // Dismiss a single notification
  const handleDismissOne = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!profile?.id) return

    saveDismissedId(profile.id, id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    toast.success('Aviso eliminado', { duration: 1500, position: 'bottom-right' })
  }

  // Dismiss all currently displayed notifications
  const handleDismissAll = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!profile?.id || notifications.length === 0) return

    const ids = notifications.map((n) => n.id)
    saveDismissedIds(profile.id, ids)
    setNotifications([])
    toast.success('Todos los avisos han sido eliminados', {
      duration: 2000,
      position: 'bottom-right',
    })
  }

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials =
    profile?.nombre_completo
      ?.split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() || '?'

  return (
    <header className="fixed top-0 right-0 left-0 md:left-[260px] z-30 flex items-center justify-between px-4 sm:px-6 h-16 border-b border-surface-700 bg-surface-900/90 backdrop-blur-md transition-all duration-200">
      {/* Left side: Hamburger (mobile) + Logo (mobile) + Page info */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors flex-shrink-0"
            aria-label="Abrir menú"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <img
          src="/logo.png"
          alt="Grupo Garde"
          className="h-8 w-8 object-contain rounded-lg bg-white p-0.5 shadow-sm md:hidden flex-shrink-0"
        />

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-white truncate max-w-[150px] sm:max-w-none">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-surface-400 capitalize hidden sm:block truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <span className="hidden lg:block text-xs text-surface-500 mr-2 capitalize">{now}</span>

        {/* Notification Bell with Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications)
              setShowProfileMenu(false)
              if (!showNotifications) loadNotifications()
            }}
            className={`btn-ghost btn-icon relative ${
              showNotifications ? 'bg-surface-700 text-white' : ''
            }`}
            title="Notificaciones y avisos"
            aria-label="Notificaciones"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
              </span>
            )}
          </button>

          {/* Notifications Dropdown Modal */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-84 sm:w-[420px] rounded-xl bg-surface-800/95 border border-surface-700 shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-scale-in">
              {/* Dropdown Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-surface-900/70">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-brand-400" />
                  <span className="text-sm font-semibold text-white">Avisos y Novedades</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {notifications.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {notifications.length > 0 && (
                    <button
                      onClick={handleDismissAll}
                      className="text-[11px] text-surface-400 hover:text-red-300 px-2 py-1 rounded-md hover:bg-surface-700/60 transition-colors flex items-center gap-1"
                      title="Eliminar todos los avisos vistos"
                    >
                      <Trash2 size={12} />
                      <span>Limpiar todo</span>
                    </button>
                  )}
                  <button
                    onClick={loadNotifications}
                    disabled={loadingNotifications}
                    className="text-surface-400 hover:text-white p-1 rounded-md hover:bg-surface-700/60 transition-colors"
                    title="Actualizar avisos"
                  >
                    <RefreshCw size={13} className={loadingNotifications ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Notifications List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-surface-700/50">
                {loadingNotifications && notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-surface-400">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando avisos...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-10 px-4 text-center">
                    <CheckCircle2 size={28} className="text-green-400 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-medium text-surface-200">¡Todo al día!</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      No tienes avisos ni comentarios nuevos pendientes
                    </p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className="relative flex items-start gap-3 p-3.5 hover:bg-surface-700/40 transition-colors group cursor-pointer"
                      onClick={() => {
                        setShowNotifications(false)
                        navigate(item.link)
                      }}
                    >
                      {/* Category Icon */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm ${
                          item.type === 'comment'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                            : item.type === 'status_change'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            : item.type === 'new_shortage'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                            : item.type === 'delivery'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                            : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                        }`}
                      >
                        {item.type === 'comment' && <MessageSquare size={15} />}
                        {item.type === 'status_change' && <StatusIcon size={15} />}
                        {item.type === 'new_shortage' && <AlertTriangle size={15} />}
                        {item.type === 'delivery' && <Truck size={15} />}
                        {item.type === 'price' && <TrendingDown size={15} />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-surface-100 group-hover:text-brand-300 transition-colors truncate">
                            {item.title}
                          </p>
                          <span className="text-[10px] text-surface-500 whitespace-nowrap">
                            {item.timeAgo}
                          </span>
                        </div>
                        <p className="text-[11px] text-surface-300 mt-0.5 truncate">
                          {item.subtitle}
                        </p>
                        {item.detail && (
                          <p className="text-[11px] text-surface-400 italic bg-surface-900/40 p-1.5 rounded mt-1 border border-surface-700/40 line-clamp-2">
                            {item.detail}
                          </p>
                        )}
                      </div>

                      {/* Individual Delete / Dismiss Button */}
                      <button
                        onClick={(e) => handleDismissOne(e, item.id)}
                        className="absolute right-2.5 top-3 p-1 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors opacity-70 group-hover:opacity-100"
                        title="Eliminar este aviso"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Dropdown Footer */}
              {notifications.length > 0 && (
                <div className="p-2.5 border-t border-surface-700 bg-surface-900/70 flex items-center justify-between">
                  <button
                    onClick={handleDismissAll}
                    className="text-xs text-surface-400 hover:text-red-300 transition-colors flex items-center gap-1 px-2 py-1"
                  >
                    <Trash2 size={12} /> Eliminar vistos
                  </button>
                  <Link
                    to="/shortages"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors inline-flex items-center gap-1 py-1"
                  >
                    Ver todas las faltas <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-surface-700 mx-1" />

        {/* Profile Dropdown Menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu)
              setShowNotifications(false)
            }}
            className={`flex items-center gap-2 p-1 rounded-full sm:rounded-lg sm:px-2 sm:py-1 hover:bg-surface-800 transition-colors ${
              showProfileMenu ? 'bg-surface-800 ring-1 ring-brand-500/30' : ''
            }`}
            aria-label="Menú de usuario"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-md">
              {initials}
            </div>
            <span className="hidden sm:block text-sm font-medium text-surface-200 truncate max-w-[120px]">
              {profile?.nombre_completo?.split(' ')[0] || 'Usuario'}
            </span>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface-800/95 border border-surface-700 shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-scale-in">
              <div className="p-4 border-b border-surface-700 bg-surface-900/50">
                <p className="text-sm font-semibold text-white truncate">
                  {profile?.nombre_completo || 'Usuario'}
                </p>
                <p className="text-xs text-surface-400 truncate mt-0.5">
                  {profile?.email}
                </p>
                {profile?.rol && (
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-medium bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {profile.rol} · {profile.cargo || 'Equipo Garde'}
                  </span>
                )}
              </div>

              <div className="p-2 space-y-1">
                {profile?.rol === 'Administrador' && (
                  <Link
                    to="/admin"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-surface-200 hover:text-white hover:bg-surface-700/60 rounded-lg transition-colors"
                  >
                    <Shield size={15} className="text-purple-400" />
                    Panel de Administración
                  </Link>
                )}

                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    handleSignOut()
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                >
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
