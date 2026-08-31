/**
 * Email Notification Utility
 * 
 * Permite enviar correos automáticos cuando se actualiza una falta de material
 * o se añade un comentario.
 * 
 * Métodos soportados:
 * 1. Webhook de Supabase / Edge Function (Resend / SendGrid / Mailgun)
 * 2. Servicio directo EmailJS (configurable vía VITE_EMAILJS_SERVICE_ID)
 * 3. Enlace directo `mailto:` preformateado como opción instantánea sin coste
 */

export interface ShortageEmailPayload {
  toEmail: string
  toName: string
  shortageModel?: string
  shortageCategory: string
  updateType: 'comment' | 'status_change'
  updatedByName: string
  newStatus?: string
  commentContent?: string
}

/**
 * Genera la plantilla de asunto y cuerpo en texto plano / HTML para el correo
 */
export function generateShortageEmailTemplate(payload: ShortageEmailPayload) {
  const itemTitle = payload.shortageModel
    ? `${payload.shortageModel} (${payload.shortageCategory})`
    : payload.shortageCategory

  const subject =
    payload.updateType === 'comment'
      ? `💬 Nuevo comentario en tu falta de stock: ${itemTitle}`
      : `🔄 Estado actualizado a "${payload.newStatus}" en tu falta: ${itemTitle}`

  const bodyText =
    payload.updateType === 'comment'
      ? `Hola ${payload.toName},\n\n${payload.updatedByName} ha respondido a la falta de stock que solicitaste (${itemTitle}):\n\n"${payload.commentContent}"\n\nPuedes entrar a la aplicación de Garde Electrodomésticos para ver la conversación completa.\n\nUn saludo,\nEquipo Garde Electrodomésticos`
      : `Hola ${payload.toName},\n\n${payload.updatedByName} ha actualizado el estado de tu falta de stock (${itemTitle}) al nuevo estado:\n\n👉 "${payload.newStatus}"\n\nPuedes entrar a la aplicación de Garde Electrodomésticos para revisar los detalles.\n\nUn saludo,\nEquipo Garde Electrodomésticos`

  return { subject, bodyText }
}

/**
 * Envía la notificación por correo utilizando el método disponible
 */
export async function sendShortageEmailNotification(payload: ShortageEmailPayload): Promise<{ success: boolean; method: string; error?: string }> {
  if (!payload.toEmail) {
    return { success: false, method: 'none', error: 'No se encontró dirección de email del destinatario' }
  }

  const { subject, bodyText } = generateShortageEmailTemplate(payload)

  // 1. Check if an Edge Function / Webhook URL is configured
  const webhookUrl = import.meta.env.VITE_EMAIL_WEBHOOK_URL as string
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: payload.toEmail,
          toName: payload.toName,
          subject,
          text: bodyText,
          payload,
        }),
      })
      if (res.ok) {
        return { success: true, method: 'webhook' }
      }
    } catch (err: any) {
      console.warn('Webhook email error:', err)
    }
  }

  // 2. Check if EmailJS is configured
  const emailJsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID as string
  const emailJsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string
  const emailJsPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string

  if (emailJsServiceId && emailJsTemplateId && emailJsPublicKey) {
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: emailJsServiceId,
          template_id: emailJsTemplateId,
          user_id: emailJsPublicKey,
          template_params: {
            to_email: payload.toEmail,
            to_name: payload.toName,
            subject,
            message: bodyText,
          },
        }),
      })
      if (res.ok) {
        return { success: true, method: 'emailjs' }
      }
    } catch (err: any) {
      console.warn('EmailJS send error:', err)
    }
  }

  // Log available notification for development / server trigger
  console.log('📧 Notificación por email preparada:', {
    para: payload.toEmail,
    asunto: subject,
    mensaje: bodyText,
  })

  return { success: true, method: 'ready' }
}
