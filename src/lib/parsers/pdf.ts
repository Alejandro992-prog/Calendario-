import type { ParsedItem, PdfZoneConfig } from '@/types'
import { extractFromImage } from './ocr'

/**
 * Configure PDF.js worker securely with fallback CDN
 */
async function getPdfJs() {
  const pdfjsLib = await import('pdfjs-dist')
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.js',
        import.meta.url
      ).toString()
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${
        pdfjsLib.version || '3.11.174'
      }/pdf.worker.min.js`
    }
  }
  return pdfjsLib
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
export async function parsePDF(file: File, zone?: PdfZoneConfig | null): Promise<ParsedItem[]> {
  const pdfjsLib = await getPdfJs()
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
    // We need viewport dimensions to convert zone % → PDF units
    const viewport = page.getViewport({ scale: 1.0 })

    const rawItems: PositionedText[] = []
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim().length > 0) {
        const transform = item.transform || [1, 0, 0, 1, 0, 0]
        const itemX = transform[4] || 0
        // PDF.js uses bottom-left origin; convert to top-left for consistency with zone %
        const itemY = viewport.height - (transform[5] || 0)

        // If a zone is defined, filter to only include items intersecting that region
        if (zone) {
          const zoneLeft = (zone.x / 100) * viewport.width
          const zoneTop = (zone.y / 100) * viewport.height
          const zoneRight = zoneLeft + (zone.width / 100) * viewport.width
          const zoneBottom = zoneTop + (zone.height / 100) * viewport.height

          const itemRight = itemX + (item.width || 0)
          const itemBottom = itemY + (item.height || 10)

          // Drop item only if it's completely outside the zone (with small 3px margin for tolerance)
          if (
            itemRight < zoneLeft - 3 ||
            itemX > zoneRight + 3 ||
            itemBottom < zoneTop - 3 ||
            itemY > zoneBottom + 3
          ) {
            continue
          }
        }

        rawItems.push({
          str: item.str,
          x: itemX,
          y: itemY,
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
    return extractViaPdfOcr(pdf, zone)
  }

  const parsedItems = extractItemsFromLines(allLines)

  // If text was extracted but no items were recognized with strict line heuristics,
  // try pattern & OCR fallback
  if (parsedItems.length === 0) {
    const fallbackItems = extractFallbackFromLines(allLines)
    if (fallbackItems.length > 0) {
      return fallbackItems
    }
    // Try OCR as last resort
    return extractViaPdfOcr(pdf, zone)
  }

  return parsedItems
}

/**
 * Group positioned text fragments into horizontal lines based on Y coordinate
 */
function groupItemsIntoLines(items: PositionedText[]): TextLine[] {
  if (!items.length) return []

  // Sort ascending by Y (top of page first, where y=0 is the top)
  const sorted = [...items].sort((a, b) => a.y - b.y)
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
 * Extract items from structured lines
 */
function extractItemsFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  const eanRegex = /\b(\d{13})\b/
  const modelRegex = /\b([A-Z0-9][A-Z0-9\-_./]{3,24})\b/

  // Normalize a string: lowercase + strip accents (handles DESCRIPCIÓN → descripcion, etc.)
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Words that identify a line as a column header / document metadata
  const HEADER_WORDS = [
    'albaran', 'factura', 'fecha', 'subtotal', 'total',
    'pagina', 'paginas', 'c.i.f.', 'cif', 'nif', 'telefono',
    'direccion', 'descripcion', 'referencia', 'articulo',
    'cantidad', 'unidades', 'precio', 'importe', 'base',
    'modelo', 'partida', 'linea', 'origen', 'observaciones',
    'cant.', 'art.', 'orig.', 'ref.', 'uds.', 'cant', 'uds',
  ]

  // Words that alone cannot be a model code
  const MODEL_BLOCKLIST = new Set([
    'UNIDADES', 'CANTIDAD', 'MODELO', 'ARTICULO', 'ARTÍCULO',
    'DESCRIPCION', 'DESCRIPCIÓN', 'PRECIO', 'TOTAL', 'BASE',
    'REFERENCIA', 'PARTIDA', 'LINEA', 'LÍNEA', 'CANT', 'ART',
    'ORIG', 'ORIGEN', 'OBSERVACIONES', 'SUBTOTAL', 'IMPORTE',
  ])

  for (const line of lines) {
    const text = line.text.trim()
    if (!text || text.length < 3) continue

    const norm = normalize(text)

    // Tokenize line to check header words cleanly with word boundaries
    const lineTokens = norm
      .split(/[\s,;:|/]+/)
      .map((t) => t.trim().replace(/[.,]$/, ''))
      .filter(Boolean)

    // Check if line is a table header:
    // Either starts directly with a known header keyword, or is predominantly composed of header tokens
    const headerTokenMatches = lineTokens.filter((token) =>
      HEADER_WORDS.some((hw) => hw.replace(/\./g, '') === token)
    )

    const isHeader =
      // Case 1: The line is very short and equals a header word (e.g. "DESCRIPCIÓN" or "CANT.")
      (lineTokens.length <= 2 && headerTokenMatches.length >= 1) ||
      // Case 2: 40%+ of the tokens on the line are column headers (e.g. "CANT. ART. ORIG. DESCRIPCIÓN PRECIO")
      (lineTokens.length >= 2 && headerTokenMatches.length / lineTokens.length >= 0.4) ||
      // Case 3: Line starts with clear document metadata keywords
      /^(albaran|factura|fecha\s*:|pagina\s*\d|cif\s*:|nif\s*:|telefono\s*:)/i.test(norm)

    if (isHeader) continue

    // Split text into tokens / columns from PDF visual items
    const parts = line.items.map((i) => i.str.trim()).filter(Boolean)
    if (parts.length < 1) continue

    const eanMatch = text.match(eanRegex)

    // ── Quantity detection ────────────────────────────────────────────────────
    // Look for the LAST number in the line (right-most = quantity column in albaranes).
    // E.g.: "1.00", "2 uds", "10"
    let cantidad = 1
    let foundQuantityInLine = false
    const lastNumberMatch = text.match(/(\d{1,5})(?:[.,]\d+)?\s*(?:ud|uds|pcs|unid|unidades|u\.?)?\s*$/i)

    // ── Model detection ──────────────────────────────────────────────────────
    let foundModel = ''
    let descriptionParts: string[] = []

    for (const part of parts) {
      const isEan = eanMatch && part === eanMatch[1]
      // Consider a part a quantity/price if it's purely numeric (possibly with decimal)
      const isQtyOrPrice = /^\d+([.,]\d+)?\s*(ud|uds|pcs|unid|u\.?)?$/i.test(part)

      if (!foundModel && !isEan && !isQtyOrPrice && modelRegex.test(part)) {
        const upper = part.toUpperCase()
        if (!MODEL_BLOCKLIST.has(upper) && /[0-9]/.test(upper)) {
          foundModel = upper
          continue
        }
      }

      if (!isEan && !isQtyOrPrice && part !== foundModel) {
        descriptionParts.push(part)
      }
    }

    // Fallback: no alphanumeric code found with mixed letters and numbers
    if (!foundModel && parts.length >= 1) {
      const validParts = parts.filter((p) => {
        const pNorm = normalize(p)
        return !HEADER_WORDS.some((w) => pNorm === w || pNorm === w.replace(/\./g, ''))
      })

      if (validParts.length > 0) {
        // If line is short and has no quantity column, use the whole phrase as model
        if (text.length <= 35 && !lastNumberMatch) {
          foundModel = text.toUpperCase()
          descriptionParts = []
        } else {
          foundModel = validParts[0].toUpperCase()
          descriptionParts = validParts.slice(1)
        }
      }
    }

    // Process detected quantity safely:
    if (lastNumberMatch) {
      const num = parseInt(lastNumberMatch[1], 10)
      // Check if this number is just the model itself or part of it (e.g. "IZ 6415" -> don't treat 6415 as qty!)
      const isPartOfModel = foundModel && (foundModel === lastNumberMatch[1] || foundModel.endsWith(lastNumberMatch[1]))
      if (num > 0 && num < 10000 && !isPartOfModel) {
        cantidad = num
        foundQuantityInLine = true
      }
    }

    if (foundModel) {
      // Clean description: drop only the detected quantity token, preserving product numbers (e.g. "978" in "MTP 978")
      const descTokens = descriptionParts.filter((p) => {
        const trimmed = p.trim()
        if (foundQuantityInLine && lastNumberMatch && (trimmed === lastNumberMatch[0].trim() || trimmed === lastNumberMatch[1])) {
          return false
        }
        return true
      })

      const desc = descTokens
        .join(' ')
        .replace(foundModel, '')
        .trim()

      items.push({
        modelo: foundModel,
        descripcion: desc || undefined,
        ean: eanMatch ? eanMatch[1] : undefined,
        cantidad,
        fuente: 'pdf',
        raw_data: { lineText: text },
      })
    }
  }

  return items
}

/**
 * Fallback line extractor when standard column matching finds 0 items
 */
function extractFallbackFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  const modelPattern = /\b([A-Z0-9][A-Z0-9\-_]{3,22})\b/g

  for (const line of lines) {
    const text = line.text.trim()
    const matches = Array.from(text.matchAll(modelPattern))
    for (const match of matches) {
      const code = match[1].toUpperCase()
      // Needs to have at least one digit and one letter to be a reliable appliance model
      if (/[A-Z]/.test(code) && /[0-9]/.test(code) && code.length >= 4) {
        items.push({
          modelo: code,
          descripcion: text.replace(code, '').trim() || undefined,
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
 * OCR Fallback for scanned PDFs (renders page onto canvas and runs OCR).
 * If a zone is provided, only the selected region of the canvas is sent to OCR.
 */
async function extractViaPdfOcr(pdf: any, zone?: PdfZoneConfig | null): Promise<ParsedItem[]> {
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

    let sourceCanvas = canvas

    // If a zone is defined, crop the canvas to that region before OCR
    if (zone) {
      const cropX = Math.round(zone.x / 100 * viewport.width)
      const cropY = Math.round(zone.y / 100 * viewport.height)
      const cropW = Math.round(zone.width / 100 * viewport.width)
      const cropH = Math.round(zone.height / 100 * viewport.height)

      if (cropW > 10 && cropH > 10) {
        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = cropW
        cropCanvas.height = cropH
        const cropCtx = cropCanvas.getContext('2d')!
        cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
        sourceCanvas = cropCanvas
      }
    }

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) =>
      sourceCanvas.toBlob((b) => resolve(b), 'image/png')
    )

    if (blob) {
      const ocrResult = await extractFromImage(blob)
      if (ocrResult.items.length > 0) {
        allOcrItems.push(...ocrResult.items)
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
