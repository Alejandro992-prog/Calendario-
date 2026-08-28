import { useEffect, useState } from 'react'
import { Truck, Package, TrendingDown, AlertTriangle, Calendar, ArrowRight, CheckCircle2, Clock, Loader } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { format, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'

const statusIcon: Record<string, React.ReactNode> = {
  Programada:  <Clock size={14} className="text-blue-400" />,
  'En muelle': <Loader size={14} className="text-yellow-400" />,
  Descargada:  <CheckCircle2 size={14} className="text-green-400" />,
}

const urgencyBadge: Record<string, string> = {
  Crítica: 'urgency-Crítica',
  Alta: 'urgency-Alta',
  Media: 'urgency-Media',
  Baja: 'urgency-Baja',
}

function formatDeliveryDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  if (isToday(d)) return '🟢 Hoy'
  if (isTomorrow(d)) return '🟡 Mañana'
  return format(d, "EEEE d 'de' MMMM", { locale: es })
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [shortages, setShortages] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    // Real Supabase queries
    const [dRes, sRes, aRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select('*, supplier:suppliers(nombre), items:delivery_items(count)')
        .in('estado', ['Programada', 'En muelle'])
        .gte('fecha_prevista', new Date().toISOString().split('T')[0])
        .order('fecha_prevista')
        .limit(5),
      supabase
        .from('stock_shortages')
        .select('*, reporter:profiles!reportado_por(nombre_completo, cargo, rol)')
        .not('estado', 'in', '(Descartado,Pedido,En Tránsito)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('price_alerts')
        .select('*, reporter:profiles!reportado_por(nombre_completo)')
        .order('created_at', { ascending: false })
        .limit(4),
    ])
    setDeliveries(dRes.data || [])
    setShortages(sRes.data || [])
    setAlerts(aRes.data || [])
    setLoading(false)
  }

  // Stats
  const pendingDeliveries = deliveries.filter((d) => d.estado !== 'Descargada').length
  const todayDeliveries = deliveries.filter((d) => d.fecha_prevista === new Date().toISOString().split('T')[0]).length
  const criticalShortages = shortages.filter((s) => s.urgencia === 'Crítica' || s.urgencia === 'Alta').length
  const openShortages = shortages.filter((s) => s.estado === 'Pendiente' || s.estado === 'Visto').length

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', margin: 0 }}>
            Buenas, <span className="text-gradient">{profile?.nombre_completo?.split(' ')[0]}</span> 👋
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {[
          {
            icon: <Truck size={20} />,
            iconBg: 'rgba(59,130,246,0.15)',
            iconColor: '#60a5fa',
            value: pendingDeliveries,
            label: 'Descargas pendientes',
            sub: todayDeliveries > 0 ? `${todayDeliveries} hoy` : 'Ninguna hoy',
            subColor: todayDeliveries > 0 ? '#4ade80' : '#64748b',
            link: '/calendar',
          },
          {
            icon: <Package size={20} />,
            iconBg: 'rgba(239,68,68,0.15)',
            iconColor: '#f87171',
            value: openShortages,
            label: 'Faltas sin gestionar',
            sub: criticalShortages > 0 ? `${criticalShortages} urgentes` : 'Sin urgencias',
            subColor: criticalShortages > 0 ? '#f87171' : '#64748b',
            link: '/shortages',
          },
          {
            icon: <TrendingDown size={20} />,
            iconBg: 'rgba(6,182,212,0.15)',
            iconColor: '#22d3ee',
            value: alerts.length,
            label: 'Alertas de precio',
            sub: 'Últimos 30 días',
            subColor: '#64748b',
            link: '/price-alerts',
          },
          {
            icon: <AlertTriangle size={20} />,
            iconBg: 'rgba(168,85,247,0.15)',
            iconColor: '#c084fc',
            value: shortages.filter((s) => s.urgencia === 'Crítica').length,
            label: 'Faltas críticas',
            sub: 'Atención inmediata',
            subColor: shortages.filter((s) => s.urgencia === 'Crítica').length > 0 ? '#f87171' : '#64748b',
            link: '/shortages',
          },
        ].map((kpi, i) => (
          <Link key={i} to={kpi.link} style={{ textDecoration: 'none' }}>
            <div className="card" style={{
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '1rem',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#475569')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#334155')}
            >
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: kpi.iconBg, color: kpi.iconColor, flexShrink: 0,
              }}>
                {kpi.icon}
              </div>
              <div>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: 'white', margin: 0, lineHeight: 1 }}>{kpi.value}</p>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0.125rem 0' }}>{kpi.label}</p>
                <p style={{ fontSize: '0.7rem', color: kpi.subColor, margin: 0 }}>{kpi.sub}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Upcoming deliveries */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155' }}>
            <div className="card-title">
              <Truck size={16} className="text-blue-400" />
              Próximas descargas
            </div>
            <Link to="/calendar" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none' }}>
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Cargando...</div>
          ) : deliveries.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <Truck size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Sin descargas próximas</p>
            </div>
          ) : (
            <div>
              {deliveries.slice(0, 5).map((d: any) => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.875rem 1.25rem', borderBottom: '1px solid rgba(51,65,85,0.4)',
                }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                    background: d.estado === 'Programada' ? '#3b82f6' : d.estado === 'En muelle' ? '#f59e0b' : '#22c55e',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.supplier?.nombre || 'Sin proveedor'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.725rem', color: '#64748b' }}>
                      {d.referencia} · {d.franja_horaria || 'Sin franja'}
                      {d.items?.[0]?.count && ` · ${d.items[0].count} artículos`}
                    </p>
                  </div>
                  <span style={{ fontSize: '0.725rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {formatDeliveryDate(d.fecha_prevista)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Urgent shortages */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155' }}>
            <div className="card-title">
              <Package size={16} className="text-red-400" />
              Faltas pendientes
            </div>
            <Link to="/shortages" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none' }}>
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Cargando...</div>
          ) : shortages.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <Package size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Sin faltas pendientes</p>
            </div>
          ) : (
            <div>
              {shortages.slice(0, 5).map((s: any) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.875rem 1.25rem', borderBottom: '1px solid rgba(51,65,85,0.4)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#f1f5f9' }}>{s.categoria}</span>
                      {s.especificacion && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>· {s.especificacion}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {s.reporter?.nombre_completo || '—'} · {s.estado}
                    </span>
                  </div>
                  <span className={urgencyBadge[s.urgencia] || 'badge badge-gray'}>{s.urgencia}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent price alerts */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155' }}>
          <div className="card-title">
            <TrendingDown size={16} className="text-cyan-400" />
            Alertas de precio recientes
          </div>
          <Link to="/price-alerts" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none' }}>
            Ver historial <ArrowRight size={12} />
          </Link>
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Cargando...</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            <TrendingDown size={28} style={{ opacity: 0.2, display: 'block', margin: '0 auto 0.5rem' }} />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>Sin alertas recientes</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {alerts.map((a: any) => {
              const diff = a.precio_detectado && a.precio_nuestro
                ? ((a.precio_nuestro - a.precio_detectado) / a.precio_nuestro * 100)
                : null
              return (
                <div key={a.id} style={{
                  padding: '1rem 1.25rem', borderBottom: '1px solid rgba(51,65,85,0.3)',
                  borderRight: '1px solid rgba(51,65,85,0.3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#60a5fa', fontWeight: 600 }}>{a.modelo}</span>
                    {diff !== null && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: diff < 0 ? '#f87171' : '#4ade80' }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{a.competidor}</p>
                  {a.precio_detectado && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#f87171', fontWeight: 500 }}>
                      Detectado: {a.precio_detectado}€
                      {a.precio_nuestro && <span style={{ color: '#64748b' }}> · Nuestro: {a.precio_nuestro}€</span>}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
