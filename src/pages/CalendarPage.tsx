import { useEffect, useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Plus, Search, X, Truck, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { format } from 'date-fns'
import type { Delivery, DeliveryItem, Supplier } from '@/types'
import DeliveryModal from '@/components/calendar/DeliveryModal'
import FileIngestor from '@/components/deliveries/FileIngestor'

const STATUS_COLORS: Record<string, string> = {
  Programada:  '#3b82f6',
  'En muelle': '#f59e0b',
  Descargada:  '#22c55e',
  Cancelada:   '#6b7280',
}

export default function CalendarPage() {
  const { profile } = useAuthStore()
  const canEdit = profile?.rol === 'Administrador' || profile?.rol === 'Compras'

  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDate, setModalDate] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<(DeliveryItem & { delivery?: Delivery })[]>([])
  const [searching, setSearching] = useState(false)
  const [showIngestor, setShowIngestor] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadDeliveries()
    loadSuppliers()
  }, [])

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!searchQuery.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(() => searchModels(searchQuery), 300)
  }, [searchQuery])

  const loadDeliveries = async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('*, supplier:suppliers(nombre, id), items:delivery_items(count)')
      .order('fecha_prevista', { ascending: true })
    const dels = (data || []) as Delivery[]
    
    setDeliveries(dels)
    setEvents(
      dels.map((d) => ({
        id: d.id,
        title: `🚚 ${(d as any).supplier?.nombre || 'Sin proveedor'}`,
        date: d.fecha_prevista,
        backgroundColor: STATUS_COLORS[d.estado] || '#3b82f6',
        borderColor: 'transparent',
        extendedProps: { delivery: d },
      }))
    )
  }

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('activo', true)
    setSuppliers((data || []) as Supplier[])
  }

  const searchModels = async (q: string) => {
    setSearching(true)
    const { data } = await supabase
      .from('delivery_items')
      .select('*, delivery:deliveries(fecha_prevista, estado, supplier:suppliers(nombre))')
      .or(`modelo.ilike.%${q}%,ean.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .limit(20)
    setSearchResults((data || []) as (DeliveryItem & { delivery?: Delivery })[])
    setSearching(false)
  }

  const handleDateSelect = (selectInfo: any) => {
    if (!canEdit) return
    setModalDate(selectInfo.startStr)
    setSelectedDelivery(null)
    setShowModal(true)
  }

  const handleEventClick = (clickInfo: any) => {
    const del = clickInfo.event.extendedProps.delivery as Delivery
    setSelectedDelivery(del)
    setModalDate(del.fecha_prevista)
    setShowModal(true)
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            className="form-input pl-9 pr-4 w-full"
            placeholder="Buscar por modelo, EAN o descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            id="model-search"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}

          {/* Results dropdown */}
          {searchQuery && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-800 border border-surface-600 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto animate-slide-in">
              {searching && (
                <div className="p-3 text-center text-sm text-surface-400">Buscando...</div>
              )}
              {!searching && searchResults.length === 0 && (
                <div className="p-4 text-center text-sm text-surface-500">
                  No se encontraron resultados para "{searchQuery}"
                </div>
              )}
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 hover:bg-surface-700/50 border-b border-surface-700/50 last:border-0"
                >
                  <Package size={16} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{item.modelo}</span>
                      {item.ean && (
                        <span className="text-xs text-surface-500 font-mono">{item.ean}</span>
                      )}
                    </div>
                    {item.descripcion && (
                      <p className="text-xs text-surface-400 truncate">{item.descripcion}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Truck size={11} className="text-surface-500" />
                      <span className="text-xs text-surface-400">
                        {(item.delivery as any)?.supplier?.nombre || 'Proveedor desconocido'}
                      </span>
                      <span className="text-xs text-brand-400">
                        {item.delivery?.fecha_prevista
                          ? format(new Date(item.delivery.fecha_prevista + 'T00:00:00'), 'dd/MM/yyyy')
                          : '—'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-surface-400 whitespace-nowrap">
                    ×{item.cantidad}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setShowIngestor(!showIngestor)}
              className="btn-secondary flex-1 sm:flex-initial justify-center"
              id="btn-open-ingestor"
            >
              <Package size={16} /> Importar Albarán
            </button>
            <button
              onClick={() => { setSelectedDelivery(null); setModalDate(''); setShowModal(true) }}
              className="btn-primary flex-1 sm:flex-initial justify-center"
              id="btn-new-delivery"
            >
              <Plus size={16} /> Nueva Descarga
            </button>
          </div>
        )}
      </div>

      {/* File ingestor */}
      {showIngestor && canEdit && (
        <FileIngestor
          suppliers={suppliers}
          onClose={() => setShowIngestor(false)}
          onImported={loadDeliveries}
        />
      )}

      {/* Calendar */}
      <div className="card p-0 overflow-hidden">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin] as any}
          initialView="dayGridMonth"
          locale="es"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          events={events}
          selectable={canEdit}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height={620}
          eventDisplay="block"
          dayMaxEvents={3}
        />
      </div>

      {/* Delivery Modal */}
      {showModal && (
        <DeliveryModal
          delivery={selectedDelivery}
          defaultDate={modalDate}
          suppliers={suppliers}
          canEdit={canEdit}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadDeliveries() }}
        />
      )}
    </div>
  )
}
