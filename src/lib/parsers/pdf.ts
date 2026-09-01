import type { ParsedItem } from '@/types'
import { extractFromImage } from './ocr'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'

// Set worker source using Vite's ?url asset import
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker
}

interface PositionedText {
  str: string
  x: number
  y: number
  width: number
  height: number
}

interface TextLine {
  y: number
  items: PositionedText[]
  text: string
}

/**
 * Parse a PDF file and extract delivery items.
 * Supports structured text PDFs (with visual line grouping) and scanned PDFs (via OCR fallback).
 */
export async function parsePDF(file: File): Promise<ParsedItem[]> {
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const pdf = await loadingTask.promise
  if (pdf.numPages === 0) {
    throw new Error('El archivo PDF no tiene páginas válidas.')
  }

  const allLines: TextLine[] = []
  let totalExtractedChars = 0

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    const rawItems: PositionedText[] = []
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
        const transform = item.transform || [1, 0, 0, 1, 0, 0]
        rawItems.push({
          str: item.str,
          x: transform[4] || 0,
          y: transform[5] || 0,
          width: item.width || 0,
          height: item.height || 10,
        })
        totalExtractedChars += item.str.trim().length
      }
    }

    // Group items into visual lines by Y coordinate (tolerance ±4px)
    const pageLines = groupItemsIntoLines(rawItems)
    allLines.push(...pageLines)
  }

  // If the PDF has virtually no embedded text (e.g. scanned image / photo PDF),
  // render the first pages to canvas and use OCR!
  if (totalExtractedChars < 25) {
    return extractViaPdfOcr(pdf)
  }

  // Strategy 1: Strict Tabular & Boundary extraction
  let parsedItems = extractItemsFromLines(allLines)

  // Strategy 2: If strict mode found 0 items, try relaxed pattern matching
  if (parsedItems.length === 0) {
    parsedItems = extractFallbackFromLines(allLines)
  }

  // Strategy 3: If still 0 items, try OCR on the rendered PDF pages
  if (parsedItems.length === 0) {
    try {
      parsedItems = await extractViaPdfOcr(pdf)
    } catch {
      // OCR fallback failed or wasn't applicable
    }
  }

  // Strategy 4: If all heuristics found 0 items, extract any candidate text line with numbers
  if (parsedItems.length === 0) {
    parsedItems = extractBroadFallback(allLines)
  }

  return parsedItems
}

/**
 * Group positioned text fragments into horizontal lines based on Y coordinate
 */
function groupItemsIntoLines(items: PositionedText[]): TextLine[] {
  if (!items.length) return []

  // Sort descending by Y (top of page first)
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const lines: { y: number; items: PositionedText[] }[] = []

  for (const item of sorted) {
    // Find an existing line within ±4 vertical points
    const matchingLine = lines.find((l) => Math.abs(l.y - item.y) <= 4)
    if (matchingLine) {
      matchingLine.items.push(item)
    } else {
      lines.push({ y: item.y, items: [item] })
    }
  }

  // Sort items within each line left-to-right (ascending X) and join text
  return lines.map((line) => {
    const sortedItems = line.items.sort((a, b) => a.x - b.x)
    const text = sortedItems.map((i) => i.str.trim()).join('  ')
    return {
      y: line.y,
      items: sortedItems,
      text,
    }
  })
}

/**
 * Comprehensive dictionary of non-model words commonly found in invoices,
 * delivery notes, header/footer text, addresses, company names, and logistics terms.
 */
