import { supabase } from './supabase'
import type { SupplierTarget, RappelTier } from '@/types'

const LOCAL_STORAGE_KEY = 'garde_supplier_targets_data_v2'

/**
 * Carga inicial de datos demo si no existe nada en local ni Supabase
 */
const DEFAULT_TARGETS_DEMO: SupplierTarget[] = [
  {
    id: 'target-balay-2026',
    proveedor_nombre: 'Balay / BSH Electrodomésticos',
    ejercicio: 2026,
    tipo_acuerdo: 'anual',
    consumo_actual: 760000,
    tramos: [
      { desde_euros: 500000, porcentaje_rapel: 2.0 },
      { desde_euros: 1000000, porcentaje_rapel: 3.5 },
      { desde_euros: 1500000, porcentaje_rapel: 5.0 },
    ],
    notas: 'Acuerdo anual global gama blanca y encastre. Liquidación por abono en cuenta.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-frio-2026',
    proveedor_nombre: 'Liebherr / Frío Especial',
    ejercicio: 2026,
    tipo_acuerdo: 'campana',
    categoria_campana: 'Frío',
    nombre_campana: 'Campaña de Frío Verano 2026',
    periodo_descripcion: '1 May - 31 Ago',
    consumo_actual: 142000,
    tramos: [
      { desde_euros: 100000, porcentaje_rapel: 3.0 },
      { desde_euros: 200000, porcentaje_rapel: 4.5 },
    ],
    notas: 'Rappel atípico especial sobre combis y frigoríficos side-by-side.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-secado-2026',
    proveedor_nombre: 'Balay / BSH Electrodomésticos',
    ejercicio: 2026,
    tipo_acuerdo: 'campana',
    categoria_campana: 'Secado',
    nombre_campana: 'Campaña Secadoras e Integración',
    periodo_descripcion: '1 Sep - 31 Dic',
    consumo_actual: 45000,
    tramos: [
      { desde_euros: 60000, porcentaje_rapel: 2.5 },
      { desde_euros: 120000, porcentaje_rapel: 4.0 },
    ],
    notas: 'Atípico de temporada de secado para secadoras con bomba de calor.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-coccion-2026',
    proveedor_nombre: 'Teka',
    ejercicio: 2026,
    tipo_acuerdo: 'campana',
    categoria_campana: 'Cocción',
    nombre_campana: 'Campaña Cocción y Hornos Pirolíticos',
    periodo_descripcion: '1 Feb - 30 Jun',
    consumo_actual: 180000,
    tramos: [
      { desde_euros: 150000, porcentaje_rapel: 3.0 },
      { desde_euros: 300000, porcentaje_rapel: 5.0 },
    ],
    notas: 'Hornos de inducción, campanas decorativas y placas.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-daitsu-q3-2026',
    proveedor_nombre: 'Daitsu / Eurofred',
    ejercicio: 2026,
    tipo_acuerdo: 'trimestral',
    trimestre: 'Q3',
    periodo_descripcion: 'Q3 (1 Jul - 30 Sep)',
    consumo_actual: 110000,
    tramos: [
      { desde_euros: 100000, porcentaje_rapel: 2.0 },
      { desde_euros: 200000, porcentaje_rapel: 3.5 },
    ],
    notas: 'Rappel de liquidación trimestral independiente para climatización de verano.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

function getLocalTargets(): SupplierTarget[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_TARGETS_DEMO))
      return DEFAULT_TARGETS_DEMO
    }
    return JSON.parse(raw) as SupplierTarget[]
  } catch (err) {
    console.error('Error reading targets from localStorage', err)
    return DEFAULT_TARGETS_DEMO
  }
}

function saveLocalTargets(targets: SupplierTarget[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(targets))
  } catch (err) {
    console.error('Error saving targets to localStorage', err)
  }
}

/**
 * Obtener todos los objetivos anuales (de Supabase con fallback local)
 */
