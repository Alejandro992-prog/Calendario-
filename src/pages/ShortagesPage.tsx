import { useState, useEffect, useMemo } from 'react'
import { Plus, Filter, Search, RefreshCw, AlertTriangle, Trash2, User, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { StockShortage } from '@/types'
import ShortageForm from '@/components/shortages/ShortageForm'
import ShortageDetailModal from '@/components/shortages/ShortageDetailModal'
import toast from 'react-hot-toast'

type SortField = 'created_at' | 'urgencia' | 'categoria' | 'especificacion' | 'modelo' | 'estado' | 'reporter'
type SortDirection = 'asc' | 'desc'

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
  const [filterReporter, setFilterReporter] = useState('')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => { loadShortages() }, [])

  const loadShortages = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_shortages')
      .select(`
        *,
        reporter:profiles!reportado_por(nombre_completo, email, cargo, rol),
        manager:profiles!gestionado_por(nombre_completo, email)
      `)
      .order('created_at', { ascending: false })

    if (error) toast.error('Error al cargar faltas')
    setShortages((data || []) as StockShortage[])
    setLoading(false)
  }

  const updateStatus = async (id: string, estado: string) => {
    const { error } = await supabase
      .from('stock_shortages')
      .update({
        estado,
        gestionado_por: profile?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('Estado actualizado')
      window.dispatchEvent(new CustomEvent('garde_notification_update'))
      loadShortages()
    }
  }

  const deleteShortage = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('¿Seguro que deseas eliminar esta falta de stock?')) return
    const { error } = await supabase.from('stock_shortages').delete().eq('id', id)
    if (error) toast.error(`Error al eliminar: ${error.message}`)
    else {
      toast.success('Falta eliminada correctamente')
      loadShortages()
    }
  }

  // Unique list of employees who reported shortages + current user
  const reportersList = useMemo(() => {
    const map = new Map<string, string>()
    shortages.forEach((s) => {
      if (s.reportado_por && (s as any).reporter?.nombre_completo) {
        map.set(s.reportado_por, (s as any).reporter.nombre_completo)
      }
    })
    if (profile?.id && profile?.nombre_completo && !map.has(profile.id)) {
      map.set(profile.id, profile.nombre_completo)
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [shortages, profile])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      // When clicking date, default to 'desc' (most recent first); for others, default to 'asc'
      setSortDirection(field === 'created_at' ? 'desc' : 'asc')
    }
  }

  const handleSortPresetChange = (value: string) => {
    switch (value) {
      case 'date_desc':
        setSortField('created_at')
        setSortDirection('desc')
        break
      case 'date_asc':
        setSortField('created_at')
        setSortDirection('asc')
        break
      case 'urgency_desc':
        setSortField('urgencia')
        setSortDirection('asc') // Crítica is 0 (first)
        break
      case 'urgency_asc':
        setSortField('urgencia')
        setSortDirection('desc') // Baja is 3 (last)
        break
      case 'category_asc':
        setSortField('categoria')
        setSortDirection('asc')
        break
      case 'category_desc':
        setSortField('categoria')
        setSortDirection('desc')
        break
      case 'status_asc':
        setSortField('estado')
        setSortDirection('asc')
        break
      case 'reporter_asc':
        setSortField('reporter')
        setSortDirection('asc')
        break
    }
  }

  const currentSortPreset = useMemo(() => {
    if (sortField === 'created_at') return sortDirection === 'desc' ? 'date_desc' : 'date_asc'
    if (sortField === 'urgencia') return sortDirection === 'asc' ? 'urgency_desc' : 'urgency_asc'
    if (sortField === 'categoria') return sortDirection === 'asc' ? 'category_asc' : 'category_desc'
    if (sortField === 'estado') return 'status_asc'
    if (sortField === 'reporter') return 'reporter_asc'
    return ''
  }, [sortField, sortDirection])

  const filtered = useMemo(() => {
    return shortages
      .filter((s) => !filterStatus || s.estado === filterStatus)
      .filter((s) => !filterUrgency || s.urgencia === filterUrgency)
      .filter((s) => !filterCategory || s.categoria === filterCategory)
      .filter((s) => !filterReporter || s.reportado_por === filterReporter)
      .filter((s) => {
        if (!search) return true
        const q = search.toLowerCase()
        const repName = ((s as any).reporter?.nombre_completo || '').toLowerCase()
        return (
          s.categoria.toLowerCase().includes(q) ||
          (s.especificacion || '').toLowerCase().includes(q) ||
          (s.modelo || '').toLowerCase().includes(q) ||
          repName.includes(q)
        )
      })
      .sort((a, b) => {
        let comparison = 0
        if (sortField === 'created_at') {
          const timeA = new Date(a.created_at).getTime()
          const timeB = new Date(b.created_at).getTime()
          comparison = timeA - timeB
        } else if (sortField === 'urgencia') {
          comparison = (urgencyOrder[a.urgencia] ?? 99) - (urgencyOrder[b.urgencia] ?? 99)
        } else if (sortField === 'categoria') {
          comparison = a.categoria.localeCompare(b.categoria, 'es')
        } else if (sortField === 'especificacion') {
          comparison = (a.especificacion || '').localeCompare(b.especificacion || '', 'es')
        } else if (sortField === 'modelo') {
          comparison = (a.modelo || '').localeCompare(b.modelo || '', 'es')
        } else if (sortField === 'estado') {
          comparison = a.estado.localeCompare(b.estado, 'es')
        } else if (sortField === 'reporter') {
          const repA = (a as any).reporter?.nombre_completo || ''
          const repB = (b as any).reporter?.nombre_completo || ''
          comparison = repA.localeCompare(repB, 'es')
        }
        return sortDirection === 'asc' ? comparison : -comparison
      })
  }, [shortages, filterStatus, filterUrgency, filterCategory, filterReporter, search, sortField, sortDirection])

  const urgentCount = shortages.filter(
    (s) =>
      (s.urgencia === 'Alta' || s.urgencia === 'Crítica') &&
      !['Pedido', 'En Tránsito', 'Descartado'].includes(s.estado)
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
      <div className="flex flex-wrap gap-2.5 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Buscar modelo, categoría, empleado..."
            className="form-input pl-8 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="shortage-search"
          />
        </div>

        {/* Quick button "Solo mis demandas" */}
        {profile && (
          <button
            type="button"
            onClick={() => setFilterReporter(filterReporter === profile.id ? '' : profile.id)}
            className={`btn-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              filterReporter === profile.id
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/50 shadow-sm shadow-brand-500/20'
                : 'bg-surface-800 text-surface-400 border-surface-700 hover:text-surface-200 hover:border-surface-600'
            }`}
            id="btn-filter-my-shortages"
            title="Mostrar únicamente las faltas reportadas por mí"
          >
            <User size={13} />
            <span>Mis Demandas</span>
            {filterReporter === profile.id && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            )}
          </button>
        )}

        {/* Filter by Employee / Reporter */}
        <select
          className="form-select py-1.5 text-sm max-w-[200px]"
          value={filterReporter}
          onChange={(e) => setFilterReporter(e.target.value)}
          id="filter-reporter"
        >
          <option value="">Todos los empleados</option>
          {reportersList.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id === profile?.id ? `👤 ${r.nombre} (Tú)` : r.nombre}
            </option>
          ))}
        </select>

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

        {/* Ordenar por selector */}
        <select
          className="form-select py-1.5 text-sm bg-surface-800 border-surface-700 text-surface-200"
          value={currentSortPreset}
          onChange={(e) => handleSortPresetChange(e.target.value)}
          id="select-sort-shortages"
          title="Ordenar lista"
        >
          <option value="date_desc">📅 Fecha: Más recientes</option>
          <option value="date_asc">📅 Fecha: Más antiguas</option>
          <option value="urgency_desc">🚨 Urgencia: Mayor a menor</option>
          <option value="urgency_asc">🚨 Urgencia: Menor a mayor</option>
          <option value="category_asc">🏷️ Categoría (A-Z)</option>
          <option value="category_desc">🏷️ Categoría (Z-A)</option>
          <option value="status_asc">📊 Estado</option>
          <option value="reporter_asc">👤 Reportado por</option>
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
                <th
                  onClick={() => handleSort('urgencia')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por urgencia"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Urgencia</span>
                    {sortField === 'urgencia' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('categoria')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por categoría"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Categoría</span>
                    {sortField === 'categoria' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th>Especificación</th>
                <th
                  onClick={() => handleSort('modelo')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por modelo"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Modelo</span>
                    {sortField === 'modelo' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('estado')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por estado"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Estado</span>
                    {sortField === 'estado' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('reporter')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por persona que reportó"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Reportado por</span>
                    {sortField === 'reporter' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('created_at')}
                  className="cursor-pointer select-none transition-colors hover:text-brand-300"
                  title="Ordenar por fecha"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Fecha</span>
                    {sortField === 'created_at' ? (
                      sortDirection === 'asc' ? <ArrowUp size={13} className="text-brand-400" /> : <ArrowDown size={13} className="text-brand-400" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30 hover:opacity-100" />
                    )}
                  </div>
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const canDelete = profile?.rol === 'Administrador' || profile?.rol === 'Compras' || profile?.id === s.reportado_por
                return (
                  <tr key={s.id} onClick={() => setSelected(s)} className="cursor-pointer hover:bg-surface-800/80">
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
                    <td className="text-xs text-surface-400 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {canManage && (
                          <select
                            className="form-select py-1 text-xs"
                            value={s.estado}
                            onChange={(e) => updateStatus(s.id, e.target.value)}
                          >
                            {ESTADOS.map((e) => <option key={e}>{e}</option>)}
                          </select>
                        )}
                        {canDelete && (
                          <button
                            onClick={(e) => deleteShortage(s.id, e)}
                            className="p-1.5 text-surface-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Eliminar falta"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
