import { supabase } from './supabase'
import type { Profile } from '@/types'
import { isToday, isTomorrow, formatDistanceToNow, subDays } from 'date-fns'
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

// In-memory cache for fast synchronous access
const memoryDismissedSets = new Map<string, Set<string>>()

/**
 * Gets currently dismissed notification IDs for a user from memory and localStorage.
 */
export function getDismissedIds(userId: string): Set<string> {
  if (memoryDismissedSets.has(userId)) {
    return memoryDismissedSets.get(userId)!
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    let set: Set<string>
    if (raw) {
      const parsed = JSON.parse(raw)
      set = new Set(Array.isArray(parsed) ? parsed : [])
    } else {
      set = new Set()
    }
    memoryDismissedSets.set(userId, set)
    return set
  } catch {
    const set = new Set<string>()
    memoryDismissedSets.set(userId, set)
    return set
  }
}

/**
 * Merges cloud dismissed IDs with local cache and saves back to both.
 */
export async function syncCloudDismissedIds(userId: string): Promise<Set<string>> {
  const localSet = getDismissedIds(userId)

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.id === userId) {
      const cloudDismissed: string[] = user.user_metadata?.dismissed_notifs || []
      if (Array.isArray(cloudDismissed)) {
        let changed = false
        cloudDismissed.forEach((id) => {
          if (!localSet.has(id)) {
            localSet.add(id)
            changed = true
          }
        })

        if (changed || localSet.size > cloudDismissed.length) {
          const arr = Array.from(localSet).slice(-2000)
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(arr))
          // Sync back union to cloud if local had more items
          if (localSet.size > cloudDismissed.length) {
            await supabase.auth.updateUser({
              data: { dismissed_notifs: arr }
            })
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error syncing cloud dismissed notifications:', err)
  }

  return localSet
}

let syncTimeout: any = null

function persistDismissedSet(userId: string, set: Set<string>) {
  try {
    // Keep max 2000 dismissed IDs
    const arr = Array.from(set).slice(-2000)
    memoryDismissedSets.set(userId, set)
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(arr))

    // Debounced asynchronous cloud persistence to user_metadata
    if (syncTimeout) clearTimeout(syncTimeout)
    syncTimeout = setTimeout(async () => {
      try {
        await supabase.auth.updateUser({
          data: { dismissed_notifs: arr }
        })
      } catch (err) {
        console.warn('Could not sync dismissed notifs to cloud:', err)
      }
    }, 800)
  } catch (err) {
    console.error('Error saving dismissed notifications:', err)
  }
}

export function saveDismissedId(userId: string, notifId: string) {
  const set = getDismissedIds(userId)
  set.add(notifId)
  persistDismissedSet(userId, set)
}

export function saveDismissedIds(userId: string, notifIds: string[]) {
  const set = getDismissedIds(userId)
  notifIds.forEach((id) => set.add(id))
  persistDismissedSet(userId, set)
}

/**
 * Loads and aggregates all actionable notifications for the current user:
 * - Comments made by colleagues on shortages the user reported or manages (last 30 days)
 * - Status changes made by Compras/Admin on shortages the user reported (last 30 days)
 * - New urgent shortages reported by colleagues (for Admin and Compras roles, last 30 days)
 * - Upcoming deliveries for today/tomorrow onwards
 * - Price aggression alerts (last 30 days)
 */
export async function fetchUserNotifications(profile: Profile | null): Promise<AppNotification[]> {
  if (!profile) return []

  const userId = profile.id
  const userRole = profile.rol

  // Sync cloud + local dismissed notifications
  const dismissedSet = await syncCloudDismissedIds(userId)
  const notifications: AppNotification[] = []

  try {
    const todayStr = new Date().toISOString().split('T')[0]
    // Filter only events from the last 30 days to avoid ancient historical records endlessly resurfacing
    const thirtyDaysAgoStr = subDays(new Date(), 30).toISOString()

    // Fetch in parallel
    const [commentsRes, myShortagesRes, newShortagesRes, deliveriesRes, priceRes] =
      await Promise.all([
        // 1. Comments on shortages (recent 30 comments from last 30 days)
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
          .gte('created_at', thirtyDaysAgoStr)
          .order('created_at', { ascending: false })
          .limit(30),

        // 2. Shortages reported by ME that have been managed or updated in last 30 days
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
          .gte('updated_at', thirtyDaysAgoStr)
          .order('updated_at', { ascending: false })
          .limit(20),

        // 3. New shortages reported by other colleagues (for Compras & Admin) in last 30 days
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
              .not('estado', 'in', '("Descartado","Pedido","En Tránsito")')
              .gte('created_at', thirtyDaysAgoStr)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),

        // 4. Upcoming deliveries
        supabase
          .from('deliveries')
          .select('id, referencia, fecha_prevista, estado, franja_horaria, supplier:suppliers(nombre)')
          .in('estado', ['Programada', 'En muelle'])
          .gte('fecha_prevista', todayStr)
          .order('fecha_prevista', { ascending: true })
          .limit(10),

        // 5. Price alerts from last 30 days
        supabase
          .from('price_alerts')
          .select('id, modelo, competidor, precio_detectado, created_at')
          .gte('created_at', thirtyDaysAgoStr)
          .order('created_at', { ascending: false })
          .limit(10),
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

