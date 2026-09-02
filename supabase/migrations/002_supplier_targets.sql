-- ============================================================
-- Migration 002: Objetivos y Rappels Anuales (Exclusivo Administrador)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    proveedor_nombre TEXT NOT NULL,
    ejercicio INTEGER NOT NULL,
    consumo_actual NUMERIC(14,2) NOT NULL DEFAULT 0,
    tramos JSONB NOT NULL DEFAULT '[]'::jsonb,
    notas TEXT,
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_supplier_targets_ejercicio ON public.supplier_targets(ejercicio);
CREATE INDEX IF NOT EXISTS idx_supplier_targets_proveedor ON public.supplier_targets(proveedor_nombre);

-- RLS: Only Administrador can access
ALTER TABLE public.supplier_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on supplier_targets"
ON public.supplier_targets
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.rol = 'Administrador'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.rol = 'Administrador'
    )
);
