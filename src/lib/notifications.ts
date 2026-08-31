import { supabase } from './supabase'
import type { Profile } from '@/types'
import { isToday, isTomorrow, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export interface AppNotification {
  id: string
  type: 'comment' | 'status_change' | 'new_shortage' | 'delivery' | 'price'
  title: string
  subtitle: string
  detail?: string
  date: string
  timeAgo: string
  link: string
  isUrgent?: boolean
  authorName?: string
}

const STORAGE_KEY_PREFIX = 'garde_dismissed_notifs_'

export function getDismissedIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function saveDismissedId(userId: string, notifId: string) {
  try {
    const set = getDismissedIds(userId)
    set.add(notifId)
    // Keep max 500 dismissed IDs to prevent localStorage growth
    const arr = Array.from(set).slice(-500)
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(arr))
  } catch (err) {
    console.error('Error saving dismissed notification:', err)
  }
}

export function saveDismissedIds(userId: string, notifIds: string[]) {
  try {
    const set = getDismissedIds(userId)
    notifIds.forEach((id) => set.add(id))
    const arr = Array.from(set).slice(-500)
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(arr))
  } catch (err) {
    console.error('Error saving dismissed notifications:', err)
  }
}

/**
 * Loads and aggregates all actionable notifications for the current user:
 * - Comments made by colleagues on shortages the user reported or manages
 * - Status changes made by Compras/Admin on shortages the user reported
 * - New urgent shortages reported by colleagues (for Admin and Compras roles)
 * - Upcoming deliveries for today/tomorrow
 * - Price aggression alerts
 */
