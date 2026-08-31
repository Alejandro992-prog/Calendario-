import * as XLSX from 'xlsx'
import type { ParsedItem } from '@/types'

/**
 * Normalizes text for header comparison (lowercased, accents removed, trimmed)
 */
function normalizeHeader(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Synonyms for each column type
const MODELO_SYNONYMS = [
  'modelo', 'model', 'referencia', 'ref.', 'ref', 'codigo', 'cod.', 'cod',
  'código', 'articulo', 'artículo', 'producto', 'prod.', 'prod', 'item',
  'material', 'ref_proveedor', 'cod_articulo', 'cod_art'
]

const DESCRIPCION_SYNONYMS = [
  'descripcion', 'descripción', 'description', 'desc.', 'desc',
  'denominacion', 'denominación', 'nombre', 'concepto', 'detalle',
  'texto', 'nom_articulo', 'designacion', 'designación'
]

const EAN_SYNONYMS = [
  'ean', 'ean13', 'ean-13', 'barcode', 'codigo barras', 'código barras',
  'codigo_barras', 'gtin', 'cod. ean', 'cod ean', 'barras', 'upc'
]

const CANTIDAD_SYNONYMS = [
  'cantidad', 'cant.', 'cant', 'qty', 'quantity', 'unidades', 'uds.', 'uds',
  'u.', 'pcs', 'piezas', 'bultos', 'unid.', 'unid', 'total uds', 'tot. uds',
  'cant_servida', 'servido', 'entregado', 'cant_entregada'
]

function matchesAny(header: string, synonyms: string[]): boolean {
  const norm = normalizeHeader(header)
  if (!norm) return false
  return synonyms.some((syn) => norm === syn || norm.includes(syn) || syn.includes(norm))
}

/**
 * Parse an Excel (.xlsx, .xls) or CSV file and extract delivery item rows.
 * Smart header detection across rows 0-30 and fallback column heuristic.
 */
export async function parseExcel(file: File): Promise<ParsedItem[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dense: true })
  
  if (!workbook.SheetNames.length) {
    throw new Error('El archivo Excel no contiene ninguna hoja.')
  }

  // Use the first non-empty sheet
  let sheet: XLSX.WorkSheet | null = null
  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name]
    if (s && s['!ref']) {
      sheet = s
      break
    }
  }

  if (!sheet) {
    sheet = workbook.Sheets[workbook.SheetNames[0]]
  }

  // Get raw 2D array of rows
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  })

  if (!rawRows || rawRows.length === 0) {
    throw new Error('La hoja de cálculo está vacía.')
  }

  // Filter out completely blank rows
  const rows = rawRows.filter((r) => Array.isArray(r) && r.some((cell) => String(cell).trim() !== ''))

  if (!rows.length) {
    throw new Error('No se encontraron filas con datos en el archivo.')
  }

  // Find the header row (score each row based on matching synonyms)
  let bestHeaderRowIdx = -1
  let maxScore = 0
  let colMap = { modelo: -1, descripcion: -1, ean: -1, cantidad: -1 }

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r]
    let score = 0
    let tempMap = { modelo: -1, descripcion: -1, ean: -1, cantidad: -1 }

    row.forEach((cellVal: any, colIdx: number) => {
      const str = String(cellVal || '').trim()
      if (!str) return

      if (tempMap.modelo === -1 && matchesAny(str, MODELO_SYNONYMS)) {
        tempMap.modelo = colIdx
        score += 3
      } else if (tempMap.descripcion === -1 && matchesAny(str, DESCRIPCION_SYNONYMS)) {
        tempMap.descripcion = colIdx
        score += 2
      } else if (tempMap.cantidad === -1 && matchesAny(str, CANTIDAD_SYNONYMS)) {
        tempMap.cantidad = colIdx
        score += 2
      } else if (tempMap.ean === -1 && matchesAny(str, EAN_SYNONYMS)) {
        tempMap.ean = colIdx
        score += 2
      }
    })

    // At least must match modelo or (descripcion and cantidad)
    if (score > maxScore && (tempMap.modelo !== -1 || (tempMap.descripcion !== -1 && tempMap.cantidad !== -1))) {
      maxScore = score
      bestHeaderRowIdx = r
      colMap = tempMap
    }
  }

  const items: ParsedItem[] = []

  // If header found, extract rows after header
  if (bestHeaderRowIdx !== -1 && (colMap.modelo !== -1 || colMap.descripcion !== -1)) {
    const dataRows = rows.slice(bestHeaderRowIdx + 1)

    for (const row of dataRows) {
      const rawModelo = colMap.modelo !== -1 ? String(row[colMap.modelo] || '').trim() : ''
      const rawDesc = colMap.descripcion !== -1 ? String(row[colMap.descripcion] || '').trim() : ''
      const rawEan = colMap.ean !== -1 ? String(row[colMap.ean] || '').trim() : ''
      const rawCant = colMap.cantidad !== -1 ? row[colMap.cantidad] : 1

      // Skip summary / total rows
      const combined = `${rawModelo} ${rawDesc}`.toLowerCase()
      if (
        combined.includes('total') ||
        combined.includes('subtotal') ||
        combined.includes('pagina') ||
        combined.includes('página') ||
        combined.includes('observaciones') ||
        combined.includes('iva ')
      ) {
        continue
      }

      // We need at least a model code or a description
      const modelo = rawModelo || (rawDesc.length <= 25 ? rawDesc : rawDesc.split(/\s+/)[0])
      if (!modelo) continue

      // Clean quantity
      let cantidad = 1
      if (rawCant !== undefined && rawCant !== '') {
        const parsedNum = parseFloat(String(rawCant).replace(',', '.').replace(/[^0-9.-]/g, ''))
        if (!isNaN(parsedNum) && parsedNum > 0) {
          cantidad = Math.round(parsedNum)
        }
      }

      // Clean EAN: only if 8 to 14 digits
      const cleanedEan = rawEan.replace(/\D/g, '')
      const ean = cleanedEan.length >= 8 && cleanedEan.length <= 14 ? cleanedEan : undefined

      items.push({
        modelo: modelo.toUpperCase(),
        descripcion: rawDesc || undefined,
        ean,
        cantidad: cantidad || 1,
        fuente: 'excel',
        raw_data: { row },
      })
    }
  }

  // Fallback: If no headers were recognized, try smart heuristic on all rows
  if (items.length === 0) {
    for (const row of rows) {
      // Find cells in this row
      const cells = row.map((c: any) => String(c || '').trim()).filter(Boolean)
      if (cells.length < 1) continue

      // Check if line looks like header or total
      const rowStr = cells.join(' ').toLowerCase()
      if (rowStr.includes('total') || rowStr.includes('subtotal') || rowStr.includes('albaran') || rowStr.includes('fecha')) {
        continue
      }

      // Look for EAN (12-14 digits)
      let ean: string | undefined
      let cantidad = 1
      let modelo = ''
      let descripcion = ''

      for (const cell of cells) {
        const cleanDigits = cell.replace(/\D/g, '')
        if (cleanDigits.length === 13 && !ean) {
          ean = cleanDigits
        } else if (/^\d{1,4}$/.test(cell) && cantidad === 1 && parseInt(cell, 10) > 0) {
          cantidad = parseInt(cell, 10)
        } else if (/^[A-Za-z0-9\-_./]{3,25}$/.test(cell) && !modelo && !/^\d+$/.test(cell)) {
          modelo = cell
        } else if (cell.length > 5 && !descripcion) {
          descripcion = cell
        }
      }

      if (modelo || descripcion) {
        items.push({
          modelo: (modelo || cells[0] || 'ARTICULO').toUpperCase(),
          descripcion: descripcion || (cells[1] !== modelo ? cells[1] : undefined),
          ean,
          cantidad,
          fuente: 'excel',
          raw_data: { row },
        })
      }
    }
  }

  if (items.length === 0) {
    throw new Error(
      'No se han podido detectar artículos automáticamente en el archivo Excel. Asegúrate de que contiene columnas con Modelo/Referencia y Cantidad.'
    )
  }

  return items
}
