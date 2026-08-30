import type { ParsedItem } from '@/types'

/**
 * Parse a PDF file using PDF.js and extract text content.
 * Tries to identify product lines from structured PDFs (albaran format).
 */
export async function parsePDF(file: File): Promise<ParsedItem[]> {
  // Dynamically import pdfjs to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist')
  
  // Set worker source via reliable CDN matching current pdfjs version
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    fullText += pageText + '\n'
  }

  return extractItemsFromText(fullText)
}

/**
 * Heuristic extraction: looks for lines with model codes (alphanumeric sequences)
 * followed by optional EAN (13 digits) and quantity.
 */
function extractItemsFromText(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const items: ParsedItem[] = []

  // Pattern: MODEL  DESCRIPTION  EAN(13)  QTY
  const eanPattern = /\b\d{13}\b/
  const qtyPattern = /\b(\d{1,4})\s*(ud|uds|pcs|unid|unidades)?\b/i
  const modelPattern = /^[A-Z0-9\-\_]{4,20}$/

  for (const line of lines) {
    const parts = line.split(/\s{2,}|\t/)
    if (parts.length < 2) continue

    const possibleModel = parts[0].trim()
    if (!modelPattern.test(possibleModel)) continue

    const eanMatch = line.match(eanPattern)
    const qtyMatch = line.match(qtyPattern)

    items.push({
      modelo: possibleModel,
      descripcion: parts.slice(1, eanMatch ? -2 : undefined).join(' ').trim() || undefined,
      ean: eanMatch ? eanMatch[0] : undefined,
      cantidad: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      fuente: 'pdf',
      raw_data: { raw_line: line },
    })
  }

  return items
}
