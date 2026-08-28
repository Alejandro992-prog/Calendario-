import { useState, useEffect } from 'react'
import { Plus, Filter, Search, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { StockShortage } from '@/types'
import ShortageForm from '@/components/shortages/ShortageForm'
import ShortageDetailModal from '@/components/shortages/ShortageDetailModal'
import toast from 'react-hot-toast'

const urgencyOrder: Record<string, number> = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 }

const urgencyClass: Record<string, string> = {
  Baja: 'badge-green', Media: 'badge-yellow', Alta: 'badge-red',
  Crítica: 'bg-red-600/30 text-red-300 border border-red-500/40 font-bold badge',
}

const statusClass: Record<string, string> = {
  Pendiente: 'badge-gray', Visto: 'badge-blue', 'En Revisión': 'badge-yellow',
  Pedido: 'badge-purple', 'En Tránsito': 'badge-cyan', Descartado: 'badge-red',
}

const CATEGORIAS = ['Frío', 'Lavado', 'Cocción', 'Lavavajillas', 'Imagen', 'Pequeño Electrodoméstico', 'Climatización', 'Otro']
const ESTADOS = ['Pendiente', 'Visto', 'En Revisión', 'Pedido', 'En Tránsito', 'Descartado']

export default function ShortagesPage() {
  const { profile } = useAuthStore()
  const canManage = profile?.rol === 'Administrador' || profile?.rol === 'Compras'

  const [shortages, setShortages] = useState<StockShortage[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<StockShortage | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterUrgency, setFilterUrgency] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { loadShortages() }, [])

  const loadShortages = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_shortages')
      .select(`
        *,
        reporter:profiles!reportado_por(nombre_completo, cargo, rol),
        manager:profiles!gestionado_por(nombre_completo)
      `)
      .order('created_at', { ascending: false })

    if (error) toast.error('Error al cargar faltas')
    setShortages((data || []) as StockShortage[])
    setLoading(false)
  }

  const updateStatus = async (id: string, estado: string) => {
    const { error } = await supabase
      .from('stock_shortages')
      .update({ estado, gestionado_por: profile?.id })
      .eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('Estado actualizado')
      loadShortages()
    }
  }

  const filtered = shortages
    .filter((s) => !filterStatus || s.estado === filterStatus)
    .filter((s) => !filterUrgency || s.urgencia === filterUrgency)
    .filter((s) => !filterCategory || s.categoria === filterCategory)
    .filter((s) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        s.categoria.toLowerCase().includes(q) ||
        (s.especificacion || '').toLowerCase().includes(q) ||
        (s.modelo || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (urgencyOrder[a.urgencia] ?? 99) - (urgencyOrder[b.urgencia] ?? 99))

  const urgentCount = shortages.filter(
    (s) => (s.urgencia === 'Alta' || s.urgencia === 'Crítica') && s.estado !== 'Descartado'
  ).length

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <AlertTriangle size={22} className="text-red-400" />
            Faltas y Peticiones
            {urgentCount > 0 && (
              <span className="badge bg-red-600/30 text-red-300 border border-red-500/40 text-xs">
                {urgentCount} urgente{urgentCount > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="page-subtitle">{filtered.length} de {shortages.length} registros</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          id="btn-new-shortage"
        >
          <Plus size={16} />
          Reportar Falta
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Buscar..."
            className="form-input pl-8 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="shortage-search"
          />
        </div>
        <select
          className="form-select py-1.5 text-sm"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          id="filter-category"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select
          className="form-select py-1.5 text-sm"
          value={filterUrgency}
          onChange={(e) => setFilterUrgency(e.target.value)}
          id="filter-urgency"
        >
          <option value="">Toda urgencia</option>
          <option>Crítica</option><option>Alta</option><option>Media</option><option>Baja</option>
        </select>
        <select
          className="form-select py-1.5 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          id="filter-status"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e}>{e}</option>)}
        </select>
        <button onClick={loadShortages} className="btn-ghost btn-icon btn-sm" title="Actualizar">
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
            <AlertTriangle size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No hay faltas con esos filtros</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Urgencia</th>
                <th>Categoría</th>
                <th>Especificación</th>
                <th>Modelo</th>
                <th>Estado</th>
                <th>Reportado por</th>
                <th>Fecha</th>
                {canManage && <th>Acción rápida</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)}>
                  <td>
                    <span className={urgencyClass[s.urgencia] || 'badge badge-gray'}>
                      {s.urgencia}
                    </span>
                  </td>
                  <td className="font-medium text-surface-100">{s.categoria}</td>
                  <td className="text-surface-400">{s.especificacion || '—'}</td>
                  <td className="font-mono text-brand-400">{s.modelo || '—'}</td>
                  <td>
                    <span className={`badge ${statusClass[s.estado] || 'badge-gray'}`}>
                      {s.estado}
                    </span>
                  </td>
                  <td>
                    <div>
                      <p className="text-sm text-surface-200">{(s as any).reporter?.nombre_completo || '—'}</p>
                      <p className="text-xs text-surface-500">{(s as any).reporter?.cargo || ''}</p>
                    </div>
                  </td>
                  <td className="text-xs text-surface-400">
                    {new Date(s.created_at).toLocaleDateString('es-ES')}
                  </td>
                  {canManage && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="form-select py-1 text-xs"
                        value={s.estado}
                        onChange={(e) => updateStatus(s.id, e.target.value)}
                      >
                        {ESTADOS.map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New shortage form modal */}
      {showForm && (
        <ShortageForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadShortages() }}
        />
      )}

      {/* Detail modal */}
      {selected && (
        <ShortageDetailModal
          shortage={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onUpdated={loadShortages}
        />
      )}
    </div>
  )
}