export async function getSupplierTargets(ejercicio?: number): Promise<SupplierTarget[]> {
  try {
    let query = supabase.from('supplier_targets').select('*').order('proveedor_nombre', { ascending: true })
    if (ejercicio) {
      query = query.eq('ejercicio', ejercicio)
    }
    const { data, error } = await query

    if (!error && data && data.length > 0) {
      // Normalizar tramos si vienen como json string o array
      const normalized = data.map((d) => ({
        ...d,
        tipo_acuerdo: d.tipo_acuerdo || 'anual',
        tramos: (typeof d.tramos === 'string' ? JSON.parse(d.tramos) : d.tramos) || [],
      }))
      saveLocalTargets(normalized)
      return normalized as SupplierTarget[]
    }
  } catch (err) {
    console.warn('Supabase supplier_targets no disponible, usando fallback local', err)
  }

  // Fallback a localStorage
  const local = getLocalTargets()
  if (ejercicio) {
    return local.filter((t) => t.ejercicio === ejercicio)
  }
  return local
}

/**
 * Guardar o crear un objetivo
 */
export async function saveSupplierTarget(target: Partial<SupplierTarget>): Promise<SupplierTarget> {
  const localList = getLocalTargets()

  const newRecord: SupplierTarget = {
    id: target.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `target-${Date.now()}`),
    proveedor_id: target.proveedor_id || null,
    proveedor_nombre: (target.proveedor_nombre || '').trim(),
    ejercicio: target.ejercicio || new Date().getFullYear(),
    tipo_acuerdo: target.tipo_acuerdo || 'anual',
    trimestre: target.trimestre || null,
    categoria_campana: target.categoria_campana || null,
    nombre_campana: target.nombre_campana ? target.nombre_campana.trim() : null,
    periodo_descripcion: target.periodo_descripcion ? target.periodo_descripcion.trim() : null,
    consumo_actual: Number(target.consumo_actual) || 0,
    tramos: (target.tramos || []).sort((a, b) => a.desde_euros - b.desde_euros),
    notas: target.notas || null,
    fecha_actualizacion: new Date().toISOString(),
    created_at: target.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: target.created_by || null,
  }

  // Intentar guardar en Supabase
  try {
    const { data, error } = await supabase
      .from('supplier_targets')
      .upsert({
        id: newRecord.id,
        proveedor_id: newRecord.proveedor_id,
        proveedor_nombre: newRecord.proveedor_nombre,
        ejercicio: newRecord.ejercicio,
        tipo_acuerdo: newRecord.tipo_acuerdo,
        trimestre: newRecord.trimestre,
        categoria_campana: newRecord.categoria_campana,
        nombre_campana: newRecord.nombre_campana,
        periodo_descripcion: newRecord.periodo_descripcion,
        consumo_actual: newRecord.consumo_actual,
        tramos: newRecord.tramos,
        notas: newRecord.notas,
        fecha_actualizacion: newRecord.fecha_actualizacion,
        updated_at: newRecord.updated_at,
      })
      .select()
      .single()

    if (!error && data) {
      newRecord.id = data.id
    }
  } catch (err) {
    console.warn('Fallo al guardar en Supabase, persistiendo en local', err)
  }

  // Guardar en local
  const index = localList.findIndex((t) => t.id === newRecord.id)
  if (index >= 0) {
    localList[index] = newRecord
  } else {
    localList.unshift(newRecord)
  }
  saveLocalTargets(localList)

  return newRecord
}

/**
 * Actualiza el consumo acumulado de un proveedor en segundos
 */
export async function updateTargetConsumption(id: string, nuevoConsumo: number): Promise<SupplierTarget | null> {
  const localList = getLocalTargets()
  const target = localList.find((t) => t.id === id)
  if (!target) return null

  target.consumo_actual = Math.max(0, nuevoConsumo)
  target.fecha_actualizacion = new Date().toISOString()
  target.updated_at = new Date().toISOString()

  try {
    await supabase
      .from('supplier_targets')
      .update({
        consumo_actual: target.consumo_actual,
        fecha_actualizacion: target.fecha_actualizacion,
        updated_at: target.updated_at,
      })
      .eq('id', id)
  } catch (err) {
    console.warn('Error al actualizar consumo en Supabase', err)
  }

  saveLocalTargets(localList)
  return target
}

/**
 * Eliminar un acuerdo de objetivos
 */
export async function deleteSupplierTarget(id: string): Promise<boolean> {
  let localList = getLocalTargets()
  localList = localList.filter((t) => t.id !== id)
  saveLocalTargets(localList)

  try {
    await supabase.from('supplier_targets').delete().eq('id', id)
  } catch (err) {
    console.warn('Error al borrar en Supabase', err)
  }

  return true
}
