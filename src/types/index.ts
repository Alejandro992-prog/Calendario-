// ============================================================
// TypeScript types matching the Supabase schema
// ============================================================

export type UserRole = 'Administrador' | 'Compras' | 'Comercial';
export type DeliveryStatus = 'Programada' | 'En muelle' | 'Descargada' | 'Cancelada';
export type ItemSource = 'excel' | 'pdf' | 'ocr' | 'manual';
export type ShortageUrgency = 'Baja' | 'Media' | 'Alta' | 'Crítica';
export type ShortageStatus = 'Pendiente' | 'Visto' | 'En Revisión' | 'Pedido' | 'En Tránsito' | 'Descartado';
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface Profile {
  id: string;
  email: string;
  nombre_completo: string;
  cargo: string | null;
  rol: UserRole;
  avatar_url: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  nombre: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  supplier_id: string | null;
  referencia: string | null;
  fecha_prevista: string;
  franja_horaria: string | null;
  estado: DeliveryStatus;
  matricula: string | null;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  supplier?: Supplier;
  creator?: Profile;
  items?: DeliveryItem[];
}

export interface DeliveryItem {
  id: string;
  delivery_id: string;
  modelo: string;
  descripcion: string | null;
  ean: string | null;
  cantidad: number;
  fuente: ItemSource;
  raw_data: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  // Joined
  delivery?: Delivery;
  creator?: Profile;
}

export interface StockShortage {
  id: string;
  categoria: string;
  especificacion: string | null;
  modelo: string | null;
  urgencia: ShortageUrgency;
  estado: ShortageStatus;
  notas: string | null;
  reportado_por: string | null;
  gestionado_por: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  reporter?: Profile;
  manager?: Profile;
  comments?: ShortageComment[];
}

export interface ShortageComment {
  id: string;
  shortage_id: string;
  autor_id: string | null;
  contenido: string;
  created_at: string;
  // Joined
  autor?: Profile;
}

export interface PriceAlert {
  id: string;
  modelo: string;
  marca: string | null;
  competidor: string;
  precio_detectado: number | null;
  precio_nuestro: number | null;
  canal_tienda: string | null;
  captura_url: string | null;
  notas: string | null;
  reportado_por: string | null;
  created_at: string;
  // Joined
  reporter?: Profile;
}

export interface AuditLog {
  id: number;
  tabla: string;
  registro_id: string | null;
  accion: AuditAction;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  user_nombre: string | null;
  created_at: string;
}

// Parsed item from Excel/PDF/OCR before confirmation
export interface ParsedItem {
  modelo: string;
  descripcion?: string;
  ean?: string;
  cantidad: number;
  fuente: ItemSource;
  raw_data?: Record<string, unknown>;
}

// ============================================================
// Objetivos y Rappels Anuales (Exclusivo Administrador)
// ============================================================
export interface RappelTier {
  desde_euros: number;
  porcentaje_rapel: number;
}

export interface SupplierTarget {
  id: string;
  proveedor_id?: string | null;
  proveedor_nombre: string;
  ejercicio: number; // Ej: 2026
  consumo_actual: number; // Euros consumidos hasta la fecha
  tramos: RappelTier[]; // Tramos ordenados ascendente
  notas?: string | null;
  fecha_actualizacion?: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

