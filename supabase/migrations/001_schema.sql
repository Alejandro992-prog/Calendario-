-- ============================================================
-- GARDE ELECTRODOMÉSTICOS — Esquema Supabase / PostgreSQL
-- Ejecutar en Supabase Studio > SQL Editor
-- ============================================================

-- ----------------------------------------------------------------
-- EXTENSIONES
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda full-text
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- Para contraseñas y cifrado

-- ----------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('Administrador', 'Compras', 'Comercial');
CREATE TYPE delivery_status AS ENUM ('Programada', 'En muelle', 'Descargada', 'Cancelada');
CREATE TYPE item_source AS ENUM ('excel', 'pdf', 'ocr', 'manual');
CREATE TYPE shortage_urgency AS ENUM ('Baja', 'Media', 'Alta', 'Crítica');
CREATE TYPE shortage_status AS ENUM ('Pendiente', 'Visto', 'En Revisión', 'Pedido', 'En Tránsito', 'Descartado');
CREATE TYPE audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- ----------------------------------------------------------------
-- TABLA: profiles
-- Extiende auth.users con metadata de negocio
-- ----------------------------------------------------------------
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  cargo       TEXT,
  rol         user_role NOT NULL DEFAULT 'Comercial',
  avatar_url  TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfil de usuario con datos de negocio. Creado automáticamente al registrarse.';

-- ----------------------------------------------------------------
-- TABLA: suppliers (Proveedores)
-- ----------------------------------------------------------------
CREATE TABLE public.suppliers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  contacto    TEXT,
  email       TEXT,
  telefono    TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.suppliers IS 'Catálogo de proveedores/fabricantes.';

-- ----------------------------------------------------------------
-- TABLA: deliveries (Camiones / Entregas programadas)
-- ----------------------------------------------------------------
CREATE TABLE public.deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  referencia      TEXT,                -- Número de albarán o referencia interna
  fecha_prevista  DATE NOT NULL,
  franja_horaria  TEXT,                -- Ej: "08:00-10:00", "Tarde"
  estado          delivery_status NOT NULL DEFAULT 'Programada',
  matricula       TEXT,
  notas           TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_fecha ON public.deliveries(fecha_prevista);
CREATE INDEX idx_deliveries_estado ON public.deliveries(estado);

-- ----------------------------------------------------------------
-- TABLA: delivery_items (Líneas de albarán / Productos en camión)
-- ----------------------------------------------------------------
CREATE TABLE public.delivery_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id     UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  modelo          TEXT NOT NULL,
  descripcion     TEXT,
  ean             TEXT,
  cantidad        INTEGER NOT NULL DEFAULT 1,
  fuente          item_source NOT NULL DEFAULT 'manual',
  raw_data        JSONB,              -- Datos crudos del parser original
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_items_delivery ON public.delivery_items(delivery_id);
CREATE INDEX idx_delivery_items_modelo ON public.delivery_items USING GIN (modelo gin_trgm_ops);
CREATE INDEX idx_delivery_items_ean ON public.delivery_items(ean);

-- ----------------------------------------------------------------
-- TABLA: stock_shortages (Faltas reportadas por Comercial)
-- ----------------------------------------------------------------
CREATE TABLE public.stock_shortages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria     TEXT NOT NULL,        -- Frío, Lavado, Cocción, Imagen, etc.
  especificacion TEXT,               -- Combi 2m, Integrable 60cm, etc.
  modelo        TEXT,                 -- Modelo concreto si se conoce
  urgencia      shortage_urgency NOT NULL DEFAULT 'Media',
  estado        shortage_status NOT NULL DEFAULT 'Pendiente',
  notas         TEXT,
  reportado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  gestionado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shortages_estado ON public.stock_shortages(estado);
CREATE INDEX idx_shortages_urgencia ON public.stock_shortages(urgencia);

-- ----------------------------------------------------------------
-- TABLA: shortage_comments (Hilo de comentarios por falta)
-- ----------------------------------------------------------------
CREATE TABLE public.shortage_comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shortage_id   UUID NOT NULL REFERENCES public.stock_shortages(id) ON DELETE CASCADE,
  autor_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contenido     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shortage_comments_shortage ON public.shortage_comments(shortage_id);

-- ----------------------------------------------------------------
-- TABLA: price_alerts (Alertas de agresiones de precio)
-- ----------------------------------------------------------------
CREATE TABLE public.price_alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  modelo            TEXT NOT NULL,
  marca             TEXT,
  competidor        TEXT NOT NULL,
  precio_detectado  NUMERIC(10,2),
  precio_nuestro    NUMERIC(10,2),
  canal_tienda      TEXT,
  captura_url       TEXT,             -- URL privada de Supabase Storage
  notas             TEXT,
  reportado_por     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_alerts_modelo ON public.price_alerts USING GIN (modelo gin_trgm_ops);
