import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  AlertTriangle,
  TrendingDown,
  Settings,
  LogOut,
  Zap,
  ChevronRight,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface NavItem {
  path: string
  icon: React.ReactNode
  label: string
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  {
    path: '/dashboard',
    icon: <LayoutDashboard size={18} />,
    label: 'Dashboard',
  },
  {
    path: '/calendar',
    icon: <CalendarDays size={18} />,
    label: 'Descargas',
  },
  {
    path: '/shortages',
    icon: <AlertTriangle size={18} />,
    label: 'Faltas',
  },
  {
    path: '/price-alerts',
    icon: <TrendingDown size={18} />,
    label: 'Precios',
  },
  {
    path: '/admin',
    icon: <Settings size={18} />,
    label: 'Administración',
    roles: ['Administrador'],
  },
]

const roleBadgeColor: Record<UserRole, string> = {
  Administrador: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Compras: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Comercial: 'bg-green-500/20 text-green-300 border-green-500/30',
}

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const visibleItems = navItems.filter(
    (item) => !item.roles || (profile && item.roles.includes(profile.rol))
  )

  const initials =
    profile?.nombre_completo
      ?.split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() || '?'

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-[260px] bg-surface-900 border-r border-surface-700 flex flex-col z-50 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Logo & Close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 h-16 bg-surface-900/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1 shadow-md shadow-brand-500/10 flex-shrink-0">
              <img
                src="/logo.png"
                alt="Grupo Garde"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-white block leading-tight truncate">Grupo Garde</span>
              <span className="text-[11px] text-surface-400 leading-tight block truncate">Electrodomésticos</span>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
            Menú Principal
          </p>
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={() => {
                    if (onClose) onClose()
                  }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      isActive
                        ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
                        : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/60'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-brand-400' : 'group-hover:text-surface-200'}>
                        {item.icon}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {isActive && (
                        <ChevronRight size={14} className="text-brand-500" />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Profile info */}
        <div className="border-t border-surface-700 p-3">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-800/50">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold shadow-md">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100 truncate">
                {profile?.nombre_completo || 'Usuario'}
              </p>
              {profile?.rol && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${roleBadgeColor[profile.rol]}`}>
                  {profile.rol}
                </span>
              )}
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
