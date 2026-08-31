import type { ParsedItem } from '@/types'
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
export async function parsePDF(file: File): Promise<ParsedItem[]> {
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

  const parsedItems = extractItemsFromLines(allLines)

  // If text was extracted but no items were recognized with strict line heuristics,
  // try pattern & OCR fallback
  if (parsedItems.length === 0) {
    const fallbackItems = extractFallbackFromLines(allLines)
    if (fallbackItems.length > 0) {
      return fallbackItems
    }
    // Try OCR as last resort
    return extractViaPdfOcr(pdf)
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
 * Extract items from structured lines
 */
function extractItemsFromLines(lines: TextLine[]): ParsedItem[] {
  const items: ParsedItem[] = []
  const eanRegex = /\b(\d{13})\b/
  const qtyRegex = /\b(\d{1,4})\s*(ud|uds|pcs|unid|unidades|u\b)?/i
  const modelRegex = /\b([A-Z0-9][A-Z0-9\-_./]{3,24})\b/

  for (const line of lines) {
    const text = line.text.trim()
    if (!text || text.length < 4) continue

    const lower = text.toLowerCase()
    // Skip common document headers and footers
    if (
      lower.includes('albaran') ||
      lower.includes('albarán') ||
      lower.includes('factura') ||
      lower.includes('fecha:') ||
      lower.includes('subtotal') ||
      lower.includes('total ') ||
      lower.includes('pagina') ||
      lower.includes('c.i.f.') ||
      lower.includes('cif:') ||
      lower.includes('nif:') ||
      lower.includes('telefono') ||
      lower.includes('teléfono') ||
      lower.includes('direccion') ||
      lower.includes('dirección')
    ) {
      continue
    }

    // Split text into tokens / columns
    const parts = line.items.map((i) => i.str.trim()).filter(Boolean)
    if (parts.length < 1) continue

    const eanMatch = text.match(eanRegex)
    const qtyMatch = text.match(qtyRegex)

    // Look for candidate model token
    let foundModel = ''
    let descriptionParts: string[] = []

    for (const part of parts) {
      const isEan = eanMatch && part === eanMatch[1]
      const isQty = /^\d{1,4}(\s*(ud|uds|pcs))?$/i.test(part)
      const isPrice = /^\d+[,.]\d{2}\s*€?$/.test(part)

      if (!foundModel && !isEan && !isQty && !isPrice && modelRegex.test(part)) {
        // Only accept if it looks like a real model (contains digits/letters, not just common words)
        const upper = part.toUpperCase()
        if (
          !['UNIDADES', 'CANTIDAD', 'MODELO', 'ARTICULO', 'DESCRIPCION', 'PRECIO', 'TOTAL'].includes(upper) &&
          /[0-9]/.test(upper)
        ) {
          foundModel = upper
          continue
        }
      }

      if (!isEan && !isQty && !isPrice && part !== foundModel) {
        descriptionParts.push(part)
      }
    }

    // Fallback: If no model with digits found, check first token
    if (!foundModel && parts.length >= 2) {
      const first = parts[0].toUpperCase()
      if (
        first.length >= 3 &&
        first.length <= 25 &&
        !['UNIDADES', 'CANTIDAD', 'MODELO', 'ARTICULO', 'DESCRIPCION', 'TOTAL', 'BASE'].includes(first)
      ) {
        foundModel = first
        descriptionParts = parts.slice(1)
      }
    }

    if (foundModel) {
      let cantidad = 1
      if (qtyMatch) {
        const num = parseInt(qtyMatch[1], 10)
        if (num > 0 && num < 10000) cantidad = num
      }

      const desc = descriptionParts.join(' ').replace(foundModel, '').trim()

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