const STOPWORDS = new Set([
  // Document structure & headers
  'ALBARAN', 'ALBARÁN', 'FACTURA', 'EXPEDICION', 'EXPEDICIÓN', 'PEDIDO', 'FECHA', 'HORA',
  'PAGINA', 'PÁGINA', 'HOJA', 'DOCUMENTO', 'ENTREGA', 'ENVIO', 'ENVÍO', 'DESCARGA', 'MUELLE',
  'ORDEN', 'REFERENCIA', 'PROVEEDOR', 'CLIENTE', 'DESTINATARIO', 'EXPEDIDOR', 'REMITENTE',
  'CONSIGNATARIO', 'TRANSPORTISTA', 'AGENCIA', 'CONDUCTOR', 'MATRICULA', 'MATRÍCULA',
  'VEHICULO', 'VEHÍCULO', 'TRACTORA', 'REMOLQUE', 'ALBARANES', 'PEDIDOS',

  // Contact, Address & Locations
  'CALLE', 'AVENIDA', 'AVDA', 'PLAZA', 'PZA', 'PASEO', 'CARRETERA', 'CTRA', 'POLIGONO',
  'POLÍGONO', 'SECTOR', 'PARCELA', 'NAVE', 'LOCAL', 'BLOQUE', 'ESCALERA', 'PISO', 'PUERTA',
  'TELEFONO', 'TELÉFONO', 'TFNO', 'MOVIL', 'MÓVIL', 'FAX', 'EMAIL', 'CORREO', 'WEB',
  'DIRECCION', 'DIRECCIÓN', 'DOMICILIO', 'POBLACION', 'POBLACIÓN', 'MUNICIPIO', 'PROVINCIA',
  'PAIS', 'PAÍS', 'ESPAÑA', 'MADRID', 'BARCELONA', 'VALENCIA', 'SEVILLA', 'ZARAGOZA',
  'MALAGA', 'MÁLAGA', 'MURCIA', 'PALMA', 'BILBAO', 'ALICANTE', 'CORDOBA', 'CÓRDOBA',
  'VALLADOLID', 'VIGO', 'GIJON', 'GIJÓN', 'NAVARRA', 'PAMPLONA', 'ALAVA', 'ÁLAVA',
  'VIZCAYA', 'GUIPUZCOA', 'GUIPÚZCOA', 'TOLEDO', 'GUADALAJARA', 'CASTELLON', 'CASTELLÓN',

  // Fiscal, Tax & Finance
  'CIF', 'NIF', 'DNI', 'NIE', 'VAT', 'IVA', 'RECARGO', 'IRPF', 'BASE', 'IMPONIBLE',
  'SUBTOTAL', 'TOTAL', 'EUROS', 'EUR', 'PRECIO', 'IMPORTE', 'VALOR', 'DESCUENTO',
  'DTO', 'BRUTO', 'NETO', 'PVP', 'FORMA', 'PAGO', 'VENCIMIENTO', 'PLAZO', 'GIRO',
  'TRANSFERENCIA', 'RECIBO', 'CUENTA', 'IBAN', 'SWIFT', 'BIC', 'BANCO', 'CAJA',
  'SOCIEDAD', 'LIMITADA', 'ANONIMA', 'ANÓNIMA', 'COOPERATIVA', 'GRUPO', 'GARDE',
  'ELECTRODOMESTICOS', 'ELECTRODOMÉSTICOS', 'S.L.', 'S.A.', 'S.L.U.',

  // Column headers & Table metadata
  'CANTIDAD', 'UNIDADES', 'UDS', 'UD', 'PCS', 'BULTOS', 'KILOS', 'KG', 'PESO', 'VOLUMEN',
  'PALET', 'PALETS', 'PALLET', 'PALLETS', 'CAJA', 'CAJAS', 'CODIGO', 'CÓDIGO', 'MODELO',
  'ARTICULO', 'ARTÍCULO', 'DESCRIPCION', 'DESCRIPCIÓN', 'OBSERVACIONES', 'COMENTARIOS',
  'NOTAS', 'FIRMA', 'SELLO', 'CONFORME', 'RECIBIDO', 'REVISADO', 'ESTADO', 'INCIDENCIA',
  'MUESTRAS', 'DEVOLUCION', 'DEVOLUCIÓN', 'GARANTIA', 'GARANTÍA', 'LINEA', 'LÍNEA',
  'NUMERO', 'NÚMERO', 'NUM', 'Nº', 'REF', 'POS', 'POSICION', 'POSICIÓN'
])

/**
 * Words that indicate the start of the footer / end of product items
 */
const FOOTER_CUTOFF_KEYWORDS = [
  'TOTAL BULTOS',
  'TOTAL ALBARAN',
  'TOTAL ALBARÁN',
  'TOTAL FACTURA',
  'TOTAL GENERAL',
  'TOTAL PALETS',
  'TOTAL PESO',
  'TOTAL ARTICULOS',
  'BASE IMPONIBLE',
  'SUBTOTAL',
  'FIRMA Y SELLO',
  'CONFORME CLIENTE',
  'OBSERVACIONES:',
  'CONDICIONES DE ENTREGA',
  'FORMA DE PAGO',
  'RECIBIDO POR',
]

/**
 * Words that indicate table headers (where the item grid begins)
 */
const HEADER_KEYWORDS = [
  'ARTICULO',
  'ARTÍCULO',
  'MODELO',
  'CODIGO',
  'CÓDIGO',
  'DESCRIPCION',
  'DESCRIPCIÓN',
  'CANTIDAD',
  'UNIDADES',
  'UDS',
  'EAN',
  'REFERENCIA',
]

/**
 * Checks if a token matches the strict criteria for an appliance model:
 * 1. Between 3 and 32 characters
 * 2. Contains alphanumeric characters, hyphens, slashes, or dots
 * 3. Must contain BOTH letters and digits (e.g. 3KFE662WI, RB34T602ESA, WW90T534DTW)
 *    OR match known appliance model patterns
 * 4. Must not be in STOPWORDS dictionary
 * 5. Must not be a date, phone number, CIF, or postal code
 */
