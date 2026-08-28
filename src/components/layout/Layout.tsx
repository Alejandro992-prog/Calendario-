import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface LayoutProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export default function Layout({ title, subtitle, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-surface-900">
      <Sidebar />
      <div style={{ marginLeft: 260 }}>
        <TopBar title={title} subtitle={subtitle} />
        <main
          className="p-6 animate-fade-in"
          style={{ paddingTop: `calc(64px + 1.5rem)` }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
