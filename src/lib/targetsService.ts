import { supabase } from './supabase'
import type { SupplierTarget, RappelTier } from '@/types'

const LOCAL_STORAGE_KEY = 'garde_supplier_targets_data'

/**
 * Carga inicial de datos demo si no existe nada en local ni Supabase
 */
const DEFAULT_TARGETS_DEMO: SupplierTarget[] = [
  {
    id: 'target-balay-2026',
    proveedor_nombre: 'Balay / BSH Electrodomésticos',
    ejercicio: 2026,
    consumo_actual: 760000,
    tramos: [
      { desde_euros: 500000, porcentaje_rapel: 2.0 },
      { desde_euros: 1000000, porcentaje_rapel: 3.5 },
      { desde_euros: 1500000, porcentaje_rapel: 5.0 },
    ],
    notas: 'Acuerdo nacional gama blanca y encastre. Liquidación anual por abono en cuenta.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-daitsu-2026',
    proveedor_nombre: 'Daitsu / Eurofred',
    ejercicio: 2026,
    consumo_actual: 320000,
    tramos: [
      { desde_euros: 300000, porcentaje_rapel: 2.5 },
      { desde_euros: 600000, porcentaje_rapel: 4.0 },
    ],
    notas: 'Climatización doméstica y semi-industrial. Revisión semestral.',
    fecha_actualizacion: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'target-teka-2026',
    proveedor_nombre: 'Teka',
    ejercicio: 2026,
    consumo_actual: 180000,
    tramos: [
      { desde_euros: 250000, porcentaje_rapel: 3.0 },
      { desde_euros: 500000, porcentaje_rapel: 4.5 },
    ],
    notas: 'Hornos, placas y campanas.',
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
  const isNew = !target.id

  const newRecord: SupplierTarget = {
    id: target.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `target-${Date.now()}`),
    proveedor_id: target.proveedor_id || null,
    proveedor_nombre: (target.proveedor_nombre || '').trim(),
    ejercicio: target.ejercicio || new Date().getFullYear(),
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
