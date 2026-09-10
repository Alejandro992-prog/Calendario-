import type { PdfZoneConfig } from '@/types'

const STORAGE_KEY = 'pdf_zone_by_supplier'

type ZoneMap = Record<string, PdfZoneConfig>

function readMap(): ZoneMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ZoneMap) : {}
  } catch {
    return {}
  }
}

function writeMap(map: ZoneMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage puede estar lleno o bloqueado en algunos contextos
    console.warn('No se pudo guardar la zona PDF en localStorage')
  }
}

/**
 * Obtiene la zona guardada para un proveedor concreto.
 * Devuelve null si no hay zona guardada.
 */
export function getZoneForSupplier(supplierId: string): PdfZoneConfig | null {
  if (!supplierId) return null
  const map = readMap()
  return map[supplierId] ?? null
}

/**
 * Guarda la zona seleccionada asociada a un proveedor.
 */
export function saveZoneForSupplier(supplierId: string, zone: PdfZoneConfig): void {
  if (!supplierId) return
  const map = readMap()
  map[supplierId] = zone
  writeMap(map)
}

/**
 * Elimina la zona guardada para un proveedor.
 */
export function clearZoneForSupplier(supplierId: string): void {
  if (!supplierId) return
  const map = readMap()
  delete map[supplierId]
  writeMap(map)
}
