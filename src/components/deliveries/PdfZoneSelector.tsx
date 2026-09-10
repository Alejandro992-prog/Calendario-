import { useEffect, useRef, useState, useCallback } from 'react'
import { CheckCircle2, RotateCcw, Maximize2, X, Info, ZoomIn, ZoomOut } from 'lucide-react'
import type { PdfZoneConfig } from '@/types'

interface PdfZoneSelectorProps {
  file: File
  /** Zona pre-guardada del proveedor (opcional) */
  initialZone?: PdfZoneConfig | null
  onZoneConfirmed: (zone: PdfZoneConfig | null) => void
  onCancel: () => void
}

interface DragState {
  active: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
const DEFAULT_ZOOM_INDEX = 2 // 1.0

// Convierte coordenadas de canvas a porcentajes respecto al canvas (con clamp 0-100%)
function toPercent(
  x: number, y: number, w: number, h: number,
  canvasW: number, canvasH: number
): PdfZoneConfig {
  const minX = Math.max(0, Math.min(canvasW, Math.min(x, x + w)))
  const minY = Math.max(0, Math.min(canvasH, Math.min(y, y + h)))
  const maxX = Math.max(0, Math.min(canvasW, Math.max(x, x + w)))
  const maxY = Math.max(0, Math.min(canvasH, Math.max(y, y + h)))

  return {
    x: (minX / canvasW) * 100,
    y: (minY / canvasH) * 100,
    width: ((maxX - minX) / canvasW) * 100,
    height: ((maxY - minY) / canvasH) * 100,
  }
}

// Convierte porcentajes a coordenadas de canvas
function fromPercent(
  zone: PdfZoneConfig,
  canvasW: number,
  canvasH: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: zone.x / 100 * canvasW,
    y: zone.y / 100 * canvasH,
    w: zone.width / 100 * canvasW,
    h: zone.height / 100 * canvasH,
  }
}