CREATE INDEX idx_price_alerts_competidor ON public.price_alerts(competidor);
CREATE INDEX idx_price_alerts_fecha ON public.price_alerts(created_at);

-- ----------------------------------------------------------------
-- TABLA: audit_log (Trazabilidad inmutable)
-- ----------------------------------------------------------------
CREATE TABLE public.audit_log (
  id            BIGSERIAL PRIMARY KEY,
  tabla         TEXT NOT NULL,
  registro_id   TEXT,
  accion        audit_action NOT NULL,
  datos_antes   JSONB,
  datos_despues JSONB,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email    TEXT,
  user_nombre   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tabla ON public.audit_log(tabla);
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX idx_audit_log_fecha ON public.audit_log(created_at);

-- ----------------------------------------------------------------
-- TRIGGERS: updated_at automático
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_shortages_updated_at BEFORE UPDATE ON public.stock_shortages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------
-- TRIGGER: Crear profile automáticamente al registrar usuario
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo, cargo, rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'cargo',
    COALESCE((NEW.raw_user_meta_data->>'rol')::public.user_role, 'Comercial'::public.user_role)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------
-- AUDIT LOG TRIGGER FUNCTION
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_nombre TEXT;
BEGIN
  v_user_id := auth.uid();
  SELECT email, nombre_completo INTO v_user_email, v_user_nombre
    FROM public.profiles WHERE id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(tabla, registro_id, accion, datos_despues, user_id, user_email, user_nombre)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', to_jsonb(NEW), v_user_id, v_user_email, v_user_nombre);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(tabla, registro_id, accion, datos_antes, datos_despues, user_id, user_email, user_nombre)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_user_id, v_user_email, v_user_nombre);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(tabla, registro_id, accion, datos_antes, user_id, user_email, user_nombre)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', to_jsonb(OLD), v_user_id, v_user_email, v_user_nombre);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar audit log a tablas principales
CREATE TRIGGER trg_deliveries_audit AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();
CREATE TRIGGER trg_shortages_audit AFTER INSERT OR UPDATE OR DELETE ON public.stock_shortages
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();
CREATE TRIGGER trg_price_alerts_audit AFTER INSERT OR UPDATE OR DELETE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();
CREATE TRIGGER trg_profiles_audit AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

-- ================================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_shortages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortage_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------
-- POLICIES: profiles
-- ---------------------------------------------------------------
CREATE POLICY "profiles: lectura por usuarios autenticados"
  ON public.profiles FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "profiles: actualizar propio perfil"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles: admin gestiona todos"
  ON public.profiles FOR ALL TO authenticated
  USING (public.get_user_role() = 'Administrador');

-- ---------------------------------------------------------------
-- POLICIES: suppliers
-- ---------------------------------------------------------------
CREATE POLICY "suppliers: todos pueden leer"
  ON public.suppliers FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "suppliers: admin y compras gestionan"
  ON public.suppliers FOR ALL TO authenticated
  USING (public.get_user_role() IN ('Administrador', 'Compras'));

-- ---------------------------------------------------------------
-- POLICIES: deliveries
-- ---------------------------------------------------------------
CREATE POLICY "deliveries: todos leen"
  ON public.deliveries FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "deliveries: admin y compras crean/editan"
  ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('Administrador', 'Compras'));

CREATE POLICY "deliveries: admin y compras actualizan"
  ON public.deliveries FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('Administrador', 'Compras'));

CREATE POLICY "deliveries: solo admin elimina"
  ON public.deliveries FOR DELETE TO authenticated
  USING (public.get_user_role() = 'Administrador');

-- ---------------------------------------------------------------
-- POLICIES: delivery_items
-- ---------------------------------------------------------------
CREATE POLICY "delivery_items: todos leen"
  ON public.delivery_items FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "delivery_items: admin y compras gestionan"
  ON public.delivery_items FOR ALL TO authenticated
  USING (public.get_user_role() IN ('Administrador', 'Compras'));

-- ---------------------------------------------------------------
-- POLICIES: stock_shortages
-- ---------------------------------------------------------------
CREATE POLICY "shortages: todos leen"
  ON public.stock_shortages FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "shortages: comercial inserta propias"
  ON public.stock_shortages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reportado_por OR public.get_user_role() IN ('Administrador', 'Compras'));

