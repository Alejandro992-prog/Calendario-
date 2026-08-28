import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types'
import type { User } from '@supabase/supabase-js'

interface AuthStore {
  user: User | null
  profile: Profile | null
  loading: boolean
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  hasRole: (roles: UserRole[]) => boolean
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  hasRole: (roles) => {
    const { profile } = get()
    if (!profile) return false
    return roles.includes(profile.rol)
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))
