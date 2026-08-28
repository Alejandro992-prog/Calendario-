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
 * Simple heuristic parser for OCR text output.
 */
function parseTextHeuristic(text: string): ParsedItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 3)
  const items: ParsedItem[] = []
  const eanPattern = /\b\d{13}\b/
  const qtyPattern = /\b(\d{1,4})\s*(ud|uds|pcs|unid)?$/i

  for (const line of lines) {
    const eanMatch = line.match(eanPattern)
    const qtyMatch = line.match(qtyPattern)
    
    // Look for model-like codes: at least 4 chars, contains letters and numbers
    const modelMatch = line.match(/\b([A-Z][A-Z0-9\-\_]{3,19})\b/)
    
    if (!modelMatch) continue

    items.push({
      modelo: modelMatch[1],
      descripcion: line.replace(modelMatch[0], '').replace(eanMatch?.[0] || '', '').trim() || undefined,
      ean: eanMatch ? eanMatch[0] : undefined,
      cantidad: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      fuente: 'ocr',
      raw_data: { raw_line: line, ocr_method: 'tesseract' },
    })
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
