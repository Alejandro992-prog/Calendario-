import { useState, useEffect, useMemo } from 'react'
import {
  Target,
  Plus,
  Search,
  RefreshCw,
  TrendingUp,
  Euro,
  CheckCircle2,
  AlertTriangle,
  Clock,
  LayoutGrid,
  Table as TableIcon,
  ShieldAlert,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { SupplierTarget } from '@/types'
import {
  getSupplierTargets,
  saveSupplierTarget,
  updateTargetConsumption,
  deleteSupplierTarget,
} from '@/lib/targetsService'
import {
  calculateTargetMetrics,
  formatCurrency,
  formatPercent,
} from '@/lib/targetCalculations'
import TargetCard from '@/components/targets/TargetCard'
import TargetModal from '@/components/targets/TargetModal'
import UpdateConsumptionModal from '@/components/targets/UpdateConsumptionModal'
import toast from 'react-hot-toast'

export default function TargetsPage() {
  const { profile } = useAuthStore()
  const currentYear = new Date().getFullYear()

  const [targets, setTargets] = useState<SupplierTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Modales
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [editingTarget, setEditingTarget] = useState<SupplierTarget | null>(null)
  const [consumptionModalTarget, setConsumptionModalTarget] = useState<SupplierTarget | null>(null)

  useEffect(() => {
    loadTargets()
  }, [selectedYear])

  const loadTargets = async () => {
    setLoading(true)
    try {
      const data = await getSupplierTargets(selectedYear)
      setTargets(data)
    } catch (err) {
      toast.error('Error al cargar objetivos')
    } finally {
      setLoading(false)
    }
  }

  // Cálculos globales agregados
  const summary = useMemo(() => {
    let totalConsumo = 0
    let totalRapel = 0
    let totalProyeccion = 0
    let countEnRitmo = 0
    let countEnRiesgo = 0
    let countLejos = 0

    targets.forEach((t) => {
      const m = calculateTargetMetrics(t)
      totalConsumo += m.consumoActual
      totalRapel += m.rapelDevengadoEuros
      totalProyeccion += m.proyeccionFinDeAno
      if (m.estadoProyeccion === 'en_ritmo' || m.estadoProyeccion === 'conseguido') countEnRitmo++
      else if (m.estadoProyeccion === 'en_riesgo') countEnRiesgo++
      else countLejos++
    })

    return {
      totalConsumo,
      totalRapel,
      totalProyeccion,
      countEnRitmo,
      countEnRiesgo,
      countLejos,
    }
  }, [targets])

  // Filtrado de lista
  const filteredTargets = useMemo(() => {
    return targets
      .filter((t) => {
        if (!search) return true
        return t.proveedor_nombre.toLowerCase().includes(search.toLowerCase())
      })
      .filter((t) => {
        if (!statusFilter) return true
        const m = calculateTargetMetrics(t)
        return m.estadoProyeccion === statusFilter
      })
  }, [targets, search, statusFilter])

  // Handlers
  const handleSaveTarget = async (targetData: Partial<SupplierTarget>) => {
    await saveSupplierTarget(targetData)
    loadTargets()
  }

  const handleUpdateConsumption = async (nuevoConsumo: number) => {
    if (!consumptionModalTarget) return
    await updateTargetConsumption(consumptionModalTarget.id, nuevoConsumo)
    loadTargets()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Deseas eliminar este acuerdo de objetivos y rappel?')) return
    await deleteSupplierTarget(id)
    toast.success('Acuerdo eliminado')
    loadTargets()
  }

  // Comprobación de seguridad adicional en vista
  if (profile && profile.rol !== 'Administrador') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert size={48} className="text-red-400 mb-3" />
        <h2 className="text-lg font-bold text-white">Acceso Restringido a Dirección</h2>
        <p className="text-sm text-surface-400 mt-1 max-w-md">
          Este módulo contiene acuerdos comerciales confidenciales y solo es accesible para usuarios con rol de Administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <Target size={24} className="text-brand-400" />
            Objetivos y Rappels Anuales
            <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-semibold">
              Exclusivo Dirección
            </span>
          </h1>
          <p className="page-subtitle">
            Seguimiento de acuerdos de compras por marca, tramos pactados y proyección a fin de año (Run-Rate)
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Selector de año de ejercicio */}
          <div className="flex items-center rounded-xl bg-surface-800 border border-surface-700 p-1">
            {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all ${
                  selectedYear === year
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setEditingTarget(null)
              setShowTargetModal(true)
            }}
            className="btn-primary text-sm"
            id="btn-new-target"
          >
            <Plus size={16} />
            Nuevo Acuerdo
          </button>
        </div>
      </div>

      {/* Global Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Consumo */}
        <div className="card p-4 bg-gradient-to-br from-surface-800/90 to-surface-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-400">Compras Acumuladas ({selectedYear})</span>
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
              <Euro size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-2">
            {formatCurrency(summary.totalConsumo)}
          </p>
          <span className="text-[11px] text-surface-500 block mt-1">
            En {targets.length} marca{targets.length === 1 ? '' : 's'} con acuerdo
          </span>
        </div>

        {/* Rappel Total Devengado */}
        <div className="card p-4 bg-gradient-to-br from-surface-800/90 to-surface-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-400">Rappel Devengado a Hoy</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            {formatCurrency(summary.totalRapel)}
          </p>
          <span className="text-[11px] text-surface-500 block mt-1">
            Bonificación conseguida según tramos actuales
          </span>
        </div>

        {/* Proyección Run-Rate a 31 de Diciembre */}
        <div className="card p-4 bg-gradient-to-br from-surface-800/90 to-surface-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-400">Proyección Fin de Año</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Clock size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-cyan-300 mt-2">
            {formatCurrency(summary.totalProyeccion)}
          </p>
          <span className="text-[11px] text-surface-500 block mt-1">
            Estimación a 31 dic. según ritmo diario actual
          </span>
        </div>

        {/* Semáforo de Acuerdos */}
        <div className="card p-4 bg-gradient-to-br from-surface-800/90 to-surface-800/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-400">Salud de Objetivos</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Target size={16} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-bold text-white">{summary.countEnRitmo}</span>
              <span className="text-surface-400 text-[10px]">ok</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="font-bold text-white">{summary.countEnRiesgo}</span>
              <span className="text-surface-400 text-[10px]">riesgo</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="font-bold text-white">{summary.countLejos}</span>
              <span className="text-surface-400 text-[10px]">lejos</span>
            </div>
          </div>
          <span className="text-[11px] text-surface-500 block mt-1.5">
            Ritmo según avance del calendario anual
          </span>
        </div>
      </div>

      {/* Filters Bar & View Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap flex-1">
          {/* Search */}
          <div className="relative min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              type="text"
              placeholder="Buscar marca o proveedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-8 py-1.5 text-sm w-full"
            />
          </div>

          {/* Filter Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select py-1.5 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="en_ritmo">🟢 En ritmo / Conseguido</option>
            <option value="en_riesgo">🟡 En riesgo moderado</option>
            <option value="lejos">🔴 Por debajo de ritmo</option>
          </select>

          <button
            onClick={loadTargets}
            className="btn-ghost btn-icon btn-sm"
            title="Refrescar datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-surface-800 border border-surface-700 rounded-lg p-0.5 self-end sm:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid' ? 'bg-brand-500/20 text-brand-300' : 'text-surface-400 hover:text-white'
            }`}
            title="Vista en tarjetas"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'table' ? 'bg-brand-500/20 text-brand-300' : 'text-surface-400 hover:text-white'
            }`}
            title="Vista en tabla comparativa"
          >
            <TableIcon size={16} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : filteredTargets.length === 0 ? (
        <div className="card text-center py-16 px-4">
          <Target size={40} className="mx-auto text-surface-600 mb-3" />
          <h3 className="text-base font-semibold text-surface-200">No hay acuerdos con los filtros seleccionados</h3>
          <p className="text-sm text-surface-400 mt-1 max-w-sm mx-auto">
            Puedes dar de alta los acuerdos anuales negociados a primeros de año con el botón "Nuevo Acuerdo".
          </p>
          <button
            onClick={() => {
              setEditingTarget(null)
              setShowTargetModal(true)
            }}
            className="btn-primary text-sm mt-4 inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Crear Acuerdo {selectedYear}
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTargets.map((target) => (
            <TargetCard
              key={target.id}
              target={target}
              onEdit={(t) => {
                setEditingTarget(t)
                setShowTargetModal(true)
              }}
              onDelete={handleDelete}
              onOpenUpdateConsumption={(t) => setConsumptionModalTarget(t)}
            />
          ))}
        </div>
      ) : (
        /* Vista de Tabla Comparativa */
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Proveedor / Marca</th>
                <th>Consumo Acumulado</th>
                <th>Tramo Actual</th>
                <th>Rappel Hoy</th>
                <th>Próximo Escalón</th>
                <th>Falta para Meta</th>
                <th>Proyección 31 Dic</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTargets.map((target) => {
                const m = calculateTargetMetrics(target)
                return (
                  <tr key={target.id}>
                    <td className="font-bold text-white">
                      {target.proveedor_nombre}
                    </td>
                    <td className="font-mono text-brand-300 font-bold">
                      {formatCurrency(m.consumoActual)}
                    </td>
                    <td>
                      {m.tramoActual ? (
                        <span className="badge badge-green font-mono">
                          {formatPercent(m.porcentajeRapelActual)}
                        </span>
                      ) : (
                        <span className="text-surface-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="font-mono text-emerald-400 font-bold">
                      {formatCurrency(m.rapelDevengadoEuros)}
                    </td>
                    <td>
                      {m.proximoTramo ? (
                        <span className="text-xs font-mono text-surface-200">
                          {formatPercent(m.proximoTramo.porcentaje_rapel)} (≥ {formatCurrency(m.proximoTramo.desde_euros)})
                        </span>
                      ) : (
                        <span className="badge badge-purple text-[10px]">Máximo</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {m.faltaParaProximoTramo > 0 ? (
                        <span className="text-amber-300 font-medium">
                          {formatCurrency(m.faltaParaProximoTramo)}
                        </span>
                      ) : (
                        <span className="text-emerald-400">0 €</span>
                      )}
                    </td>
                    <td className="font-mono text-surface-200 text-xs">
                      {formatCurrency(m.proyeccionFinDeAno)}
                    </td>
                    <td>
                      <span
                        className={`badge text-[10px] ${
                          m.estadoProyeccion === 'en_ritmo' || m.estadoProyeccion === 'conseguido'
                            ? 'badge-green'
                            : m.estadoProyeccion === 'en_riesgo'
                            ? 'badge-yellow'
                            : 'badge-red'
                        }`}
                      >
                        {m.estadoProyeccion === 'conseguido'
                          ? 'Conseguido'
                          : m.estadoProyeccion === 'en_ritmo'
                          ? 'En ritmo'
                          : m.estadoProyeccion === 'en_riesgo'
                          ? 'En riesgo'
                          : 'Lejos'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setConsumptionModalTarget(target)}
                          className="btn-sm bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 rounded-lg text-xs py-1 px-2 font-medium"
                          title="Actualizar consumo"
                        >
                          Consumo
                        </button>
                        <button
                          onClick={() => {
                            setEditingTarget(target)
                            setShowTargetModal(true)
                          }}
                          className="p-1.5 text-surface-400 hover:text-white rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Target size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nuevo / Editar Acuerdo */}
      {showTargetModal && (
        <TargetModal
          target={editingTarget}
          onClose={() => {
            setShowTargetModal(false)
            setEditingTarget(null)
          }}
          onSaved={handleSaveTarget}
        />
      )}

      {/* Modal Rápido de Actualización de Consumo */}
      {consumptionModalTarget && (
        <UpdateConsumptionModal
          target={consumptionModalTarget}
          onClose={() => setConsumptionModalTarget(null)}
          onSaved={handleUpdateConsumption}
        />
      )}
    </div>
  )
}
