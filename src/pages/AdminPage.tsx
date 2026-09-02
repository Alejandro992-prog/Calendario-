import { useState, useEffect, useRef } from 'react'
import { Plus, Shield, Users, Activity, RefreshCw, Edit2, X, Eye, EyeOff, HardDrive, Download, Database, CheckCircle2, FileText, Server, Search, Filter, Trash2, ArrowRight, Building2, KeyRound } from 'lucide-react'
import { supabase, createUserWithoutSession, adminResetUserPassword } from '@/lib/supabase'
import ResetPasswordModal from '@/components/admin/ResetPasswordModal'
import { generateFullBackup, downloadBackupFile } from '@/lib/backup'
import { useAuthStore } from '@/store/authStore'
import type { Profile, AuditLog, UserRole, Supplier } from '@/types'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Tab = 'users' | 'suppliers' | 'audit' | 'backup'

const ROLES: UserRole[] = ['Administrador', 'Compras', 'Comercial']

const roleColors: Record<UserRole, string> = {
  Administrador: 'badge bg-purple-500/15 text-purple-400 border border-purple-500/20',
  Compras: 'badge bg-blue-500/15 text-blue-400 border border-blue-500/20',
  Comercial: 'badge bg-green-500/15 text-green-400 border border-green-500/20',
}