export default function PdfZoneSelector({
  file,
  initialZone,
  onZoneConfirmed,
  onCancel,
}: PdfZoneSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  // Keep a reference to the PDF page to re-render on zoom change
  const pdfPageRef = useRef<any>(null)

  const [rendered, setRendered] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [currentZone, setCurrentZone] = useState<PdfZoneConfig | null>(initialZone ?? null)
  const [isPreloaded, setIsPreloaded] = useState(!!initialZone)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const drag = useRef<DragState>({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 })

  const currentZoom = ZOOM_LEVELS[zoomIndex]

  // ── Overlay drawing ──────────────────────────────────────────────────────────
  const drawOverlay = useCallback((zone: PdfZoneConfig | null, tempDrag?: DragState) => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, overlay.width, overlay.height)

    const drawRect = (x: number, y: number, w: number, h: number, pre: boolean) => {
      ctx.clearRect(x, y, w, h)
      ctx.strokeStyle = pre ? 'rgba(99,179,237,0.9)' : 'rgba(74,222,128,1)'
      ctx.lineWidth = 2
      ctx.setLineDash(pre ? [6, 3] : [])
      ctx.strokeRect(x, y, w, h)
      const hSize = 8
      ctx.fillStyle = pre ? 'rgba(99,179,237,0.9)' : 'rgba(74,222,128,1)'
      const corners = [
        [x, y], [x + w - hSize, y],
        [x, y + h - hSize], [x + w - hSize, y + h - hSize],
      ]
      corners.forEach(([cx, cy]) => ctx.fillRect(cx, cy, hSize, hSize))
    }

    if (tempDrag?.active) {
      const x = Math.min(tempDrag.startX, tempDrag.currentX)
      const y = Math.min(tempDrag.startY, tempDrag.currentY)
      const w = Math.abs(tempDrag.currentX - tempDrag.startX)
      const h = Math.abs(tempDrag.currentY - tempDrag.startY)
      if (w > 5 && h > 5) drawRect(x, y, w, h, false)
    } else if (zone) {
      const { x, y, w, h } = fromPercent(zone, overlay.width, overlay.height)
      drawRect(x, y, w, h, isPreloaded)
    }
  }, [isPreloaded])

  // ── Render PDF page at a given scale ─────────────────────────────────────────
  const renderPageAtScale = useCallback(async (page: any, scale: number) => {
    const viewport = page.getViewport({ scale })
    const canvas = canvasRef.current
    const overlay = overlayCanvasRef.current
    if (!canvas || !overlay) return

    canvas.width = viewport.width
    canvas.height = viewport.height
    overlay.width = viewport.width
    overlay.height = viewport.height

    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    setRendered(true)
  }, [])

  // ── Initial PDF load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      try {
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

        const buffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
        const page = await pdf.getPage(1)
        if (cancelled) return

        pdfPageRef.current = page
        await renderPageAtScale(page, ZOOM_LEVELS[DEFAULT_ZOOM_INDEX])
      } catch (err: any) {
        if (!cancelled) setRenderError(err.message || 'Error renderizando el PDF')
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [file, renderPageAtScale])

  // ── Re-render when zoom changes ───────────────────────────────────────────────
  useEffect(() => {
    if (pdfPageRef.current && rendered) {
      setRendered(false)
      renderPageAtScale(pdfPageRef.current, currentZoom).then(() => {
        drawOverlay(currentZone)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIndex])

  // ── Re-draw overlay when zone or rendered changes ────────────────────────────
  useEffect(() => {
    if (rendered) drawOverlay(currentZone)
  }, [rendered, currentZone, drawOverlay])

  // ── Mouse event handlers ──────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect()
    const scaleX = overlayCanvasRef.current!.width / rect.width
    const scaleY = overlayCanvasRef.current!.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getPos(e)
    drag.current = { active: true, startX: x, startY: y, currentX: x, currentY: y }
    setIsPreloaded(false)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return
    const { x, y } = getPos(e)
    drag.current.currentX = x
    drag.current.currentY = y
    drawOverlay(null, drag.current)
  }

  // ── Global mouse up listener to safely handle releases outside canvas ───────
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!drag.current.active) return
      drag.current.active = false

      const overlay = overlayCanvasRef.current
      if (!overlay) return

      const rect = overlay.getBoundingClientRect()
      const scaleX = overlay.width / rect.width
      const scaleY = overlay.height / rect.height
      const endX = Math.max(0, Math.min(overlay.width, (e.clientX - rect.left) * scaleX))
      const endY = Math.max(0, Math.min(overlay.height, (e.clientY - rect.top) * scaleY))

      const w = Math.abs(endX - drag.current.startX)
      const h = Math.abs(endY - drag.current.startY)

      if (w < 20 || h < 20) {
        drawOverlay(currentZone)
        return
      }

      const newZone = toPercent(
        drag.current.startX, drag.current.startY,
        endX - drag.current.startX,
        endY - drag.current.startY,
        overlay.width, overlay.height
      )
      setCurrentZone(newZone)
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [currentZone, drawOverlay])

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return
    drag.current.active = false
    const { x, y } = getPos(e)
    drag.current.currentX = x
    drag.current.currentY = y

    const w = Math.abs(drag.current.currentX - drag.current.startX)
    const h = Math.abs(drag.current.currentY - drag.current.startY)

    if (w < 20 || h < 20) {
      drawOverlay(currentZone)
      return
    }

    const overlay = overlayCanvasRef.current!
    const newZone = toPercent(
      drag.current.startX, drag.current.startY,
      drag.current.currentX - drag.current.startX,
      drag.current.currentY - drag.current.startY,
      overlay.width, overlay.height
    )
    setCurrentZone(newZone)
  }

  const handleReset = () => {
    setCurrentZone(null)
    setIsPreloaded(false)
    const overlay = overlayCanvasRef.current
    if (overlay) {
      const ctx = overlay.getContext('2d')!
      ctx.clearRect(0, 0, overlay.width, overlay.height)
    }
  }

  const zoomIn = () => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1))
  const zoomOut = () => setZoomIndex((i) => Math.max(i - 1, 0))

  // Button style helper
  const btnBase = (active = true): React.CSSProperties => ({
    background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8, padding: '9px 16px',
    color: active ? '#e2e8f0' : '#475569',
    cursor: active ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
  })

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      zIndex: 9999,
      padding: '12px 16px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}>
            Selecciona la zona de productos
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            {isPreloaded
              ? '✅ Zona guardada del proveedor — puedes ajustarla redibujando'
              : 'Arrastra sobre el área donde aparecen los modelos/referencias del albarán'}
          </p>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none',
            borderRadius: 8, padding: '8px 12px',
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <X size={16} /> Cancelar
        </button>
      </div>

      {/* Info pill + zoom controls on same row */}
      <div style={{
        width: '100%', maxWidth: 1100,
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 10, flexShrink: 0,
      }}>
        {/* Info */}
        <div style={{
          flex: 1,
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 8, padding: '7px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#93c5fd', fontSize: 12,
        }}>
          <Info size={14} />
          <span>
            El OCR solo buscará productos <strong>dentro del área seleccionada</strong>.
            Incluye la columna de modelos y referencias.
          </span>
        </div>

        {/* Zoom controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '4px 10px',
          flexShrink: 0,
        }}>
          <button
            onClick={zoomOut}
            disabled={!rendered || zoomIndex === 0}
            title="Alejar"
            style={{
              background: 'none', border: 'none',
              color: !rendered || zoomIndex === 0 ? '#475569' : '#cbd5e1',
              cursor: !rendered || zoomIndex === 0 ? 'not-allowed' : 'pointer',
              padding: '4px 6px', borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <ZoomOut size={16} />
          </button>

          <span style={{
            color: '#e2e8f0', fontSize: 13, fontWeight: 600,
            minWidth: 40, textAlign: 'center',
          }}>
            {Math.round(currentZoom * 100)}%
          </span>

          <button
            onClick={zoomIn}
            disabled={!rendered || zoomIndex === ZOOM_LEVELS.length - 1}
            title="Acercar"
            style={{
              background: 'none', border: 'none',
              color: !rendered || zoomIndex === ZOOM_LEVELS.length - 1 ? '#475569' : '#cbd5e1',
              cursor: !rendered || zoomIndex === ZOOM_LEVELS.length - 1 ? 'not-allowed' : 'pointer',
              padding: '4px 6px', borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* Canvas container — scrollable, takes available height */}
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 1100,
        flex: 1,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        background: '#1e293b',
        minHeight: 300,
      }}>
        {!rendered && !renderError && (
          <div style={{
            width: '100%', height: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', gap: 10,
          }}>
            <span style={{
              display: 'inline-block', width: 18, height: 18,
              border: '2px solid #334155', borderTopColor: '#60a5fa',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <span>Cargando previsualización...</span>
          </div>
        )}
        {renderError && (
          <div style={{
            width: '100%', height: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#f87171', padding: 24, textAlign: 'center',
          }}>
            No se pudo renderizar el PDF: {renderError}
          </div>
        )}

        {/* Background PDF canvas */}
        <canvas
          ref={canvasRef}
          style={{ display: rendered ? 'block' : 'none', userSelect: 'none' }}
        />
        {/* Interactive overlay canvas */}
        <canvas
          ref={overlayCanvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          style={{
            position: 'absolute', top: 0, left: 0,
            display: rendered ? 'block' : 'none',
            cursor: 'crosshair',
          }}
        />
      </div>

      {/* Action buttons */}
      <div style={{
        width: '100%', maxWidth: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 12, gap: 10, flexShrink: 0,
      }}>
        {/* Left: secondary actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleReset}
            disabled={!currentZone}
            style={btnBase(!!currentZone)}
          >
            <RotateCcw size={14} /> Redibujar
          </button>

          <button
            onClick={() => onZoneConfirmed(null)}
            style={btnBase()}
          >
            <Maximize2 size={14} /> Usar documento completo
          </button>
        </div>

        {/* Right: confirm */}
        <button
          onClick={() => onZoneConfirmed(currentZone)}
          disabled={!currentZone}
          style={{
            background: currentZone
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'rgba(255,255,255,0.07)',
            border: 'none',
            borderRadius: 10, padding: '10px 24px',
            color: currentZone ? '#fff' : '#475569',
            cursor: currentZone ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8,
            fontWeight: 600, fontSize: 14,
            boxShadow: currentZone ? '0 4px 14px rgba(34,197,94,0.4)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          <CheckCircle2 size={16} />
          {isPreloaded ? 'Usar esta zona' : 'Confirmar zona y extraer productos'}
        </button>
      </div>
    </div>
  )
}
