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
  'VEHICULO', 'VEHÍCULO', 'TRACTORA', 'REMOLQUE', 'ALBARANES', 'PEDIDOS', 'DELEGACION', 'DELEGACIÓN',

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
  'ELECTRODOMESTICOS', 'ELECTRODOMÉSTICOS', 'S.L.', 'S.A.', 'S.L.U.', 'SONIFER', 'ORBEGOZO',
  'PORTES', 'PAGADOS', 'DEBIDOS', 'SENDA', 'FAC',

  // Column headers & Table metadata
  'CANTIDAD', 'UNIDADES', 'UDS', 'UD', 'PCS', 'BULTOS', 'KILOS', 'KG', 'PESO', 'VOLUMEN',
  'PALET', 'PALETS', 'PALLET', 'PALLETS', 'CAJA', 'CAJAS', 'CODIGO', 'CÓDIGO', 'MODELO',
  'ARTICULO', 'ARTÍCULO', 'DESCRIPCION', 'DESCRIPCIÓN', 'OBSERVACIONES', 'COMENTARIOS',
  'NOTAS', 'FIRMA', 'SELLO', 'CONFORME', 'RECIBIDO', 'REVISADO', 'ESTADO', 'INCIDENCIA',
  'MUESTRAS', 'DEVOLUCION', 'DEVOLUCIÓN', 'GARANTIA', 'GARANTÍA', 'LINEA', 'LÍNEA',
  'NUMERO', 'NÚMERO', 'NUM', 'Nº', 'REF', 'POS', 'POSICION', 'POSICIÓN', 'COPIA', 'ES'
])

/**
 * Checks if a token matches the strict criteria for an appliance model:
 * (e.g. KFI 960 A, 3KFE662WI, RB34T602ESA, SFB 8028, 719180-1)
 */
