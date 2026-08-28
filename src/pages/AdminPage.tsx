import { useState, useEffect } from 'react'
import { Plus, Shield, Users, Activity, RefreshCw, Edit2, Trash2, X, Check, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Profile, AuditLog, UserRole } from '@/types'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Tab = 'users' | 'audit'

const ROLES: UserRole[] = ['Administrador', 'Compras', 'Comercial']

const roleColors: Record<UserRole, string> = {
  Administrador: 'badge bg-purple-500/15 text-purple-400 border border-purple-500/20',
  Compras: 'badge bg-blue-500/15 text-blue-400 border border-blue-500/20',
  Comercial: 'badge bg-green-500/15 text-green-400 border border-green-500/20',
}

const auditColors: Record<string, string> = {
  INSERT: 'text-green-400',
  UPDATE: 'text-yellow-400',
  DELETE: 'text-red-400',
}

export default function AdminPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)

  useEffect(() => {
    if (tab === 'users') loadUsers()
    else loadAudit()
  }, [tab])

  const loadUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers((data || []) as Profile[])
    setLoading(false)
  }

  const loadAudit = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setAuditLogs((data || []) as AuditLog[])
    setLoading(false)
  }

  const toggleActive = async (user: Profile) => {
    const { error } = await supabase
      .from('profiles')
      .update({ activo: !user.activo })
      .eq('id', user.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`Usuario ${!user.activo ? 'activado' : 'desactivado'}`)
      loadUsers()
    }
  }

  const updateRole = async (userId: string, rol: UserRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ rol })
      .eq('id', userId)
    if (error) toast.error(error.message)
    else { toast.success('Rol actualizado'); loadUsers() }
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-purple-400" />
            Administración
          </h1>
          <p className="page-subtitle">Gestión de usuarios y auditoría del sistema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-800 rounded-xl border border-surface-700 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'users'
              ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
              : 'text-surface-400 hover:text-surface-200'
          }`}
          id="tab-users"
        >
          <Users size={14} /> Usuarios
          <span className="badge badge-gray text-xs">{users.length}</span>
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'audit'
              ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
              : 'text-surface-400 hover:text-surface-200'
          }`}
          id="tab-audit"
        >
          <Activity size={14} /> Auditoría
        </button>
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-surface-400">{users.length} usuarios registrados</p>
            <div className="flex gap-2">
              <button onClick={loadUsers} className="btn-ghost btn-icon btn-sm">
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => { setEditingUser(null); setShowUserForm(true) }}
                className="btn-primary"
                id="btn-new-user"
              >
                <Plus size={16} /> Nuevo Usuario
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Cargo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Desde</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.id === profile?.id ? 'bg-brand-500/5' : ''}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                            {u.nombre_completo?.[0] || '?'}
                          </div>
                          <span className="font-medium text-surface-100">
                            {u.nombre_completo}
                            {u.id === profile?.id && (
                              <span className="ml-1.5 text-[10px] text-brand-400">(tú)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="text-surface-400 text-xs">{u.email}</td>
                      <td className="text-surface-400">{u.cargo || '—'}</td>
                      <td>
                        <select
                          className="form-select py-0.5 text-xs"
                          value={u.rol}
                          onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                          disabled={u.id === profile?.id}
                          id={`role-select-${u.id}`}
                        >
                          {ROLES.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.activo ? 'badge-green' : 'badge-gray'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="text-xs text-surface-400">
                        {format(new Date(u.created_at), 'dd/MM/yyyy', { locale: es })}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingUser(u); setShowUserForm(true) }}
                            className="p-1.5 text-surface-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                            title="Editar"
                            id={`edit-user-${u.id}`}
                          >
                            <Edit2 size={13} />
                          </button>
                          {u.id !== profile?.id && (
                            <button
                              onClick={() => toggleActive(u)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.activo
                                  ? 'text-surface-500 hover:text-yellow-400 hover:bg-yellow-500/10'
                                  : 'text-surface-500 hover:text-green-400 hover:bg-green-500/10'
                              }`}
                              title={u.activo ? 'Desactivar' : 'Activar'}
                              id={`toggle-user-${u.id}`}
                            >
                              {u.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Audit tab */}
      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-surface-400">Últimos 100 eventos</p>
            <button onClick={loadAudit} className="btn-ghost btn-icon btn-sm">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="table-wrapper">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Tabla</th>
                    <th>Usuario</th>
                    <th>Fecha y hora</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className={`font-mono text-xs font-bold ${auditColors[log.accion] || 'text-surface-400'}`}>
                          {log.accion}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-surface-400 bg-surface-700/50 px-1.5 py-0.5 rounded">
                          {log.tabla}
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="text-sm text-surface-200">{log.user_nombre || log.user_email || '—'}</p>
                          <p className="text-xs text-surface-500">{log.user_email}</p>
                        </div>
                      </td>
                      <td className="text-xs text-surface-400">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                      </td>
                      <td>
                        {log.datos_despues && (
                          <details className="cursor-pointer">
                            <summary className="text-xs text-brand-400 hover:text-brand-300">Ver datos</summary>
                            <pre className="text-[10px] text-surface-400 bg-surface-900 p-2 rounded mt-1 max-w-xs overflow-x-auto">
                              {JSON.stringify(log.datos_despues, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* User form modal */}
      {showUserForm && (
        <UserFormModal
          user={editingUser}
          onClose={() => setShowUserForm(false)}
          onSaved={() => { setShowUserForm(false); loadUsers() }}
        />
      )}
    </div>
  )
}

// ---- User form modal ----
interface UserFormProps {
  user: Profile | null
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ user, onClose, onSaved }: UserFormProps) {
  const [nombre, setNombre] = useState(user?.nombre_completo || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [cargo, setCargo] = useState(user?.cargo || '')
  const [rol, setRol] = useState<UserRole>(user?.rol || 'Comercial')
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const isNew = !user

  const handleSave = async () => {
    if (!nombre || !email) { toast.error('Nombre y email son obligatorios'); return }

    setSaving(true)

    if (isNew) {
      if (!password) { toast.error('La contraseña es obligatoria para nuevos usuarios'); setSaving(false); return }

      // Create user via Supabase Admin (requires service role key for production)
      // In this implementation we use the standard signup
      const { data, error } = await supabase.auth.admin?.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre_completo: nombre, cargo, rol },
      }) || { data: null, error: { message: 'admin.createUser not available — use Supabase Dashboard' } }

      if (error) {
        // Fallback: Try regular sign-up
        toast.error(`Para crear usuarios, usa Supabase Dashboard > Authentication > Users`)
      } else {
        // Update profile
        if (data?.user) {
          await supabase.from('profiles').update({ nombre_completo: nombre, cargo, rol }).eq('id', data.user.id)
        }
        toast.success('Usuario creado')
        onSaved()
      }
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({ nombre_completo: nombre, cargo, rol })
        .eq('id', user.id)
      if (error) toast.error(error.message)
      else { toast.success('Usuario actualizado'); onSaved() }
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel max-w-md w-full">
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Nuevo Usuario' : 'Editar Usuario'}</h2>
          <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="form-group">
            <label className="form-label">Nombre completo *</label>
            <input type="text" className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} id="user-nombre" />
          </div>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew} id="user-email" />
          </div>
          {isNew && (
            <div className="form-group">
              <label className="form-label">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  id="user-password"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Cargo</label>
            <input type="text" className="form-input" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ej: Jefe de Compras" id="user-cargo" />
          </div>
          <div className="form-group">
            <label className="form-label">Rol del sistema</label>
            <select className="form-select" value={rol} onChange={(e) => setRol(e.target.value as UserRole)} id="user-rol">
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>

          {isNew && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-300">
              <strong>Nota:</strong> La creación de usuarios requiere la Service Role Key de Supabase.
              En producción, crea usuarios desde el Dashboard de Supabase y asigna su rol aquí.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" id="user-save">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? 'Guardando...' : isNew ? 'Crear Usuario' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