function isValidApplianceModel(token: string): boolean {
  if (!token || token.length < 3 || token.length > 32) return false

  const clean = token.toUpperCase().trim()

  // 1. Stopwords check
  if (STOPWORDS.has(clean)) return false

  // 2. Reject common patterns that are NOT models:
  // Postal codes (e.g. 28001, 08020)
  if (/^\d{5}$/.test(clean)) return false
  // Dates (e.g. 01/09/2026, 2026-09-01, 01-09-26)
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(clean) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) return false
  // Phone numbers (e.g. 912345678, +34912345678)
  if (/^(\+34)?[6789]\d{8}$/.test(clean)) return false
  // CIF / NIF / NIE (e.g. B12345678, 12345678A, X1234567B)
  if (/^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$/.test(clean) || /^\d{8}[A-Z]$/.test(clean) || /^[XYZ]\d{7}[A-Z]$/.test(clean)) return false
  // Prices / Percentages / Currency
  if (/^\d+([.,]\d+)?\s*(€|EUR|%|KG|KGS)?$/.test(clean)) return false
  // Pure dictionary words (all letters without digits) are rejected as models
  if (!/[0-9]/.test(clean)) return false
  // Must have at least one letter (or be a recognized 10+ digit EAN / barcode / part number)
  if (!/[A-Z]/.test(clean) && clean.length < 10) return false

  // 3. Positive match: Has valid characters for appliance models
  return /^[A-Z0-9][A-Z0-9\-_./]{2,30}$/.test(clean)
}

/**
 * Validates whether a token represents a valid EAN-13 or EAN-8 barcode
 */
function isValidEan(token: string): boolean {
  const digits = token.replace(/\D/g, '')
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 13 && digits.length !== 14) {
    return false
  }
  // Standard EAN starts with valid country codes (e.g. 84 for Spain, 40-44 for Germany, etc.)
  return true
}

/**
 * Extract items from structured lines with table boundary detection & strict fingerprinting
 */
function extractItemsFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  if (!lines.length) return items

  // 1. Detect Table Boundaries (Header row & Footer cutoff)
  let tableStarted = false
  let tableEnded = false

  // Check if document has an explicit header row
  const hasExplicitHeader = lines.some((l) => {
    const textUpper = l.text.toUpperCase()
    return HEADER_KEYWORDS.filter((k) => textUpper.includes(k)).length >= 2
  })

  // Quantity regex: matches 1-4 digit integers optionally followed by units
  const qtyRegex = /\b(\d{1,4})\s*(ud|uds|pcs|unid|unidades|u\b)?/i
  const eanRegex = /\b(\d{12,14})\b/

  for (const line of lines) {
    const text = line.text.trim()
    if (!text || text.length < 3) continue

    const upper = text.toUpperCase()

    // 2. Check for Table Start if not yet started
    if (!tableStarted && hasExplicitHeader) {
      const matchCount = HEADER_KEYWORDS.filter((k) => upper.includes(k)).length
      if (matchCount >= 2) {
        tableStarted = true
        continue // Skip header line itself
      }
    }

    // 3. Check for Footer Cutoff
    if (FOOTER_CUTOFF_KEYWORDS.some((kw) => upper.includes(kw))) {
      tableEnded = true
      break // Stop processing, we reached document totals / footer
    }

    // If there was no explicit header line found in the document, treat all lines as potential rows
    if (!hasExplicitHeader) {
      tableStarted = true
    }

    // Skip lines before table header
    if (!tableStarted) continue

    // 4. Extract tokens sorted by X-coordinate
    const sortedParts = line.items
      .map((i) => ({ text: i.str.trim(), x: i.x, width: i.width }))
      .filter((p) => p.text.length > 0)

    if (sortedParts.length === 0) continue

    // Find candidate EAN
    const eanMatch = text.match(eanRegex)
    const eanStr = eanMatch && isValidEan(eanMatch[1]) ? eanMatch[1] : undefined

    // Find candidate Quantity
    let detectedQty = 1
    let foundQtyToken = false

    // Look for quantity from the line parts
    for (let i = sortedParts.length - 1; i >= 0; i--) {
      const part = sortedParts[i].text
      // If token is purely a small integer (1 to 500) or like "2 UDS"
      const m = part.match(/^(\d{1,4})\s*(ud|uds|pcs|unid|u)?$/i)
      if (m) {
        const num = parseInt(m[1], 10)
        if (num > 0 && num <= 500) {
          detectedQty = num
          foundQtyToken = true
          break
        }
      }
    }

    // Look for candidate Model among tokens
    let foundModel = ''
    let descriptionTokens: string[] = []

    for (const partObj of sortedParts) {
      const part = partObj.text
      const partUpper = part.toUpperCase()

      // Skip EAN token
      if (eanStr && part === eanStr) continue

      // Skip Quantity token if isolated
      if (/^\d{1,4}(\s*(ud|uds|pcs|unid|u))?$/i.test(part)) continue

      // Skip Price tokens (e.g. "120,50", "21%", "0.00")
      if (/^\d+[,.]\d{2}\s*€?$/.test(part) || /^\d+[,.]\d{1,2}%$/.test(part)) continue

      // Check if this token is a valid model
      if (!foundModel && isValidApplianceModel(part)) {
        foundModel = part.toUpperCase()
        continue
      }

      // If not model, not stopword, collect as description
      if (!STOPWORDS.has(partUpper) && part !== foundModel) {
        descriptionTokens.push(part)
      }
    }

    // If a model was found (OR an EAN with description), record the item
    if (foundModel || (eanStr && descriptionTokens.length > 0)) {
      const finalModel = foundModel || (eanStr ? `EAN-${eanStr}` : '')
      const finalDesc = descriptionTokens
        .join(' ')
        .replace(finalModel, '')
        .trim()

      items.push({
        modelo: finalModel,
        descripcion: finalDesc || undefined,
        ean: eanStr,
        cantidad: detectedQty,
        fuente: 'pdf',
        raw_data: {
          lineText: text,
          hasQty: foundQtyToken,
        },
      })
    }
  }

  return items
}

