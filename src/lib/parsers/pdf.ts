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
 * Checks if a token matches the strict criteria for an appliance model:
 * 1. Between 3 and 32 characters
 * 2. Must not be a CIF, NIF, DNI, Postal code, Phone number, or Date
 * 3. Must not be in STOPWORDS dictionary
 * 4. Must have letters and numbers OR match typical appliance model patterns
 */
function isValidApplianceModel(token: string): boolean {
  if (!token || token.length < 3 || token.length > 32) return false

  const clean = token.toUpperCase().trim().replace(/^[#\-:.]+|[#\-:.]+$/g, '')
  if (clean.length < 3) return false

  // 1. Stopwords check
  if (STOPWORDS.has(clean)) return false

  // 2. Reject CIF / NIF / NIE / VAT (e.g. B92705987, A12345678, 12345678Z, B-92705987, ESB92705987)
  if (
    /^[A-HJ-NP-SUVW]\d{7,8}[0-9A-J]?$/i.test(clean) ||
    /^\d{8}[A-Z]$/i.test(clean) ||
    /^[XYZ]\d{7,8}[A-Z]$/i.test(clean) ||
    /^ES[A-Z0-9]{8,10}$/i.test(clean)
  ) {
    return false
  }

  // 3. Reject Postal codes (5 digits)
  if (/^\d{5}$/.test(clean)) return false

  // 4. Reject Dates (e.g. 01/09/2026, 27/08/26, 2026-09-01)
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(clean) || /^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) return false

  // 5. Reject Phone numbers
  if (/^(\+34)?[6789]\d{8}$/.test(clean)) return false

  // 6. Reject Price / Percentages / Currency
  if (/^\d+([.,]\d+)?\s*(€|EUR|%|KG|KGS)?$/.test(clean)) return false

  // 7. Pure words with only letters (no digits) are NOT appliance models
  if (!/[0-9]/.test(clean)) return false

  // 8. Pure numbers without letters (unless long EAN-like 12-14 digits) are NOT models
  if (!/[A-Z]/.test(clean) && clean.length < 10) return false

  // 9. Valid appliance model pattern (letters, numbers, hyphens, slashes)
  return /^[A-Z0-9][A-Z0-9\-_./]{2,30}$/.test(clean)
}

/**
 * Validates whether a token represents a valid EAN-13, EAN-14 or EAN-8 barcode
 */
function isValidEan(token: string): boolean {
  const digits = token.replace(/\D/g, '')
  return digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14
}

/**
 * Checks if a full line is pure header/footer/metadata (and not an article row)
 */
function isMetadataLine(text: string): boolean {
  const upper = text.toUpperCase()

  // Common header lines with addresses, CIFs, invoices, or signatures
  if (
    upper.includes('ALBARAN') ||
    upper.includes('ALBARÁN') ||
    upper.includes('FACTURA') ||
    upper.includes('DATOS DEL CLIENTE') ||
    upper.includes('DATOS FISCALES') ||
    upper.includes('FORMA DE PAGO') ||
    upper.includes('VENCIMIENTO') ||
    upper.includes('BASE IMPONIBLE') ||
    upper.includes('TOTAL FACTURA') ||
    upper.includes('TOTAL GENERAL') ||
    upper.includes('FIRMA Y SELLO') ||
    upper.includes('CONFORME CLIENTE') ||
    upper.includes('PAGINA ') ||
    upper.includes('PÁGINA ') ||
    upper.includes('TEL.') ||
    upper.includes('TELÉFONO') ||
    upper.includes('C.I.F.') ||
    upper.includes('N.I.F.') ||
    upper.includes('IBAN:')
  ) {
    // Only metadata if it doesn't contain a real appliance model or EAN code
    const hasEan = /\b(84\d{11}|40\d{11}|88\d{11}|\d{13})\b/.test(text)
    if (!hasEan) {
      return true
    }
  }

  return false
}

/**
 * Extract items from structured lines with robust row pattern detection
 */
function extractItemsFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  if (!lines.length) return items

  const eanRegex = /\b(\d{12,14})\b/
  const qtyRegex = /\b(\d{1,4})\s*(ud|uds|pcs|unid|unidades|u\b)?/i

  for (const line of lines) {
    const text = line.text.trim()
    if (!text || text.length < 4) continue

    // Skip pure metadata / header / footer lines
    if (isMetadataLine(text)) continue

    // Split text into tokens sorted by X-coordinate
    const sortedParts = line.items
      .map((i) => ({ text: i.str.trim(), x: i.x, width: i.width }))
      .filter((p) => p.text.length > 0)

    if (sortedParts.length === 0) continue

    // Find candidate EAN
    const eanMatch = text.match(eanRegex)
    const eanStr = eanMatch && isValidEan(eanMatch[1]) ? eanMatch[1] : undefined

    // Find candidate Quantity (e.g. "1", "2 UDS", "12")
    let detectedQty = 1
    let foundQty = false

    for (let i = sortedParts.length - 1; i >= 0; i--) {
      const part = sortedParts[i].text
      // Match integer quantity 1-500
      const m = part.match(/^(\d{1,4})\s*(ud|uds|pcs|unid|u)?$/i)
      if (m) {
        const num = parseInt(m[1], 10)
        // Ensure it's not a year (like 2026), postal code (28001), or large ref
        if (num > 0 && num <= 500 && num !== 2024 && num !== 2025 && num !== 2026) {
          detectedQty = num
          foundQty = true
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

      // Skip Quantity token
      if (/^\d{1,4}(\s*(ud|uds|pcs|unid|u))?$/i.test(part)) continue

      // Skip Prices (e.g. "120,50", "21%", "0.00")
      if (/^\d+[,.]\d{2}\s*€?$/.test(part) || /^\d+[,.]\d{1,2}%$/.test(part)) continue

      // Check if this token is a valid model
      if (!foundModel && isValidApplianceModel(part)) {
        foundModel = part.toUpperCase().replace(/^[#\-:.]+|[#\-:.]+$/g, '')
        continue
      }

      // If not model, not stopword, collect as description
      if (!STOPWORDS.has(partUpper) && part !== foundModel) {
        descriptionTokens.push(part)
      }
    }

    // If no single token matched, check if adjacent tokens form a model (e.g. "HLB 840 P", "RB 34 T")
    if (!foundModel && sortedParts.length >= 2) {
      for (let i = 0; i < sortedParts.length - 1; i++) {
        const combo = `${sortedParts[i].text}${sortedParts[i + 1].text}`
        if (isValidApplianceModel(combo)) {
          foundModel = `${sortedParts[i].text} ${sortedParts[i + 1].text}`.toUpperCase()
          descriptionTokens = sortedParts
            .slice(i + 2)
            .map((p) => p.text)
            .filter((t) => !STOPWORDS.has(t.toUpperCase()))
          break
        }
      }
    }

    // Only record if we found a valid Model OR a valid EAN
    if (foundModel || eanStr) {
      const finalModel = foundModel || (eanStr ? `EAN-${eanStr}` : '')
      const finalDesc = descriptionTokens
        .join(' ')
        .replace(finalModel, '')
        .trim()

      // Ensure model is not an accidental line number or single digit
      if (finalModel.length >= 3) {
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
  // Matches strict alphanumeric models (must have letters and digits, min 3 chars)
  const modelPattern = /\b([A-Z0-9][A-Z0-9\-_./]{2,24})\b/g

  for (const line of lines) {
    const text = line.text.trim()
    if (isMetadataLine(text)) continue

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
    if (isMetadataLine(text)) continue

    // Extract any token that satisfies isValidApplianceModel
    const tokens = text.split(/\s+/)
    const candidate = tokens.find((t) => isValidApplianceModel(t))

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



