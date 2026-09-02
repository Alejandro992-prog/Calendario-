import { useState } from 'react'
import {
  TrendingUp,
  Target,
  Edit2,
  Trash2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { SupplierTarget } from '@/types'
import {
  calculateTargetMetrics,
  formatCurrency,
  formatPercent,
} from '@/lib/targetCalculations'

interface TargetCardProps {
  target: SupplierTarget
  onEdit: (target: SupplierTarget) => void
  onDelete: (id: string) => void
  onOpenUpdateConsumption: (target: SupplierTarget) => void
}

export default function TargetCard({
  target,
  onEdit,
  onDelete,
  onOpenUpdateConsumption,
}: TargetCardProps) {
  const metrics = calculateTargetMetrics(target)

  // Configuración de estilo según el estado de la proyección (semáforo)
  const statusConfig = {
    conseguido: {
      label: 'Meta Conseguida',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: <CheckCircle2 size={13} className="text-emerald-400" />,
      barColor: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    },
    en_ritmo: {
      label: 'En Ritmo Anual',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: <TrendingUp size={13} className="text-blue-400" />,
      barColor: 'bg-gradient-to-r from-brand-500 to-cyan-400',
    },
    en_riesgo: {
      label: 'En Riesgo Moderado',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: <Clock size={13} className="text-amber-400" />,
      barColor: 'bg-gradient-to-r from-amber-500 to-orange-400',
    },
    lejos: {
      label: 'Por Debajo de Ritmo',
      badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
      icon: <AlertTriangle size={13} className="text-red-400" />,
      barColor: 'bg-gradient-to-r from-red-500 to-rose-400',
    },
  }[metrics.estadoProyeccion]

  const renderAgreementBadge = () => {
    if (target.tipo_acuerdo === 'campana') {
      const cat = target.categoria_campana || 'Otro'
      const iconMap: Record<string, string> = {
        Frío: '❄️',
        Secado: '🌀',
        Cocción: '🔥',
        Lavado: '🧼',
        Climatización: '💨',
        Otro: '🎯',
      }
      return (
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/15 text-cyan-300 font-semibold flex items-center gap-1">
          <span>{iconMap[cat] || '🎯'}</span>
          <span>Campaña {cat}</span>
        </span>
      )
    }

    if (target.tipo_acuerdo === 'trimestral') {
      return (
        <span className="text-[11px] px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/15 text-purple-300 font-semibold flex items-center gap-1">
          <span>📅</span>
          <span>Rappel {target.trimestre || 'Trimestral'}</span>
        </span>
      )
    }

    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full border border-brand-500/30 bg-brand-500/15 text-brand-300 font-semibold flex items-center gap-1">
        <span>🏆</span>
        <span>Anual Global</span>
      </span>
    )
  }

  return (
    <div className="card hover:border-surface-600 transition-all duration-200 flex flex-col justify-between overflow-hidden relative">
      {/* Top Background Glow Accent */}
      <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-brand-500/5 blur-3xl pointer-events-none" />

      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-surface-700/80">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-surface-700 text-surface-200">
                {target.ejercicio}
              </span>
              {renderAgreementBadge()}
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${statusConfig.badgeClass}`}
              >
                {statusConfig.icon}
                {statusConfig.label}
              </span>
            </div>
            <h3 className="text-base font-bold text-white truncate" title={target.proveedor_nombre}>
              {target.proveedor_nombre}
            </h3>
            {(target.nombre_campana || target.periodo_descripcion) && (
              <p className="text-xs text-brand-300/90 font-medium truncate mt-0.5">
                {target.nombre_campana}
                {target.nombre_campana && target.periodo_descripcion ? ' • ' : ''}
                {target.periodo_descripcion && (
                  <span className="text-surface-400 font-normal">({target.periodo_descripcion})</span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(target)}
              className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-700 transition-colors"
              title="Editar acuerdo y tramos"
            >
              <Edit2 size={15} />
            </button>
            <button
              onClick={() => onDelete(target.id)}
              className="p-1.5 text-surface-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              title="Eliminar acuerdo"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Cifras Principales */}
        <div className="grid grid-cols-2 gap-3 py-3.5 border-b border-surface-700/50">
          <div>
            <span className="text-[11px] font-medium text-surface-400 block">Consumo Acumulado</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold font-mono text-white">
                {formatCurrency(metrics.consumoActual)}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-medium text-surface-400 block">Rappel Devengado Hoy</span>
            <div className="flex items-baseline justify-end gap-1.5 mt-0.5">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {formatCurrency(metrics.rapelDevengadoEuros)}
              </span>
              {metrics.porcentajeRapelActual > 0 && (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  {formatPercent(metrics.porcentajeRapelActual)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tramos y Barra de Progreso */}
        <div className="py-3.5 space-y-2 border-b border-surface-700/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-surface-400">Progreso de Tramos:</span>
            <span className="font-mono text-surface-200">
              {metrics.tramoActual ? (
                <>
                  Tramo conseguido: <strong className="text-emerald-400">{formatPercent(metrics.porcentajeRapelActual)}</strong>
                </>
              ) : (
                'Pendiente de 1er tramo'
              )}
            </span>
          </div>

          {/* Barra */}
          <div className="w-full h-2.5 bg-surface-800 rounded-full overflow-hidden border border-surface-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${statusConfig.barColor}`}
              style={{ width: `${Math.max(4, Math.min(100, metrics.porcentajeAlcanzado))}%` }}
            />
          </div>

          {/* Desglose de tramos pactados */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {(target.tramos || []).map((t, idx) => {
              const isAchieved = metrics.consumoActual >= t.desde_euros
              const isCurrentNext = metrics.proximoTramo?.desde_euros === t.desde_euros
              return (
                <div
                  key={idx}
                  className={`p-1.5 rounded-lg text-center border text-[11px] transition-all ${
                    isAchieved
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : isCurrentNext
                      ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 font-semibold ring-1 ring-brand-500/30'
                      : 'bg-surface-800/50 border-surface-700 text-surface-400'
                  }`}
                >
                  <span className="block font-mono font-bold">
                    {formatPercent(t.porcentaje_rapel)}
                  </span>
                  <span className="text-[10px] block opacity-80 font-mono">
                    ≥ {formatCurrency(t.desde_euros)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Próximo Escalón / Objetivo */}
          {metrics.proximoTramo ? (
            <div className="p-2.5 rounded-lg bg-surface-800/80 border border-surface-700/60 flex items-center justify-between text-xs mt-2">
              <span className="text-surface-400 flex items-center gap-1.5">
                <Target size={13} className="text-brand-400" />
                Para saltar al <strong>{formatPercent(metrics.proximoTramo.porcentaje_rapel)}</strong>:
              </span>
              <span className="text-brand-300 font-mono font-bold">
                faltan {formatCurrency(metrics.faltaParaProximoTramo)}
              </span>
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs text-center font-medium">
              ¡Máximo tramo pactado conseguido! ({formatPercent(metrics.porcentajeRapelActual)})
            </div>
          )}
        </div>

        {/* Sección Run-Rate (Proyección a 31 de Diciembre) */}
        <div className="py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-surface-400 font-medium">Proyección Run-Rate anual:</span>
            <span className="font-mono font-bold text-white">
              {formatCurrency(metrics.proyeccionFinDeAno)}
            </span>
          </div>

          <div className="text-[11px] text-surface-400 leading-relaxed space-y-1">
            <div className="flex items-center justify-between">
              <span>Ritmo compras actual:</span>
              <span className="font-mono text-surface-300">
                {formatCurrency(metrics.ritmoDiarioActual)} / día
              </span>
            </div>
            {metrics.diasRestantes > 0 && metrics.faltaParaProximoTramo > 0 && (
              <div className="flex items-center justify-between text-surface-400">
                <span>Necesario para próximo tramo:</span>
                <span className="font-mono text-amber-300 font-medium">
                  {formatCurrency(metrics.ritmoDiarioNecesario)} / día ({metrics.diasRestantes} días)
                </span>
              </div>
            )}
          </div>

          {target.notas && (
            <p className="text-[11px] text-surface-400 italic bg-surface-800/40 p-2 rounded border border-surface-700/50 line-clamp-2 mt-2">
              "{target.notas}"
            </p>
          )}
        </div>
      </div>

      {/* Action button */}
      <div className="pt-3 border-t border-surface-700/70">
        <button
          onClick={() => onOpenUpdateConsumption(target)}
          className="btn-secondary w-full justify-center text-xs py-2 hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-300 transition-all font-semibold flex items-center gap-1.5"
        >
          <Zap size={14} className="text-brand-400" />
          Actualizar Consumo Compras
        </button>
      </div>
    </div>
  )
}