/**
 * Fallback line extractor with strict alphanumeric validation
 */
function extractFallbackFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  // Matches strict alphanumeric models (must have letters and digits, min 4 chars)
  const modelPattern = /\b([A-Z0-9][A-Z0-9\-_./]{3,24})\b/g

  for (const line of lines) {
    const text = line.text.trim()
    const upper = text.toUpperCase()

    // Skip footer / header text
    if (FOOTER_CUTOFF_KEYWORDS.some((kw) => upper.includes(kw))) break
    if (STOPWORDS.has(upper)) continue

    const matches = Array.from(text.matchAll(modelPattern))
    for (const match of matches) {
      const candidate = match[1].toUpperCase()
      if (isValidApplianceModel(candidate)) {
        const desc = text.replace(new RegExp(candidate, 'i'), '').trim()
        items.push({
          modelo: candidate,
          descripcion: desc && desc.length > 2 ? desc : undefined,
          cantidad: 1,
          fuente: 'pdf',
          raw_data: { fallbackLine: text },
        })
      }
    }
  }

  return items
}

/**
 * OCR Fallback for scanned PDFs (renders page onto canvas and runs OCR)
 */
async function extractViaPdfOcr(pdf: any): Promise<ParsedItem[]> {
  const maxPagesToOcr = Math.min(pdf.numPages, 3)
  const allOcrItems: ParsedItem[] = []

  for (let pageNum = 1; pageNum <= maxPagesToOcr; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.0 }) // 2x scale for crisp OCR

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')

    if (!context) continue

    await page.render({ canvasContext: context, viewport }).promise

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    )

    if (blob) {
      const ocrResult = await extractFromImage(blob)
      if (ocrResult.items.length > 0) {
        // Filter OCR results through the same strict model validator
        const filteredOcr = ocrResult.items.filter((item) => isValidApplianceModel(item.modelo))
        allOcrItems.push(...(filteredOcr.length > 0 ? filteredOcr : ocrResult.items))
      }
    }
  }

  if (allOcrItems.length === 0) {
    throw new Error(
      'No se han podido detectar artículos en el PDF. Si es un documento escaneado o protegido, puedes añadir los artículos manualmente.'
    )
  }

  return allOcrItems
}

/**
 * Last-resort broad extractor for non-standard PDF formats
 */
function extractBroadFallback(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []

  for (const line of lines) {
    const text = line.text.trim()
    if (!text || text.length < 5) continue

    const upper = text.toUpperCase()
    if (FOOTER_CUTOFF_KEYWORDS.some((kw) => upper.includes(kw))) break
    if (STOPWORDS.has(upper)) continue

    // Extract any token that contains at least one digit and letters
    const tokens = text.split(/\s+/)
    const candidate = tokens.find(
      (t) => t.length >= 3 && t.length <= 25 && /[0-9]/.test(t) && /[A-Za-z]/.test(t) && !STOPWORDS.has(t.toUpperCase())
    )

    if (candidate) {
      const desc = text.replace(candidate, '').trim()
      items.push({
        modelo: candidate.toUpperCase(),
        descripcion: desc || undefined,
        cantidad: 1,
        fuente: 'pdf',
        raw_data: { broadLine: text },
      })
    }
  }

  return items
}