export async function fetchUserNotifications(profile: Profile | null): Promise<AppNotification[]> {
  if (!profile) return []

  const userId = profile.id
  const userRole = profile.rol
  const dismissedSet = getDismissedIds(userId)
  const notifications: AppNotification[] = []

  try {
    const todayStr = new Date().toISOString().split('T')[0]

    // Fetch in parallel
    const [commentsRes, myShortagesRes, newShortagesRes, deliveriesRes, priceRes] =
      await Promise.all([
        // 1. Comments on shortages (recent 30 comments)
        supabase
          .from('shortage_comments')
          .select(`
            id,
            contenido,
            created_at,
            autor_id,
            autor:profiles!autor_id(nombre_completo, cargo, rol),
            shortage:stock_shortages(id, modelo, especificacion, categoria, reportado_por)
          `)
          .order('created_at', { ascending: false })
          .limit(30),

        // 2. Shortages reported by ME that have been managed or updated
        supabase
          .from('stock_shortages')
          .select(`
            id,
            modelo,
            especificacion,
            categoria,
            estado,
            urgencia,
            created_at,
            updated_at,
            gestionado_por,
            manager:profiles!gestionado_por(nombre_completo, cargo)
          `)
          .eq('reportado_por', userId)
          .not('gestionado_por', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(20),

        // 3. New shortages reported by other colleagues (for Compras & Admin)
        userRole === 'Administrador' || userRole === 'Compras'
          ? supabase
              .from('stock_shortages')
              .select(`
                id,
                modelo,
                especificacion,
                categoria,
                urgencia,
                estado,
                created_at,
                reportado_por,
                reporter:profiles!reportado_por(nombre_completo, cargo)
              `)
              .neq('reportado_por', userId)
              .not('estado', 'in', '(Descartado,Pedido,En Tránsito)')
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] }),

        // 4. Upcoming deliveries
        supabase
          .from('deliveries')
          .select('id, referencia, fecha_prevista, estado, franja_horaria, supplier:suppliers(nombre)')
          .in('estado', ['Programada', 'En muelle'])
          .gte('fecha_prevista', todayStr)
          .order('fecha_prevista', { ascending: true })
          .limit(6),

        // 5. Price alerts
        supabase
          .from('price_alerts')
          .select('id, modelo, competidor, precio_detectado, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

    // --- Process Comments ---
    if (commentsRes.data) {
      commentsRes.data.forEach((c: any) => {
        // Only notify if comment was NOT made by me, AND shortage was reported by me OR user is Admin/Compras
        const isMyShortage = c.shortage?.reportado_por === userId
        const isNotMe = c.autor_id !== userId

        if (isNotMe && (isMyShortage || userRole === 'Administrador' || userRole === 'Compras')) {
          const notifId = `comment-${c.id}`
          if (!dismissedSet.has(notifId)) {
            const author = c.autor?.nombre_completo || 'Un compañero'
            const itemDesc = c.shortage?.modelo || c.shortage?.especificacion || c.shortage?.categoria || 'material'
            const dateObj = new Date(c.created_at)
            
            notifications.push({
              id: notifId,
              type: 'comment',
              title: `${author} respondió en una falta`,
              subtitle: `Falta: ${itemDesc}`,
              detail: `"${c.contenido}"`,
              date: c.created_at,
              timeAgo: formatDistanceToNow(dateObj, { addSuffix: true, locale: es }),
              link: '/shortages',
              authorName: author,
            })
          }
        }
      })
    }

    // --- Process Shortage Status Changes on My Reported Shortages ---
    if (myShortagesRes.data) {
      myShortagesRes.data.forEach((s: any) => {
        // If managed by someone else
        if (s.gestionado_por && s.gestionado_por !== userId) {
          const notifId = `status-${s.id}-${s.estado}`
          if (!dismissedSet.has(notifId)) {
            const manager = s.manager?.nombre_completo || 'Compras'
            const itemDesc = s.modelo || s.especificacion || s.categoria || 'material'
            const dateObj = new Date(s.updated_at || s.created_at)

            notifications.push({
              id: notifId,
              type: 'status_change',
              title: `Estado actualizado a "${s.estado}"`,
              subtitle: `Tu falta de ${itemDesc} ha sido actualizada por ${manager}`,
              date: s.updated_at || s.created_at,
              timeAgo: formatDistanceToNow(dateObj, { addSuffix: true, locale: es }),
              link: '/shortages',
              isUrgent: s.urgencia === 'Alta' || s.urgencia === 'Crítica',
              authorName: manager,
            })
          }
        }
      })
    }

    // --- Process New Shortages Reported by Others (for Compras / Admin) ---
    if (newShortagesRes.data) {
      newShortagesRes.data.forEach((s: any) => {
        const notifId = `new-shortage-${s.id}`
        if (!dismissedSet.has(notifId)) {
          const reporter = s.reporter?.nombre_completo || 'Un compañero'
          const itemDesc = s.modelo || s.especificacion || s.categoria || 'material'
          const dateObj = new Date(s.created_at)

          notifications.push({
            id: notifId,
            type: 'new_shortage',
            title: `Nueva falta reportada (${s.urgencia})`,
            subtitle: `${reporter} pide: ${itemDesc} (${s.categoria})`,
            date: s.created_at,
            timeAgo: formatDistanceToNow(dateObj, { addSuffix: true, locale: es }),
            link: '/shortages',
            isUrgent: s.urgencia === 'Alta' || s.urgencia === 'Crítica',
            authorName: reporter,
          })
        }
      })
    }

    // --- Process Deliveries ---
    if (deliveriesRes.data) {
      deliveriesRes.data.forEach((d: any) => {
        const notifId = `delivery-${d.id}`
        if (!dismissedSet.has(notifId)) {
          const dDate = new Date(d.fecha_prevista + 'T00:00:00')
          const tag = isToday(dDate) ? 'HOY' : isTomorrow(dDate) ? 'MAÑANA' : d.fecha_prevista
          const isSoon = isToday(dDate) || isTomorrow(dDate)

          notifications.push({
            id: notifId,
            type: 'delivery',
            title: `Descarga ${tag}: ${d.supplier?.nombre || 'Proveedor'}`,
            subtitle: `Ref: ${d.referencia || 'S/R'} · ${d.franja_horaria || d.estado}`,
            date: d.fecha_prevista,
            timeAgo: tag,
            link: '/calendar',
            isUrgent: isSoon,
          })
        }
      })
    }

    // --- Process Price Alerts ---
    if (priceRes.data) {
      priceRes.data.forEach((p: any) => {
        const notifId = `price-${p.id}`
        if (!dismissedSet.has(notifId)) {
          const dateObj = new Date(p.created_at)
          notifications.push({
            id: notifId,
            type: 'price',
            title: `Precio competidor: ${p.competidor}`,
            subtitle: `Modelo ${p.modelo} detectado a ${p.precio_detectado}€`,
            date: p.created_at,
            timeAgo: formatDistanceToNow(dateObj, { addSuffix: true, locale: es }),
            link: '/price-alerts',
          })
        }
      })
    }

    // Sort all notifications by date descending
    notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return notifications
  } catch (err) {
    console.error('Error fetching notifications:', err)
    return []
  }
}
