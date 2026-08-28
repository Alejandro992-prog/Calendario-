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
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { format, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'

interface TopBarProps {
  title: string
  subtitle?: string
  onToggleMobileMenu?: () => void
  isMobileMenuOpen?: boolean
}

interface NotificationItem {
  id: string
  type: 'delivery' | 'shortage' | 'price'
  title: string
  subtitle: string
  date: string
  link: string
  urgency?: string
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
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const now = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Load real notifications from Supabase
  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    setLoadingNotifications(true)
    try {
      const todayStr = new Date().toISOString().split('T')[0]

      const [deliveriesRes, shortagesRes, priceRes] = await Promise.all([
        supabase
          .from('deliveries')
          .select('id, referencia, fecha_prevista, estado, supplier:suppliers(nombre)')
          .in('estado', ['Programada', 'En muelle'])
          .gte('fecha_prevista', todayStr)
          .order('fecha_prevista', { ascending: true })
          .limit(4),
        supabase
          .from('stock_shortages')
          .select('id, modelo, especificacion, urgencia, categoria, created_at')
          .in('urgencia', ['Crítica', 'Alta'])
          .not('estado', 'in', '(Descartado,Pedido,En Tránsito)')
          .order('created_at', { ascending: false })
          .limit(4),
        supabase
          .from('price_alerts')
          .select('id, modelo, competidor, precio_detectado, created_at')
          .order('created_at', { ascending: false })
          .limit(3),
      ])

      const notifs: NotificationItem[] = []

      // Add Deliveries
      deliveriesRes.data?.forEach((d: any) => {
        const dDate = new Date(d.fecha_prevista + 'T00:00:00')
        const tag = isToday(dDate) ? 'Hoy' : isTomorrow(dDate) ? 'Mañana' : d.fecha_prevista
        notifs.push({
          id: `del-${d.id}`,
          type: 'delivery',
          title: `Descarga: ${d.supplier?.nombre || 'Proveedor'}`,
          subtitle: `Fecha: ${tag} · Ref: ${d.referencia || 'S/R'} (${d.estado})`,
          date: d.fecha_prevista,
          link: '/calendar',
        })
      })

      // Add Shortages
      shortagesRes.data?.forEach((s: any) => {
        notifs.push({
          id: `short-${s.id}`,
          type: 'shortage',
          title: `Falta urgente: ${s.modelo || s.especificacion || s.categoria}`,
          subtitle: `Urgencia ${s.urgencia} · ${s.categoria}`,
          date: s.created_at,
          link: '/shortages',
          urgency: s.urgencia,
        })
      })

      // Add Price Alerts
      priceRes.data?.forEach((p: any) => {
        notifs.push({
          id: `price-${p.id}`,
          type: 'price',
          title: `Agresión: ${p.competidor}`,
          subtitle: `Modelo ${p.modelo} detectado a ${p.precio_detectado}€`,
          date: p.created_at,
          link: '/price-alerts',
        })
      })

      setNotifications(notifs)
    } catch (err) {
      console.error('Error fetching notifications:', err)
    } finally {
      setLoadingNotifications(false)
    }
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
      {/* Left side: Hamburger (mobile) + Page info */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 -ml-1 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
            aria-label="Abrir menú"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        <div>
          <h1 className="text-base font-semibold text-white truncate max-w-[180px] sm:max-w-none">{title}</h1>
          {subtitle && (
            <p className="text-xs text-surface-400 capitalize hidden sm:block truncate">{subtitle}</p>
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
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-surface-800/95 border border-surface-700 shadow-2xl backdrop-blur-xl z-50 overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 bg-surface-900/50">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-brand-400" />
                  <span className="text-sm font-semibold text-white">Avisos y Alertas</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {notifications.length}
                  </span>
                </div>
                <button
                  onClick={loadNotifications}
                  disabled={loadingNotifications}
                  className="text-surface-400 hover:text-white p-1 rounded-md transition-colors"
                  title="Actualizar avisos"
                >
                  <RefreshCw size={13} className={loadingNotifications ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-surface-700/50">
                {loadingNotifications && notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-surface-400">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando avisos...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <CheckCircle2 size={24} className="text-green-400 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-medium text-surface-200">Todo al día</p>
                    <p className="text-xs text-surface-500 mt-0.5">No hay alertas urgentes pendientes</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <Link
                      key={item.id}
                      to={item.link}
                      onClick={() => setShowNotifications(false)}
                      className="flex items-start gap-3 p-3.5 hover:bg-surface-700/40 transition-colors group"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          item.type === 'delivery'
                            ? 'bg-blue-500/15 text-blue-400'
                            : item.type === 'shortage'
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-cyan-500/15 text-cyan-400'
                        }`}
                      >
                        {item.type === 'delivery' && <Truck size={16} />}
                        {item.type === 'shortage' && <Package size={16} />}
                        {item.type === 'price' && <TrendingDown size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-surface-100 group-hover:text-brand-300 transition-colors truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-surface-400 mt-0.5 line-clamp-1">
                          {item.subtitle}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-surface-600 group-hover:text-surface-300 flex-shrink-0 self-center" />
                    </Link>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-2 border-t border-surface-700 bg-surface-900/60 text-center">
                  <Link
                    to="/dashboard"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors inline-flex items-center gap-1 py-1"
                  >
                    Ver panel general <ChevronRight size={12} />
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
