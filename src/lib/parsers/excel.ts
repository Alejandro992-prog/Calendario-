import * as XLSX from 'xlsx'
import type { ParsedItem } from '@/types'

/**
 * Parse an Excel (.xlsx) or CSV file and extract delivery item rows.
 * Tries to auto-detect column headers for Modelo, Descripcion, EAN, Cantidad.
 */
export async function parseExcel(file: File): Promise<ParsedItem[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (!rows.length) return []

  // Auto-detect column headers (case-insensitive, accent-insensitive)
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const firstRow = rows[0]
  const keys = Object.keys(firstRow)

  const findKey = (candidates: string[]) =>
    keys.find((k) => candidates.some((c) => normalize(k).includes(c)))

  const modeloKey   = findKey(['modelo', 'referencia', 'ref', 'codigo'])
  const descKey     = findKey(['descripcion', 'descripción', 'nombre', 'articulo'])
  const eanKey      = findKey(['ean', 'barcode', 'codigo barras', 'gtin'])
  const cantidadKey = findKey(['cantidad', 'qty', 'unidades', 'uds', 'pcs'])

  return rows
    .map((row) => {
      const modelo = String(modeloKey ? row[modeloKey] : '').trim()
      if (!modelo) return null

      const item: ParsedItem = {
        modelo,
        descripcion: descKey ? String(row[descKey]).trim() : undefined,
        ean: eanKey ? String(row[eanKey]).trim() : undefined,
        cantidad: cantidadKey ? Number(row[cantidadKey]) || 1 : 1,
        fuente: 'excel',
        raw_data: row as Record<string, unknown>,
      }
      return item
    })
    .filter((item): item is ParsedItem => item !== null)
}
