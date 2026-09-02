import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://zrbijueeugfaugkfenbo.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyYmlqdWVldWdmYXVna2ZlbmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTc1NjMsImV4cCI6MjEwMzQzMzU2M30.rsQfAFCIl4zuQSEhXNxUv65IYKuHWlGw9nbrlVEmgqI'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)

// Utility: generate a signed URL for a private storage object
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)
  if (error) {
    console.error('Error generating signed URL:', error)
    return null
  }
  return data.signedUrl
}

// Utility: upload file to storage and return the storage path
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
  })
  if (error) {
    console.error('Error uploading file:', error)
    return null
  }
  return data.path
}

// Utility: Create user from admin dashboard without disturbing current session
export async function createUserWithoutSession({
  email,
  password,
  nombreCompleto,
  cargo,
  rol,
}: {
  email: string
  password: string
  nombreCompleto: string
  cargo?: string
  rol: 'Administrador' | 'Compras' | 'Comercial'
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Ephemeral client with no session persistence
    const tempClient = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    const { data, error } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre_completo: nombreCompleto,
          cargo: cargo || '',
          rol,
        },
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data.user) {
      // Ensure profile is updated with the assigned role in case of default trigger fallback
      await supabase
        .from('profiles')
        .update({
          nombre_completo: nombreCompleto,
          cargo: cargo || '',
          rol,
        })
        .eq('id', data.user.id)
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al crear usuario' }
  }
}

// Utility: Change any user password directly as Administrator without requiring old password
export async function adminResetUserPassword(
  targetUserId: string,
  newPassword: string,
  isCurrentUser = false
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'La contraseña debe tener al menos 6 caracteres' }
  }

  // Si es el usuario actual en sesión, Supabase Auth permite actualizar directamente
  if (isCurrentUser) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  // Para otros usuarios, llamar a la función RPC con permisos de Administrador
  try {
    const { data, error } = await supabase.rpc('admin_reset_user_password', {
      target_user_id: targetUserId,
      new_password: newPassword,
    })

    if (error) {
      if (error.message.includes('function') || error.message.includes('not found') || error.code === '42883') {
        return {
          success: false,
          error:
            'Para modificar contraseñas de otros usuarios directamente, ejecuta el script SQL 003_admin_reset_password en Supabase.',
        }
      }
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object' && 'success' in data && !(data as any).success) {
      return { success: false, error: (data as any).error || 'Error al actualizar la contraseña' }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al restablecer la contraseña' }
  }
}

