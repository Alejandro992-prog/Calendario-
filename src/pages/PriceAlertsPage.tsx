import { useState, useEffect } from 'react'
import { Plus, Search, Filter, TrendingDown, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { supabase, getSignedUrl } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { PriceAlert } from '@/types'
import AlertForm from '@/components/price-alerts/AlertForm'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function PriceAlertsPage() {
  const { profile } = useAuthStore()
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCompetidor, setFilterCompetidor] = useState('')
  const [filterMarca, setFilterMarca] = useState('')

  useEffect(() => { loadAlerts() }, [])

  const loadAlerts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*, reporter:profiles!reportado_por(nombre_completo, cargo, rol)')
      .order('created_at', { ascending: false })
    if (error) toast.error('Error al cargar alertas')
    setAlerts((data || []) as PriceAlert[])
    setLoading(false)
  }

  const deleteAlert = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('¿Seguro que deseas eliminar esta alerta de precio?')) return
    const { error } = await supabase.from('price_alerts').delete().eq('id', id)
    if (error) toast.error(`Error al eliminar: ${error.message}`)
    else {
      toast.success('Alerta de precio eliminada')
      loadAlerts()
    }
  }

  const competitors = [...new Set(alerts.map((a) => a.competidor).filter(Boolean))]
  const brands = [...new Set(alerts.map((a) => a.marca).filter(Boolean))]

  const filtered = alerts
    .filter((a) => !filterCompetidor || a.competidor === filterCompetidor)
    .filter((a) => !filterMarca || a.marca === filterMarca)
    .filter((a) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        a.modelo.toLowerCase().includes(q) ||
        (a.competidor || '').toLowerCase().includes(q) ||
        (a.canal_tienda || '').toLowerCase().includes(q)
      )
    })

  const avgDiff = filtered
    .filter((a) => a.precio_detectado && a.precio_nuestro)
    .map((a) => ((a.precio_nuestro! - a.precio_detectado!) / a.precio_nuestro!) * 100)

  const avgDiffPct = avgDiff.length
    ? avgDiff.reduce((a, b) => a + b, 0) / avgDiff.length
    : null

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingDown size={22} className="text-cyan-400" />
            Alertas de Precios
          </h1>
          <p className="page-subtitle">{filtered.length} alertas registradas</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          id="btn-new-alert"
        >
          <Plus size={16} />
          Reportar Agresión de Precio
        </button>
      </div>

      {/* Stats */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-white">{alerts.length}</p>
            <p className="text-xs text-surface-400 mt-1">Total alertas</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-red-400">{competitors.length}</p>
            <p className="text-xs text-surface-400 mt-1">Competidores</p>
          </div>
          <div className="card text-center">
            {avgDiffPct !== null ? (
              <>
                <p className={`text-3xl font-bold ${avgDiffPct > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {avgDiffPct > 0 ? '+' : ''}{avgDiffPct.toFixed(1)}%
                </p>
                <p className="text-xs text-surface-400 mt-1">Diferencia media de precio</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-bold text-surface-500">—</p>
                <p className="text-xs text-surface-400 mt-1">Sin datos de precio</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Buscar modelo, competidor..."
            className="form-input pl-8 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="alert-search"
          />
        </div>
        <select
          className="form-select py-1.5 text-sm"
          value={filterMarca}
          onChange={(e) => setFilterMarca(e.target.value)}
          id="filter-marca"
        >
          <option value="">Todas las marcas</option>
          {brands.map((b) => <option key={b!}>{b}</option>)}
        </select>
        <select
          className="form-select py-1.5 text-sm"
          value={filterCompetidor}
          onChange={(e) => setFilterCompetidor(e.target.value)}
          id="filter-competidor"
        >
          <option value="">Todos los competidores</option>
          {competitors.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button onClick={loadAlerts} className="btn-ghost btn-icon btn-sm">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-surface-500">
            <TrendingDown size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No hay alertas registradas</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Marca</th>
                <th>Competidor</th>
                <th className="text-right">Precio detectado</th>
                <th className="text-right">Precio nuestro</th>
                <th className="text-right">Diferencia</th>
                <th>Canal/Tienda</th>
                <th>Captura</th>
                <th>Reportado por</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const diff = a.precio_detectado && a.precio_nuestro
                  ? ((a.precio_nuestro - a.precio_detectado) / a.precio_nuestro * 100)
                  : null
                const canDelete = profile?.rol === 'Administrador' || profile?.rol === 'Compras' || profile?.id === a.reportado_por

                return (
                  <tr key={a.id}>
                    <td className="font-mono text-brand-400 font-semibold">{a.modelo}</td>
                    <td className="text-surface-300">{a.marca || '—'}</td>
                    <td className="font-medium text-surface-100">{a.competidor}</td>
                    <td className="text-right text-red-400 font-semibold">
                      {a.precio_detectado ? `${a.precio_detectado.toFixed(2)} €` : '—'}
                    </td>
                    <td className="text-right text-surface-300">
                      {a.precio_nuestro ? `${a.precio_nuestro.toFixed(2)} €` : '—'}
                    </td>
                    <td className="text-right">
                      {diff !== null ? (
                        <span className={`font-semibold ${diff < 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-surface-400 text-xs">{a.canal_tienda || '—'}</td>
                    <td>
                      {a.captura_url ? (
                        <a
                          href={a.captura_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={12} /> Ver
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <div>
                        <p className="text-sm text-surface-200">{(a as any).reporter?.nombre_completo || '—'}</p>
                        <p className="text-xs text-surface-500">{(a as any).reporter?.cargo || ''}</p>
                      </div>
                    </td>
                    <td className="text-xs text-surface-400">
                      {format(new Date(a.created_at), 'dd/MM/yyyy', { locale: es })}
                    </td>
                    <td>
                      {canDelete && (
                        <button
                          onClick={(e) => deleteAlert(a.id, e)}
                          className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Eliminar alerta"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <AlertForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadAlerts() }}
        />
      )}
    </div>
  )
}
