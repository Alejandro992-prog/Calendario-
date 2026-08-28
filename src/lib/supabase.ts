import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️  Variables de entorno de Supabase no configuradas.\n' +
    'Copia .env.example a .env y rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
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