const auditColors: Record<string, { badge: string; text: string; label: string }> = {
  INSERT: { badge: 'bg-green-500/15 text-green-400 border-green-500/20', text: 'text-green-400', label: 'Creación' },
  UPDATE: { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20', text: 'text-amber-400', label: 'Modificación' },
  DELETE: { badge: 'bg-red-500/15 text-red-400 border-red-500/20', text: 'text-red-400', label: 'Eliminación' },
}

const tableLabels: Record<string, { label: string; icon: string }> = {
  stock_shortages: { label: 'Faltas de Stock', icon: '⚠️' },
  deliveries: { label: 'Descargas / Camiones', icon: '🚚' },
  delivery_items: { label: 'Artículos en Camión', icon: '📦' },
  price_alerts: { label: 'Alertas de Precios', icon: '📉' },
  shortage_comments: { label: 'Comentarios de Faltas', icon: '💬' },
  profiles: { label: 'Usuarios / Perfiles', icon: '👤' },
  suppliers: { label: 'Proveedores', icon: '🏢' },
}

export default function AdminPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [passwordModalUser, setPasswordModalUser] = useState<Profile | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [backupStats, setBackupStats] = useState<Record<string, number> | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  
  // Audit filters
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditTableFilter, setAuditTableFilter] = useState('')

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)

  useEffect(() => {
    if (tab === 'users') loadUsers()
    else if (tab === 'suppliers') loadSuppliers()
    else if (tab === 'audit') loadAudit()
    else if (tab === 'backup') loadBackupStats()
  }, [tab])

  const loadSuppliers = async () => {
    setLoadingSuppliers(true)
    const { data, error } = await supabase.from('suppliers').select('*').order('nombre', { ascending: true })
    if (error) {
      toast.error('Error al cargar proveedores: ' + error.message)
    } else {
      setSuppliers((data || []) as Supplier[])
    }
    setLoadingSuppliers(false)
  }

  const toggleSupplierActive = async (s: Supplier) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ activo: !s.activo })
      .eq('id', s.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`Marca/Proveedor ${!s.activo ? 'activado' : 'desactivado'}`)
      loadSuppliers()
    }
  }

  const deleteSupplier = async (s: Supplier) => {
    if (!window.confirm(`¿Estás seguro de eliminar la marca/proveedor "${s.nombre}"?`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) {
      toast.error('No se pudo eliminar: ' + error.message)
    } else {
      toast.success('Proveedor eliminado')
      loadSuppliers()
    }
  }

  const loadBackupStats = async () => {
    setLoadingStats(true)
    try {
      const res = await generateFullBackup(profile?.email)
      if (res.success && res.data) {
        setBackupStats(res.data.metadata.counts)
      }
    } catch {
      // ignore
    } finally {
      setLoadingStats(false)
    }
  }

  const handleDownloadBackup = async () => {
    setIsExporting(true)
    const toastId = toast.loading('Generando copia de seguridad...')
    try {
      const res = await generateFullBackup(profile?.email)
      if (res.success && res.data) {
        downloadBackupFile(res.data)
        setBackupStats(res.data.metadata.counts)
        toast.success('¡Copia de seguridad descargada correctamente!', { id: toastId })
      } else {
        toast.error(res.error || 'Error al generar la copia de seguridad', { id: toastId })
      }
    } catch (err: any) {
      toast.error('Error inesperado al exportar los datos', { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

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
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-purple-400" />
            Administración
          </h1>
          <p className="page-subtitle">Gestión de usuarios, proveedores, auditoría y copias de seguridad</p>
        </div>

        <button
          onClick={handleDownloadBackup}
          disabled={isExporting}
          className="btn-secondary flex items-center gap-2 self-start sm:self-auto border-surface-600 hover:border-brand-500/50 hover:bg-brand-500/10 text-surface-200"
          id="btn-quick-backup"
          title="Descargar copia de seguridad completa en JSON"
        >
          {isExporting ? (
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          ) : (
            <Download size={16} className="text-brand-400" />
          )}
          <span>{isExporting ? 'Exportando datos...' : 'Copia de Seguridad'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-800 rounded-xl border border-surface-700 w-fit flex-wrap">
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
          onClick={() => setTab('suppliers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'suppliers'
              ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
              : 'text-surface-400 hover:text-surface-200'
          }`}
          id="tab-suppliers"
        >
          <Building2 size={14} /> Proveedores / Marcas
          <span className="badge badge-gray text-xs">{suppliers.length}</span>
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
        <button
          onClick={() => setTab('backup')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'backup'
              ? 'bg-brand-600/20 text-brand-400 border border-brand-500/20'
              : 'text-surface-400 hover:text-surface-200'
          }`}
          id="tab-backup"
        >
          <HardDrive size={14} /> Copia de Seguridad
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
                            title="Editar usuario"
                            id={`edit-user-${u.id}`}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => setPasswordModalUser(u)}
                            className="p-1.5 text-surface-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Cambiar contraseña (sin pedir la actual)"
                            id={`reset-pwd-${u.id}`}
                          >
                            <KeyRound size={13} />
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

      {/* Suppliers / Brands tab */}
      {tab === 'suppliers' && (() => {
        const filteredSuppliers = suppliers.filter((s) => {
          if (!supplierSearch.trim()) return true
          return s.nombre.toLowerCase().includes(supplierSearch.toLowerCase().trim())
        })

        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  placeholder="Buscar marca o proveedor..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="form-input pl-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-400">
                  {suppliers.filter((s) => s.activo).length} activas / {suppliers.length} total
                </span>
                <button onClick={loadSuppliers} className="btn-ghost btn-icon btn-sm" title="Refrescar">
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => { setEditingSupplier(null); setShowSupplierModal(true) }}
                  className="btn-primary"
                  id="btn-new-supplier"
                >
                  <Plus size={16} /> Nueva Marca / Proveedor
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              {loadingSuppliers ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="text-center py-12 text-surface-400 space-y-2">
                  <p className="text-sm font-medium">No se encontraron marcas o proveedores</p>
                  <p className="text-xs text-surface-500">
                    {supplierSearch ? 'Prueba con otro término de búsqueda.' : 'Crea tu primera marca con el botón superior.'}
                  </p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Marca / Proveedor</th>
                      <th>Estado</th>
                      <th>Fecha de Alta</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-surface-700/60 border border-surface-600/50 flex items-center justify-center text-sm font-bold text-surface-200 uppercase">
                              {s.nombre.slice(0, 2)}
                            </div>
                            <span className="font-semibold text-surface-100 text-sm">{s.nombre}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${s.activo ? 'badge-green' : 'badge-gray'}`}>
                            {s.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="text-xs text-surface-400">
                          {s.created_at ? format(new Date(s.created_at), 'dd/MM/yyyy', { locale: es }) : '—'}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingSupplier(s); setShowSupplierModal(true) }}
                              className="p-1.5 text-surface-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
                              title="Editar marca"
                              id={`edit-supplier-${s.id}`}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => toggleSupplierActive(s)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                s.activo
                                  ? 'text-surface-400 hover:text-yellow-400 hover:bg-yellow-500/10'
                                  : 'text-surface-400 hover:text-green-400 hover:bg-green-500/10'
                              }`}
                              title={s.activo ? 'Desactivar' : 'Activar'}
                              id={`toggle-supplier-${s.id}`}
                            >
                              {s.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              onClick={() => deleteSupplier(s)}
                              className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Eliminar marca"
                              id={`delete-supplier-${s.id}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {/* Audit tab */}
      {tab === 'audit' && (() => {
        const filteredAudit = auditLogs.filter((log) => {
          if (auditActionFilter && log.accion !== auditActionFilter) return false
          if (auditTableFilter && log.tabla !== auditTableFilter) return false
          if (auditSearch.trim()) {
            const q = auditSearch.toLowerCase()
            const userStr = `${log.user_nombre || ''} ${log.user_email || ''}`.toLowerCase()
            const tableStr = (tableLabels[log.tabla]?.label || log.tabla).toLowerCase()
            const dataStr = JSON.stringify(log.datos_despues || log.datos_antes || {}).toLowerCase()
            return userStr.includes(q) || tableStr.includes(q) || dataStr.includes(q)
          }
          return true
        })

        const getSummary = (log: AuditLog) => {
          const data: any = log.datos_despues || log.datos_antes || {}
          const prev: any = log.datos_antes || {}

          switch (log.tabla) {
            case 'stock_shortages': {
              const cat = data.categoria || prev.categoria || 'Falta'
              const mod = data.modelo || data.especificacion || prev.modelo || prev.especificacion || ''
              const est = data.estado || prev.estado
              if (log.accion === 'UPDATE' && prev.estado && data.estado && prev.estado !== data.estado) {
                return `${cat} ${mod ? `(${mod})` : ''} ➔ Cambio de estado a "${data.estado}"`
              }
              return `${cat} ${mod ? `· ${mod}` : ''} ${est ? `(${est})` : ''}`
            }
            case 'deliveries': {
              const ref = data.referencia || prev.referencia || 'Sin referencia'
              const fecha = data.fecha_prevista || prev.fecha_prevista || ''
              const est = data.estado || prev.estado || ''
              if (log.accion === 'UPDATE' && prev.estado && data.estado && prev.estado !== data.estado) {
                return `Descarga Ref: ${ref} ➔ Estado "${data.estado}"`
              }
              return `Descarga Ref: ${ref} · Fecha: ${fecha} (${est})`
            }
            case 'price_alerts': {
              const mod = data.modelo || prev.modelo || 'Producto'
              const comp = data.competidor || prev.competidor || ''
              const prec = data.precio_detectado || prev.precio_detectado
              return `Alerta: ${mod} · Competidor: ${comp} ${prec ? `(${prec} €)` : ''}`
            }
            case 'profiles': {
              const nom = data.nombre_completo || prev.nombre_completo || 'Usuario'
              const rol = data.rol || prev.rol || ''
              if (log.accion === 'UPDATE' && prev.rol && data.rol && prev.rol !== data.rol) {
                return `Usuario ${nom} ➔ Rol cambiado a "${data.rol}"`
              }
              return `Usuario: ${nom} (${rol})`
            }
            case 'shortage_comments': {
              const cont = (data.contenido || prev.contenido || '').substring(0, 45)
              return `Comentario: "${cont}${cont.length >= 45 ? '...' : ''}"`
            }
            case 'suppliers': {
              const nom = data.nombre || prev.nombre || 'Proveedor'
              return `Proveedor: ${nom}`
            }
            case 'delivery_items': {
              const mod = data.modelo || prev.modelo || 'Artículo'
              const cant = data.cantidad || prev.cantidad || 1
              return `Línea: ${mod} (${cant} uds)`
            }
            default:
              return `Registro ID #${log.registro_id || log.id}`
          }
        }

        return (
          <div className="space-y-4">
            {/* Header info & filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-surface-100 flex items-center gap-2">
                  <Activity size={18} className="text-brand-400" />
                  Historial Completo de Operaciones
                </h3>
                <p className="text-xs text-surface-400">
                  Mostrando {filteredAudit.length} de {auditLogs.length} eventos registrados (Solo visible para Administrador)
                </p>
              </div>
              <button onClick={loadAudit} className="btn-ghost btn-sm self-start sm:self-auto flex items-center gap-1.5 text-surface-300 hover:text-white">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Actualizar</span>
              </button>
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2.5 items-center bg-surface-800/40 p-3 rounded-xl border border-surface-700/60">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input
                  type="text"
                  placeholder="Buscar por usuario, email o contenido..."
                  className="form-input pl-8 py-1.5 text-xs w-full"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  id="audit-search"
                />
              </div>
              <select
                className="form-select py-1.5 text-xs"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                id="audit-filter-action"
              >
                <option value="">Todas las acciones</option>
                <option value="INSERT">🟢 Creaciones (INSERT)</option>
                <option value="UPDATE">🟡 Modificaciones (UPDATE)</option>
                <option value="DELETE">🔴 Eliminaciones (DELETE)</option>
              </select>
              <select
                className="form-select py-1.5 text-xs"
                value={auditTableFilter}
                onChange={(e) => setAuditTableFilter(e.target.value)}
                id="audit-filter-table"
              >
                <option value="">Todos los módulos</option>
                <option value="stock_shortages">⚠️ Faltas de Stock</option>
                <option value="deliveries">🚚 Descargas / Camiones</option>
                <option value="price_alerts">📉 Alertas de Precios</option>
                <option value="shortage_comments">💬 Comentarios</option>
                <option value="delivery_items">📦 Artículos</option>
                <option value="profiles">👤 Usuarios</option>
                <option value="suppliers">🏢 Proveedores</option>
              </select>
              {(auditSearch || auditActionFilter || auditTableFilter) && (
                <button
                  onClick={() => { setAuditSearch(''); setAuditActionFilter(''); setAuditTableFilter('') }}
                  className="text-xs text-brand-400 hover:text-brand-300 underline px-1"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Table */}
            <div className="table-wrapper">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : filteredAudit.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-surface-500">
                  <Activity size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No se encontraron eventos con los filtros seleccionados</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Acción</th>
                      <th>Módulo</th>
                      <th>Descripción de la Operación</th>
                      <th>Realizado por</th>
                      <th>Fecha y Hora</th>
                      <th>Datos (JSON)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map((log) => {
                      const actionMeta = auditColors[log.accion] || { badge: 'bg-surface-700 text-surface-300', text: 'text-surface-400', label: log.accion }
                      const tableMeta = tableLabels[log.tabla] || { label: log.tabla, icon: '📋' }
                      const summary = getSummary(log)

                      return (
                        <tr key={log.id} className="hover:bg-surface-800/80">
                          <td>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${actionMeta.badge}`}>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5 text-xs text-surface-300 font-medium bg-surface-700/50 px-2 py-0.5 rounded-md border border-surface-600/40">
                              <span>{tableMeta.icon}</span>
                              <span>{tableMeta.label}</span>
                            </span>
                          </td>
                          <td>
                            <p className="text-xs font-medium text-surface-100">{summary}</p>
                          </td>
                          <td>
                            <div>
                              <p className="text-xs font-medium text-surface-200">{log.user_nombre || log.user_email || 'Sistema'}</p>
                              {log.user_email && (
                                <p className="text-[11px] text-surface-500">{log.user_email}</p>
                              )}
                            </div>
                          </td>
                          <td className="text-xs text-surface-400 whitespace-nowrap">
                            {format(new Date(log.created_at), "dd/MM/yyyy · HH:mm:ss", { locale: es })}
                          </td>
                          <td>
                            <details className="cursor-pointer">
                              <summary className="text-xs text-brand-400 hover:text-brand-300">
                                {log.accion === 'UPDATE' ? 'Ver cambios' : 'Ver detalle'}
                              </summary>
                              <div className="bg-surface-950/90 border border-surface-800 p-2.5 rounded-lg mt-1.5 max-w-xs space-y-2">
                                {log.datos_antes && (
                                  <div>
                                    <span className="text-[10px] text-amber-400 font-semibold block mb-0.5">Antes:</span>
                                    <pre className="text-[10px] text-surface-400 overflow-x-auto">
                                      {JSON.stringify(log.datos_antes, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.datos_despues && (
                                  <div>
                                    <span className="text-[10px] text-green-400 font-semibold block mb-0.5">Después:</span>
                                    <pre className="text-[10px] text-surface-300 overflow-x-auto">
                                      {JSON.stringify(log.datos_despues, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </details>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}

      {/* Backup tab */}
      {tab === 'backup' && (
        <div className="space-y-6">
          {/* Main Action Banner */}
          <div className="card p-6 bg-gradient-to-br from-surface-800/90 via-surface-850 to-brand-950/20 border border-surface-700/80 shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-sm">
                    <Database size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-surface-50">Copia de Seguridad de la Base de Datos</h2>
                    <p className="text-xs text-brand-400 font-medium">Exportación estructurada en formato JSON</p>
                  </div>
                </div>
                <p className="text-sm text-surface-300 leading-relaxed pt-1">
                  Genera y descarga un archivo seguro con todos los registros actuales del sistema: descargas de camiones, artículos, proveedores, faltas de stock, comentarios de seguimiento, alertas de precios de competidores, usuarios y registros de auditoría.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <button
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="btn-primary py-3 px-6 text-base font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30 flex items-center justify-center gap-3 w-full sm:w-auto"
                  id="btn-download-full-backup"
                >
                  {isExporting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generando copia...</span>
                    </>
                  ) : (
                    <>
                      <Download size={20} />
                      <span>Descargar Copia Completa (.json)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Database Content Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
                <Server size={16} className="text-surface-400" />
                Resumen de Datos a Exportar
              </h3>
              <button
                onClick={loadBackupStats}
                disabled={loadingStats}
                className="btn-ghost btn-sm text-xs flex items-center gap-1.5 text-surface-400 hover:text-surface-200"
              >
                <RefreshCw size={12} className={loadingStats ? 'animate-spin' : ''} />
                Actualizar recuento
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Entregas / Descargas', key: 'deliveries', icon: '🚚', color: 'from-blue-500/10 to-transparent text-blue-400' },
                { label: 'Artículos / Modelos', key: 'delivery_items', icon: '📦', color: 'from-cyan-500/10 to-transparent text-cyan-400' },
                { label: 'Proveedores', key: 'suppliers', icon: '🏢', color: 'from-purple-500/10 to-transparent text-purple-400' },
                { label: 'Faltas de Stock', key: 'stock_shortages', icon: '⚠️', color: 'from-amber-500/10 to-transparent text-amber-400' },
                { label: 'Comentarios de Faltas', key: 'shortage_comments', icon: '💬', color: 'from-emerald-500/10 to-transparent text-emerald-400' },
                { label: 'Alertas de Precio', key: 'price_alerts', icon: '📉', color: 'from-rose-500/10 to-transparent text-rose-400' },
                { label: 'Usuarios Registrados', key: 'profiles', icon: '👥', color: 'from-indigo-500/10 to-transparent text-indigo-400' },
                { label: 'Logs de Auditoría', key: 'audit_log', icon: '📜', color: 'from-teal-500/10 to-transparent text-teal-400' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="card p-4 bg-surface-800/60 border border-surface-700/60 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs text-surface-400 mb-1">{item.label}</p>
                    <p className="text-xl font-bold text-surface-100">
                      {loadingStats ? (
                        <span className="inline-block w-8 h-5 bg-surface-700 animate-pulse rounded" />
                      ) : (
                        backupStats?.[item.key] ?? '—'
                      )}
                    </p>
                  </div>
                  <span className="text-2xl">{item.icon}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Backup recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4 bg-surface-800/40 border border-surface-700/60 flex gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 h-fit">
                <CheckCircle2 size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-200">Recomendaciones de guardado</h4>
                <p className="text-xs text-surface-400 leading-relaxed">
                  Guarda tus copias de seguridad descargadas en una unidad segura, como OneDrive corporativo, Google Drive o un disco externo periódicamente para tener un historial histórico.
                </p>
              </div>
            </div>

            <div className="card p-4 bg-surface-800/40 border border-surface-700/60 flex gap-3.5">
              <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 h-fit">
                <FileText size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-200">Formato estándar y compatible</h4>
                <p className="text-xs text-surface-400 leading-relaxed">
                  El archivo generado es JSON universal con marcas de tiempo y metadatos, legible por cualquier software de análisis de datos o scripts de restauración.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User form modal */}
      {showUserForm && (
        <UserFormModal
          user={editingUser}
          isCurrentUser={editingUser?.id === profile?.id}
          onClose={() => setShowUserForm(false)}
          onSaved={() => { setShowUserForm(false); loadUsers() }}
        />
      )}

      {/* Password reset modal */}
      {passwordModalUser && (
        <ResetPasswordModal
          targetUser={passwordModalUser}
          isCurrentUser={passwordModalUser.id === profile?.id}
          onClose={() => setPasswordModalUser(null)}
          onSuccess={loadUsers}
        />
      )}

      {/* Supplier form modal */}
      {showSupplierModal && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => setShowSupplierModal(false)}
          onSaved={() => { setShowSupplierModal(false); loadSuppliers() }}
        />
      )}
    </div>
  )
}

// ---- Supplier form modal ----
interface SupplierFormProps {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}

function SupplierFormModal({ supplier, onClose, onSaved }: SupplierFormProps) {
  const [nombre, setNombre] = useState(supplier?.nombre || '')
  const [activo, setActivo] = useState(supplier?.activo ?? true)
  const [saving, setSaving] = useState(false)
  const isBackdropClick = useRef(false)
  const isNew = !supplier

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre de la marca o proveedor es obligatorio')
      return
    }

    setSaving(true)

    if (isNew) {
      const { error } = await supabase.from('suppliers').insert({
        nombre: nombre.trim(),
        activo,
      })

      if (error) {
        toast.error('Error al crear: ' + error.message)
      } else {
        toast.success(`Marca "${nombre.trim()}" creada con éxito`)
        onSaved()
      }
    } else {
      const { error } = await supabase
        .from('suppliers')
        .update({
          nombre: nombre.trim(),
          activo,
        })
        .eq('id', supplier.id)

      if (error) {
        toast.error('Error al actualizar: ' + error.message)
      } else {
        toast.success('Marca actualizada con éxito')
        onSaved()
      }
    }
    setSaving(false)
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        isBackdropClick.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropClick.current) {
          onClose()
        }
        isBackdropClick.current = false
      }}
    >
      <div className="modal-panel max-w-md w-full">
        <div className="modal-header">
          <h2 className="modal-title flex items-center gap-2">
            <Building2 size={18} className="text-brand-400" />
            {isNew ? 'Nueva Marca / Proveedor' : 'Editar Marca / Proveedor'}
          </h2>
          <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSave() }}>
          <div className="modal-body space-y-4">
            <div className="form-group">
              <label className="form-label">Nombre de la Marca o Proveedor *</label>
              <input
                type="text"
                autoFocus
                className="form-input text-base"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Balay, Bosch, LG, Teka..."
                id="supplier-nombre"
              />
              <p className="text-[11px] text-surface-400 mt-1">
                Aparecerá disponible en el calendario de descargas y camiones.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="supplier-activo"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500 h-4 w-4"
              />
              <label htmlFor="supplier-activo" className="text-xs text-surface-300 select-none cursor-pointer">
                Marca activa y disponible para programar descargas
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary" id="supplier-save">
              {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Guardando...' : isNew ? 'Crear Marca' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- User form modal ----
interface UserFormProps {
  user: Profile | null
  isCurrentUser?: boolean
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ user, isCurrentUser = false, onClose, onSaved }: UserFormProps) {
  const [nombre, setNombre] = useState(user?.nombre_completo || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [cargo, setCargo] = useState(user?.cargo || '')
  const [rol, setRol] = useState<UserRole>(user?.rol || 'Comercial')
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const isBackdropClick = useRef(false)
  const isNew = !user

  const handleSave = async () => {
    if (!nombre.trim() || !email.trim()) {
      toast.error('Nombre y email son obligatorios')
      return
    }

    setSaving(true)

    if (isNew) {
      if (!password || password.length < 6) {
        toast.error('La contraseña debe tener al menos 6 caracteres')
        setSaving(false)
        return
      }

      const res = await createUserWithoutSession({
        email: email.trim(),
        password,
        nombreCompleto: nombre.trim(),
        cargo: cargo.trim(),
        rol,
      })

      if (!res.success) {
        toast.error(res.error || 'Error al crear el usuario')
      } else {
        toast.success('¡Usuario creado correctamente y listo para iniciar sesión!')
        onSaved()
      }
    } else {
      // Si el administrador introdujo una nueva contraseña al editar
      if (password.trim()) {
        if (password.trim().length < 6) {
          toast.error('La contraseña debe tener al menos 6 caracteres')
          setSaving(false)
          return
        }
        const pwdRes = await adminResetUserPassword(user.id, password.trim(), isCurrentUser)
        if (!pwdRes.success) {
          toast.error(pwdRes.error || 'Error al actualizar la contraseña')
          setSaving(false)
          return
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          nombre_completo: nombre.trim(),
          cargo: cargo.trim(),
          rol,
        })
        .eq('id', user.id)

      if (error) {
        toast.error(error.message)
      } else {
        toast.success(
          password.trim()
            ? 'Usuario y contraseña actualizados correctamente'
            : 'Usuario actualizado correctamente'
        )
        onSaved()
      }
    }
    setSaving(false)
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        isBackdropClick.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isBackdropClick.current) {
          onClose()
        }
        isBackdropClick.current = false
      }}
    >
      <div className="modal-panel max-w-md w-full">
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Nuevo Usuario' : 'Editar Usuario'}</h2>
          <button onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="form-group">
            <label className="form-label">Nombre completo *</label>
            <input
              type="text"
              className="form-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Carlos Gómez"
              id="user-nombre"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email corporativo *</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isNew}
              placeholder="carlos@garde.es"
              id="user-email"
            />
          </div>
          <div className="form-group">
            <div className="flex items-center justify-between">
              <label className="form-label">
                {isNew ? 'Contraseña de acceso *' : 'Nueva Contraseña (opcional)'}
              </label>
              {!isNew && (
                <span className="text-[10px] text-brand-400 font-medium">
                  Sin pedir la clave antigua
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="form-input pr-10 font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isNew ? 'Mínimo 6 caracteres' : 'Dejar en blanco para mantener la actual'}
                id="user-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {!isNew && (
              <p className="text-[11px] text-surface-500 mt-1">
                Puedes escribir directamente una nueva contraseña si el usuario la ha olvidado o necesita cambiarla.
              </p>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Cargo / Puesto</label>
            <input
              type="text"
              className="form-input"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Ej: Responsable de Compras / Comercial Norte"
              id="user-cargo"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Rol del sistema *</label>
            <select
              className="form-select"
              value={rol}
              onChange={(e) => setRol(e.target.value as UserRole)}
              id="user-rol"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {isNew && (
            <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg text-xs text-brand-300">
              💡 <strong>Creación instantánea:</strong> El usuario quedará habilitado de inmediato y podrá acceder con su email y contraseña sin pasos adicionales.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" id="user-save">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? 'Guardando...' : isNew ? 'Crear Usuario' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
