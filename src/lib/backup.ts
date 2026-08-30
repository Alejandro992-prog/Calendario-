import { supabase } from './supabase'
import { format } from 'date-fns'

export interface BackupData {
  metadata: {
    appName: string
    version: string
    exportedAt: string
    exportedBy?: string
    counts: Record<string, number>
  }
  data: {
    profiles: any[]
    suppliers: any[]
    deliveries: any[]
    delivery_items: any[]
    stock_shortages: any[]
    shortage_comments: any[]
    price_alerts: any[]
    audit_log: any[]
  }
}

/**
 * Recopila todos los datos de la base de datos Supabase y genera un archivo de copia de seguridad JSON
 */
export async function generateFullBackup(userEmail?: string): Promise<{ success: boolean; data?: BackupData; error?: string }> {
  try {
    const [
      profilesRes,
      suppliersRes,
      deliveriesRes,
      deliveryItemsRes,
      shortagesRes,
      shortageCommentsRes,
      priceAlertsRes,
      auditRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('suppliers').select('*').order('created_at', { ascending: true }),
      supabase.from('deliveries').select('*, supplier:suppliers(*)').order('fecha_prevista', { ascending: true }),
      supabase.from('delivery_items').select('*').order('created_at', { ascending: true }),
      supabase.from('stock_shortages').select('*').order('created_at', { ascending: true }),
      supabase.from('shortage_comments').select('*').order('created_at', { ascending: true }),
      supabase.from('price_alerts').select('*').order('created_at', { ascending: true }),
      supabase.from('audit_log').select('*').order('created_at', { ascending: true }),
    ])

    const backup: BackupData = {
      metadata: {
        appName: 'Garde Electrodomésticos - Calendario & Faltas',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: userEmail || 'Administrador',
        counts: {
          profiles: profilesRes.data?.length || 0,
          suppliers: suppliersRes.data?.length || 0,
          deliveries: deliveriesRes.data?.length || 0,
          delivery_items: deliveryItemsRes.data?.length || 0,
          stock_shortages: shortagesRes.data?.length || 0,
          shortage_comments: shortageCommentsRes.data?.length || 0,
          price_alerts: priceAlertsRes.data?.length || 0,
          audit_log: auditRes.data?.length || 0,
        },
      },
      data: {
        profiles: profilesRes.data || [],
        suppliers: suppliersRes.data || [],
        deliveries: deliveriesRes.data || [],
        delivery_items: deliveryItemsRes.data || [],
        stock_shortages: shortagesRes.data || [],
        shortage_comments: shortageCommentsRes.data || [],
        price_alerts: priceAlertsRes.data || [],
        audit_log: auditRes.data || [],
      },
    }

    return { success: true, data: backup }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al generar la copia de seguridad' }
  }
}

/**
 * Descarga el archivo JSON en el navegador del usuario
 */
export function downloadBackupFile(backup: BackupData) {
  const dateStr = format(new Date(), 'yyyy-MM-dd_HH-mm')
  const fileName = `copia_seguridad_garde_${dateStr}.json`
  const jsonContent = JSON.stringify(backup, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
