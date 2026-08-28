import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  AlertTriangle,
  TrendingDown,
  Settings,
} from 'lucide-react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuthStore } from '@/store/authStore'

interface LayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export default function Layout({ title, subtitle, children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { profile } = useAuthStore()

  const bottomNavItems = [
    { path: '/dashboard', label: 'Inicio', icon: <LayoutDashboard size={20} /> },
    { path: '/calendar', label: 'Descargas', icon: <CalendarDays size={20} /> },
    { path: '/shortages', label: 'Faltas', icon: <AlertTriangle size={20} /> },
    { path: '/price-alerts', label: 'Precios', icon: <TrendingDown size={20} /> },
    ...(profile?.rol === 'Administrador'
      ? [{ path: '/admin', label: 'Admin', icon: <Settings size={20} /> }]
      : []),
  ]

  return (
    <div className="min-h-screen bg-surface-900 text-surface-100 flex flex-col">
      {/* Sidebar (Fixed on Desktop, Drawer on Mobile) */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-[260px] transition-all duration-200">
        <TopBar
          title={title}
          subtitle={subtitle}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          isMobileMenuOpen={mobileMenuOpen}
        />

        <main className="flex-1 p-3.5 sm:p-6 pt-20 pb-24 md:pb-6 animate-fade-in max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Visible only on < 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-surface-900/95 border-t border-surface-700/80 backdrop-blur-xl px-2 flex items-center justify-around">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-brand-400 font-semibold'
                  : 'text-surface-400 hover:text-surface-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-xl transition-all ${
                    isActive ? 'bg-brand-500/15 text-brand-400' : ''
                  }`}
                >
                  {item.icon}
                </div>
                <span className="mt-0.5">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