function isStrictApplianceModel(token: string): boolean {
  if (!token || token.length < 3 || token.length > 32) return false

  const clean = token.toUpperCase().trim().replace(/^[#\-:.]+|[#\-:.]+$/g, '')
  if (clean.length < 3) return false

  if (STOPWORDS.has(clean)) return false

  // Reject Spanish CIF / NIF / NIE
  if (
    /^[A-HJ-NP-SUVW]\d{7,8}[0-9A-J]?$/i.test(clean) ||
    /^\d{8}[A-Z]$/i.test(clean) ||
    /^[XYZ]\d{7,8}[A-Z]$/i.test(clean) ||
    /^ES[A-Z0-9]{8,10}$/i.test(clean)
  ) {
    return false
  }

  // Reject postal codes, dates, phone numbers, prices
  if (/^\d{5}$/.test(clean)) return false
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(clean) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) return false
  if (/^(\+34)?[6789]\d{8}$/.test(clean)) return false
  if (/^\d+([.,]\d+)?\s*(€|EUR|%|KG|KGS)?$/i.test(clean)) return false

  // Orbegozo / Standard Appliance Model Pattern (e.g. KFI 960, SFB 8028, 3KFE662WI, RB34T602ESA)
  if (/^[A-Z]{2,4}\s*\d{3,4}(\s*[A-Z])?$/i.test(clean)) return true

  // Alphanumeric model (must have letters and numbers, e.g. 3KFE662WI)
  if (/[A-Z]/i.test(clean) && /[0-9]/.test(clean)) {
    return /^[A-Z0-9][A-Z0-9\-_./]{2,30}$/i.test(clean)
  }

  // Numeric item reference with hyphen (e.g. 719180-1, 719180-2)
  if (/^\d{4,10}-\d{1,3}$/.test(clean)) return true

  return false
}

/**
 * Validates whether a token represents a valid EAN-13, EAN-14 or EAN-8 barcode
 */
function isValidEan(token: string): boolean {
  const digits = token.replace(/\D/g, '')
  return digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14
}

/**
 * Checks if a line is pure metadata (address, fiscal data, or sub-header)
 */
function isPureMetadata(text: string): boolean {
  const upper = text.toUpperCase().trim()

  // Sub-headers inside table
  if (
    upper.startsWith('ALBARAN :') ||
    upper.startsWith('ALBARÁN :') ||
    upper.startsWith('SU(S) PEDIDO(S):') ||
    upper.startsWith('SUS PEDIDOS:') ||
    upper.startsWith('PEDIDO:') ||
    upper.startsWith('PEDIDO :') ||
    upper.startsWith('DELEGACION') ||
    upper.startsWith('DELEGACIÓN') ||
    upper.startsWith('CLIENTE') ||
    upper.startsWith('PORTES') ||
    upper.startsWith('AGENCIA') ||
    upper.startsWith('Nº BULTOS') ||
    upper.startsWith('Nº UNIDADES') ||
    upper.startsWith('TOTAL ALBARAN') ||
    upper.startsWith('VENCIMIENTOS') ||
    upper.startsWith('BASE') ||
    upper.startsWith('CUOTA IVA') ||
    upper.startsWith('PÁGINA') ||
    upper.startsWith('PAGINA') ||
    upper.includes('ES COPIA') ||
    upper.includes('CONCEPCION ARENAL') ||
    upper.includes('GARDE ELECTRODOMESTICOS') ||
    upper.includes('SONIFER') ||
    upper.includes('AVDA. SANTIAGO')
  ) {
    return true
  }

  return false
}

/**
 * Extract items from structured lines with table boundary detection
 */
function extractItemsFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  if (!lines.length) return items

  // 1. Identify Table Header index (contains "Código" / "Descripcion" / "Cantidad")
  let tableHeaderIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase()
    if (
      (upper.includes('CODIGO') || upper.includes('CÓDIGO') || upper.includes('ARTICULO') || upper.includes('ARTÍCULO') || upper.includes('REF')) &&
      (upper.includes('DESCRIPCION') || upper.includes('DESCRIPCIÓN') || upper.includes('CANTIDAD') || upper.includes('PRECIO'))
    ) {
      tableHeaderIndex = i
      break
    }
  }

  // 2. Identify Table Footer index (starts at "Nº Bultos", "TOTAL ALBARAN", "Vencimientos")
  let tableFooterIndex = lines.length
  if (tableHeaderIndex !== -1) {
    for (let i = tableHeaderIndex + 1; i < lines.length; i++) {
      const upper = lines[i].text.toUpperCase()
      if (
        upper.includes('Nº BULTOS') ||
        upper.includes('TOTAL ALBARAN') ||
        upper.includes('TOTAL ALBARÁN') ||
        upper.includes('TOTAL FACTURA') ||
        upper.includes('TOTAL GENERAL') ||
        upper.includes('VENCIMIENTOS') ||
        upper.includes('BASE IMPONIBLE') ||
        upper.includes('FIRMA Y SELLO')
      ) {
        tableFooterIndex = i
        break
      }
    }
  }

  // Determine candidate lines:
  // If table header was found, use lines between header and footer.
  // Otherwise, use all lines that aren't pure metadata.
  const candidateLines =
    tableHeaderIndex !== -1
      ? lines.slice(tableHeaderIndex + 1, tableFooterIndex)
      : lines

  const eanRegex = /\b(\d{12,14})\b/
  // Orbegozo & appliance model pattern: e.g. "KFI 960 A", "SFB 8028 A", "3KFE662WI", "RB34T602ESA", "WW90T534DTW"
  const modelPattern = /\b([A-Z]{2,4}\s*\d{3,4}(?:\s*[A-Z])?|[A-Z0-9][A-Z0-9\-_./]{3,24})\b/i

  for (const line of candidateLines) {
    const text = line.text.trim()
    if (!text || text.length < 4) continue

    if (isPureMetadata(text)) continue

    // Extract item tokens
    const tokens = line.items.map((i) => i.str.trim()).filter(Boolean)
    if (tokens.length === 0) continue

    // Check candidate EAN
    const eanMatch = text.match(eanRegex)
    const eanStr = eanMatch && isValidEan(eanMatch[1]) ? eanMatch[1] : undefined

    // Check candidate Quantity (usually an integer near the right end of the line, e.g. "8")
    let detectedQty = 1
    let foundQty = false

    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i]
      const m = t.match(/^(\d{1,4})\s*(ud|uds|pcs|unid|u)?$/i)
      if (m) {
        const num = parseInt(m[1], 10)
        // Ensure not a year, postal code, or order ref
        if (num > 0 && num <= 500 && num !== 2024 && num !== 2025 && num !== 2026 && !t.includes('-')) {
          detectedQty = num
          foundQty = true
          break
        }
      }
    }

    // Try to extract Model and Description:
    // Look for Orbegozo / Standard Model in the line (e.g. "KFI 960 A", "SFB 8028 A", "3KFE662WI")
    let detectedModel = ''
    let detectedDesc = ''

    // 1. Check if the line matches: `ItemCode Model Description Quantity`
    // Example: "719180-1 KFI 960 A CAFETERA INOX ORBEGO(18119) 8"
    const orbegozoMatch = text.match(
      /^(\d{4,10}-\d{1,3})\s+([A-Z]{2,4}\s*\d{3,4}(?:\s*[A-Z])?)\s+(.*?)\s+(\d{1,4})$/i
    )

    if (orbegozoMatch) {
      detectedModel = orbegozoMatch[2].trim().toUpperCase()
      detectedDesc = orbegozoMatch[3].trim()
      detectedQty = parseInt(orbegozoMatch[4], 10) || detectedQty
    } else {
      // 2. Generic product line matching
      const parts = tokens.filter(
        (t) =>
          !STOPWORDS.has(t.toUpperCase()) &&
          !/^\d+([.,]\d+)?\s*(€|EUR|%|KG)?$/i.test(t)
      )

      if (parts.length > 0) {
        // Look for model inside text
        const mMatch = text.match(modelPattern)
        if (mMatch && isStrictApplianceModel(mMatch[1])) {
          detectedModel = mMatch[1].trim().toUpperCase()
          // Description is the rest of the text without model and numbers
          detectedDesc = text
            .replace(mMatch[1], '')
            .replace(new RegExp(`\\b${detectedQty}\\b`), '')
            .replace(/^\d{4,10}(-\d+)?\s*/, '')
            .replace(/\s+/g, ' ')
            .trim()
        } else if (isStrictApplianceModel(parts[0])) {
          detectedModel = parts[0].toUpperCase()
          detectedDesc = parts.slice(1).join(' ').trim()
        }
      }
    }

    // If we have a valid model OR an item code with description
    if (detectedModel || (tokens.length >= 2 && foundQty)) {
      const finalModel = detectedModel || tokens[0].toUpperCase()
      const finalDesc = detectedDesc || text.replace(finalModel, '').trim()

      if (finalModel.length >= 3 && !STOPWORDS.has(finalModel)) {
        items.push({
          modelo: finalModel,
          descripcion: finalDesc && finalDesc.length > 2 ? finalDesc : undefined,
          ean: eanStr,
          cantidad: detectedQty,
          fuente: 'pdf',
          raw_data: {
            lineText: text,
            foundQty,
          },
        })
      }
    }
  }

  return items
}

/**
 * Fallback line extractor with strict alphanumeric validation
 */
function extractFallbackFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  const modelPattern = /\b([A-Z]{2,4}\s*\d{3,4}(?:\s*[A-Z])?|[A-Z0-9][A-Z0-9\-_./]{3,24})\b/g

  for (const line of lines) {
    const text = line.text.trim()
    if (isPureMetadata(text)) continue

    const matches = Array.from(text.matchAll(modelPattern))
    for (const match of matches) {
      const candidate = match[1].toUpperCase()
      if (isStrictApplianceModel(candidate)) {
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
        const filteredOcr = ocrResult.items.filter((item) => isStrictApplianceModel(item.modelo))
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
    if (isPureMetadata(text)) continue

    const tokens = text.split(/\s+/)
    const candidate = tokens.find((t) => isStrictApplianceModel(t))

    if (candidate) {
      const desc = text.replace(candidate, '').trim()
      items.push({
        modelo: candidate.toUpperCase(),
        descripcion: desc && desc.length > 2 ? desc : undefined,
        cantidad: 1,
        fuente: 'pdf',
        raw_data: { broadLine: text },
      })
    }
  }

  return items
}



