import { Bell, Search } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface TopBarProps {
  title: string
  subtitle?: string
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { profile } = useAuthStore()

  const now = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <header
      className="fixed top-0 right-0 z-30 flex items-center justify-between px-6 py-0 border-b border-surface-700 bg-surface-900/80 backdrop-blur-sm"
      style={{ left: 260, height: 64 }}
    >
      {/* Page info */}
      <div>
        <h1 className="text-base font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-surface-400 capitalize">{subtitle || now}</p>}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <span className="hidden md:block text-xs text-surface-500 mr-2 capitalize">{now}</span>
        <button className="btn-ghost btn-icon relative">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-500" />
        </button>
        <div className="w-px h-6 bg-surface-700" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white text-xs font-semibold">
            {profile?.nombre_completo?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '?'}
          </div>
          <span className="hidden md:block text-sm font-medium text-surface-200">
            {profile?.nombre_completo?.split(' ')[0] || 'Usuario'}
          </span>
        </div>
      </div>
    </header>
  )
}