CREATE POLICY "shortages: compras y admin actualizan"
  ON public.stock_shortages FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('Administrador', 'Compras')
    OR (public.get_user_role() = 'Comercial' AND reportado_por = auth.uid()));

CREATE POLICY "shortages: solo admin elimina"
  ON public.stock_shortages FOR DELETE TO authenticated
  USING (public.get_user_role() = 'Administrador');

-- ---------------------------------------------------------------
-- POLICIES: shortage_comments
-- ---------------------------------------------------------------
CREATE POLICY "comments: todos leen"
  ON public.shortage_comments FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "comments: todos insertan"
  ON public.shortage_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = autor_id);

CREATE POLICY "comments: solo admin elimina"
  ON public.shortage_comments FOR DELETE TO authenticated
  USING (public.get_user_role() = 'Administrador');

-- ---------------------------------------------------------------
-- POLICIES: price_alerts
-- ---------------------------------------------------------------
CREATE POLICY "price_alerts: todos leen"
  ON public.price_alerts FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "price_alerts: todos insertan"
  ON public.price_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reportado_por);

CREATE POLICY "price_alerts: admin y compras actualizan/borran"
  ON public.price_alerts FOR ALL TO authenticated
  USING (public.get_user_role() IN ('Administrador', 'Compras'));

-- ---------------------------------------------------------------
-- POLICIES: audit_log
-- ---------------------------------------------------------------
CREATE POLICY "audit_log: solo admin lee"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.get_user_role() = 'Administrador');

-- ================================================================
-- STORAGE BUCKETS
-- (Ejecutar en Supabase Dashboard > Storage, o vía API)
-- ================================================================
-- Bucket: delivery-attachments  (albaranes, Excel, PDFs)
-- Bucket: price-alert-captures  (capturas de pantalla de precios)
-- Ambos: privados (no public), acceso vía signed URLs

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('delivery-attachments', 'delivery-attachments', FALSE, 52428800,
   ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/csv','image/png','image/jpeg','image/webp']),
  ('price-alert-captures', 'price-alert-captures', FALSE, 10485760,
   ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "delivery-attachments: autenticados leen"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'delivery-attachments');

CREATE POLICY "delivery-attachments: compras y admin suben"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'delivery-attachments' AND
    public.get_user_role() IN ('Administrador', 'Compras'));

CREATE POLICY "price-alert-captures: autenticados leen"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'price-alert-captures');

CREATE POLICY "price-alert-captures: todos suben"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'price-alert-captures');

-- ================================================================
-- DATOS INICIALES (Proveedores de ejemplo)
-- ================================================================
INSERT INTO public.suppliers (nombre, contacto, email, telefono) VALUES
  ('Bosch / BSH', 'Comercial BSH', 'pedidos@bsh.es', '900 123 456'),
  ('Samsung Electronics', 'Samsung B2B', 'b2b@samsung.es', '900 234 567'),
  ('LG Electronics', 'LG Mayoristas', 'mayoristas@lg.es', '900 345 678'),
  ('Balay / Siemens', 'Balay Distribución', 'distribuciones@balay.es', '900 456 789'),
  ('Whirlpool / Indesit', 'Whirlpool Trade', 'trade@whirlpool.es', '900 567 890'),
  ('Haier Europe', 'Haier B2B', 'b2b@haier.eu', '900 678 901'),
  ('Candy / Hoover', 'Candy Group', 'comercial@candy.es', '900 789 012'),
  ('AEG / Electrolux', 'Electrolux Pro', 'pro@electrolux.es', '900 890 123')
ON CONFLICT DO NOTHING;

-- ================================================================
-- USUARIO ADMINISTRADOR INICIAL
-- Email: alejandromorenocorboy@gmail.com
-- Contraseña por defecto: Admin1234!
-- ================================================================
DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email TEXT := 'alejandromorenocorboy@gmail.com';
  v_password TEXT := 'Admin1234!';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre_completo":"Alejandro Moreno","cargo":"Director General","rol":"Administrador"}',
      NOW(),
      NOW(),
      '',
      ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = NOW(),
        confirmed_at = NOW()
    WHERE email = v_email;
  END IF;

  INSERT INTO public.profiles (id, email, nombre_completo, cargo, rol)
  SELECT id, email, 'Alejandro Moreno', 'Director General', 'Administrador'::user_role
  FROM auth.users WHERE email = v_email
  ON CONFLICT (id) DO UPDATE
  SET rol = 'Administrador', cargo = 'Director General', nombre_completo = 'Alejandro Moreno';
END $$;
