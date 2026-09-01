import type { ParsedItem } from '@/types'

export interface OcrResult {
  items: ParsedItem[]
  rawText: string
  method: 'openai-vision' | 'tesseract' | 'failed'
}

/**
 * Extract product information from a clipboard image (screenshot).
 * Tries OpenAI GPT-4o Vision first, falls back to Tesseract.js.
 */
export async function extractFromImage(imageBlob: Blob): Promise<OcrResult> {
  const openAiKey = import.meta.env.VITE_OPENAI_API_KEY as string

  if (openAiKey && openAiKey.startsWith('sk-')) {
    try {
      return await extractWithOpenAI(imageBlob, openAiKey)
    } catch (err) {
      console.warn('OpenAI Vision failed, falling back to Tesseract:', err)
    }
  }

  return extractWithTesseract(imageBlob)
}

/**
 * OpenAI GPT-4o Vision extraction — high accuracy structured JSON output.
 */
async function extractWithOpenAI(blob: Blob, apiKey: string): Promise<OcrResult> {
  const base64 = await blobToBase64(blob)
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analiza esta imagen de un albarán o lista de productos de electrodomésticos.
Extrae TODOS los productos que veas y devuelve un JSON con este formato exacto:
{
  "items": [
    {
      "modelo": "código/referencia del modelo",
      "descripcion": "descripción del producto",
      "ean": "código EAN de 13 dígitos si aparece, o null",
      "cantidad": número entero
    }
  ]
}
Si no encuentras productos, devuelve {"items": []}.
Responde SOLO con el JSON, sin texto adicional.`,
            },
            {
              type: 'image_url',
              image_url: { url: base64, detail: 'high' },
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || '{}'
  
  // Clean JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { items: [] }

  const items: ParsedItem[] = (parsed.items || []).map((item: {
    modelo?: string;
    descripcion?: string;
    ean?: string | null;
    cantidad?: number;
  }) => ({
    modelo: item.modelo || '',
    descripcion: item.descripcion || undefined,
    ean: item.ean || undefined,
    cantidad: item.cantidad || 1,
    fuente: 'ocr' as const,
    raw_data: { source: 'openai-vision', raw: item },
  })).filter((i: ParsedItem) => i.modelo)

  return { items, rawText: content, method: 'openai-vision' }
}

/**
 * Tesseract.js extraction — client-side OCR fallback.
 */
async function extractWithTesseract(blob: Blob): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa+eng')
  
  const imageUrl = URL.createObjectURL(blob)
  const { data: { text } } = await worker.recognize(imageUrl)
  await worker.terminate()
  URL.revokeObjectURL(imageUrl)

  // Parse text with heuristics
  const items = parseTextHeuristic(text)
  
  return { items, rawText: text, method: 'tesseract' }
}

/**
 * Intelligent heuristic parser for OCR text output (scanned PDFs & image screenshots).
 */
function parseTextHeuristic(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 5)
  const items: ParsedItem[] = []

  const genericWords = new Set([
    'FACTURA', 'ALBARAN', 'ALBARÁN', 'CLIENTE', 'FECHA', 'TOTAL', 'SUBTOTAL', 'BASE',
    'IVA', 'IMPORTE', 'PRECIO', 'PAGINA', 'PÁGINA', 'ARTICULO', 'ARTÍCULO', 'CANTIDAD',
    'DESCRIPCION', 'DESCRIPCIÓN', 'DESCUENTOS', 'NETO', 'VENCIMIENTO', 'VENCIMIENTOS',
    'EFECTIVO', 'REMITENTE', 'DESTINATARIO', 'TELÉFONO', 'TELEFONO', 'DEVOLUCION',
    'DEVOLUCIÓN', 'RECLICLAJE', 'GARDE', 'LIDERCADENA', 'SCANNED', 'CAMSCANNER'
  ])

  for (const line of lines) {
    const upper = line.toUpperCase()

    // Skip pure header, footer or legal lines
    if (
      upper.startsWith('FACTURA') ||
      upper.startsWith('ALBARAN') ||
      upper.startsWith('FECHA') ||
      upper.startsWith('CLIENTE') ||
      upper.startsWith('TOTAL') ||
      upper.startsWith('BASE') ||
      upper.startsWith('SCANNED') ||
      upper.startsWith('INCLUIDO TASA') ||
      upper.startsWith('NO SE ACEPTARA') ||
      upper.startsWith('PROTECCIÓN DE DATOS') ||
      upper.includes('REGISTRO MERCANTIL')
    ) {
      continue
    }

    // Clean line from currency and tax percentages (e.g. "80.59 €", "21%", "0%")
    const cleanLine = line
      .replace(/\b\d+[,.]\d{2}\s*€?\b/g, '')
      .replace(/\b\d+%\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Match real model codes (e.g. MIG2033, DFS05013X, 3KFE662WI, 10107017, 02502001, KFI960, SFB8028)
    const modelMatch = cleanLine.match(
      /\b([A-Z]{2,4}\d{3,5}[A-Z]?|[A-Z0-9]{2,}\d[A-Z0-9\-_./]*|\b[A-Z]{2,4}\s+\d{3,4}\b|\b\d{7,10}\b)\b/i
    )

    // Match leading article code if line starts with 4-6 digit SKU (e.g. 58016, 62524, 11917, 26688)
    const leadingSkuMatch = cleanLine.match(/^(\d{4,8})\s+(.*)$/)

    // Match quantity (an isolated integer 1-500 near the middle or end of the line)
    const qtyMatch = cleanLine.match(/\b([1-9]\d{0,2})\s*(?:ud|uds|pcs|unid)?(?:\s*$|\s+[A-Z])/i)
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1

    let finalModel = ''
    let finalDesc = ''

    if (modelMatch && !genericWords.has(modelMatch[1].toUpperCase())) {
      finalModel = modelMatch[1].toUpperCase().trim()
      finalDesc = cleanLine
        .replace(modelMatch[0], '')
        .replace(new RegExp(`\\b${quantity}\\b`), '')
        .replace(/^\d{4,8}\s+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    } else if (leadingSkuMatch) {
      finalModel = leadingSkuMatch[1]
      finalDesc = leadingSkuMatch[2].replace(new RegExp(`\\b${quantity}\\b`), '').trim()
    }

    // If we have a valid non-generic model and some description
    if (finalModel && finalModel.length >= 3 && !genericWords.has(finalModel)) {
      items.push({
        modelo: finalModel,
        descripcion: finalDesc && finalDesc.length > 2 ? finalDesc : undefined,
        cantidad: quantity > 0 && quantity <= 500 ? quantity : 1,
        fuente: 'ocr',
        raw_data: { raw_line: line, cleanLine, ocr_method: 'tesseract' },
      })
    }
  }

  return items
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
