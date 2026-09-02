import type { SupplierTarget, RappelTier } from '@/types'

export interface TargetAnalysis {
  consumoActual: number
  objetivoPrincipal: number
  porcentajeAlcanzado: number // % sobre objetivo principal
  tramoActual: RappelTier | null
  proximoTramo: RappelTier | null
  porcentajeRapelActual: number
  rapelDevengadoEuros: number
  faltaParaProximoTramo: number
  rapelProximoTramoEuros: number
  gananciaExtraProximoTramo: number

  // Run-rate & Proyección
  diasTranscurridos: number
  diasRestantes: number
  ritmoDiarioActual: number
  proyeccionFinDeAno: number
  ritmoDiarioNecesario: number
  estadoProyeccion: 'conseguido' | 'en_ritmo' | 'en_riesgo' | 'lejos'
  porcentajeProyeccionVsObjetivo: number
}

/**
 * Retorna el día del año actual (1-366)
 */
export function getDayOfYear(date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}

/**
 * Retorna si un año es bisiesto
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Calcula todas las métricas de rappel y run-rate para un objetivo
 */
export function calculateTargetMetrics(target: SupplierTarget, currentDate = new Date()): TargetAnalysis {
  const consumoActual = Number(target.consumo_actual) || 0
  
  // Ordenar tramos por umbral ascendente
  const tramosOrdenados = [...(target.tramos || [])].sort(
    (a, b) => Number(a.desde_euros) - Number(b.desde_euros)
  )

  // Objetivo principal (el tramo más alto o el primer tramo si solo hay uno)
  const objetivoPrincipal = tramosOrdenados.length > 0 
    ? Number(tramosOrdenados[tramosOrdenados.length - 1].desde_euros)
    : 0

  // Tramo alcanzado actualmente
  let tramoActual: RappelTier | null = null
  for (const tramo of tramosOrdenados) {
    if (consumoActual >= Number(tramo.desde_euros)) {
      tramoActual = tramo
    }
  }

  // Próximo tramo a alcanzar
  const proximoTramo = tramosOrdenados.find(
    (tramo) => consumoActual < Number(tramo.desde_euros)
  ) || null

  const porcentajeRapelActual = tramoActual ? Number(tramoActual.porcentaje_rapel) : 0
  const rapelDevengadoEuros = consumoActual * (porcentajeRapelActual / 100)

  const faltaParaProximoTramo = proximoTramo
    ? Math.max(0, Number(proximoTramo.desde_euros) - consumoActual)
    : 0

  const rapelProximoTramoEuros = proximoTramo
    ? Number(proximoTramo.desde_euros) * (Number(proximoTramo.porcentaje_rapel) / 100)
    : 0

  const gananciaExtraProximoTramo = proximoTramo
    ? Math.max(0, rapelProximoTramoEuros - rapelDevengadoEuros)
    : 0

  const porcentajeAlcanzado = objetivoPrincipal > 0
    ? Math.min(100, (consumoActual / objetivoPrincipal) * 100)
    : 0

  // -------------------------------------------------------------
  // Proyección a Fin de Año (Run-Rate)
  // -------------------------------------------------------------
  const ejercicio = target.ejercicio || currentDate.getFullYear()
  const totalDiasAno = isLeapYear(ejercicio) ? 366 : 365

  let diasTranscurridos: number
  let diasRestantes: number

  if (ejercicio === currentDate.getFullYear()) {
    diasTranscurridos = Math.max(1, getDayOfYear(currentDate))
    diasRestantes = Math.max(0, totalDiasAno - diasTranscurridos)
  } else if (ejercicio < currentDate.getFullYear()) {
    // Ejercicio pasado: año completo finalizado
    diasTranscurridos = totalDiasAno
    diasRestantes = 0
  } else {
    // Ejercicio futuro aún no iniciado
    diasTranscurridos = 1
    diasRestantes = totalDiasAno
  }

  const ritmoDiarioActual = diasTranscurridos > 0 ? consumoActual / diasTranscurridos : 0
  const proyeccionFinDeAno = ritmoDiarioActual * totalDiasAno

  const targetAAlcanzar = proximoTramo ? Number(proximoTramo.desde_euros) : objetivoPrincipal
  const faltaParaMeta = Math.max(0, targetAAlcanzar - consumoActual)
  const ritmoDiarioNecesario = diasRestantes > 0 ? faltaParaMeta / diasRestantes : 0

  const porcentajeProyeccionVsObjetivo = targetAAlcanzar > 0
    ? (proyeccionFinDeAno / targetAAlcanzar) * 100
    : 100

  let estadoProyeccion: 'conseguido' | 'en_ritmo' | 'en_riesgo' | 'lejos' = 'en_ritmo'

  if (faltaParaMeta <= 0) {
    estadoProyeccion = 'conseguido'
  } else if (proyeccionFinDeAno >= targetAAlcanzar) {
    estadoProyeccion = 'en_ritmo'
  } else if (proyeccionFinDeAno >= targetAAlcanzar * 0.90) {
    estadoProyeccion = 'en_riesgo'
  } else {
    estadoProyeccion = 'lejos'
  }

  return {
    consumoActual,
    objetivoPrincipal,
    porcentajeAlcanzado,
    tramoActual,
    proximoTramo,
    porcentajeRapelActual,
    rapelDevengadoEuros,
    faltaParaProximoTramo,
    rapelProximoTramoEuros,
    gananciaExtraProximoTramo,
    diasTranscurridos,
    diasRestantes,
    ritmoDiarioActual,
    proyeccionFinDeAno,
    ritmoDiarioNecesario,
    estadoProyeccion,
    porcentajeProyeccionVsObjetivo,
  }
}

/**
 * Formatea importes en euros con separadores de miles
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Formatea porcentajes con decimales limpios
 */
export function formatPercent(percent: number, decimals = 1): string {
  return `${Number(percent).toFixed(decimals)}%`
}
