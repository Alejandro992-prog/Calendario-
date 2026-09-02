-- ================================================================
-- FUNCIÓN PARA QUE EL ADMINISTRADOR PUEDA ELIMINAR CUENTAS DE USUARIO
-- DIRECTAMENTE DEL SISTEMA (auth.users Y public.profiles)
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user(
    target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role user_role;
BEGIN
  -- 1. Comprobar que el usuario que ejecuta la función es Administrador
  SELECT rol INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'Administrador'::user_role THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No autorizado: solo los usuarios con rol Administrador pueden eliminar cuentas de usuario'
    );
  END IF;

  -- 2. No permitir auto-eliminarse
  IF target_user_id = auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No puedes eliminar tu propia cuenta de usuario en uso'
    );
  END IF;

  -- 3. Eliminar de auth.users (en cascada elimina public.profiles y desvincula SET NULL en referencias)
  DELETE FROM auth.users WHERE id = target_user_id;

  IF NOT FOUND THEN
    -- Si por alguna inconsistencia no existiese en auth.users, eliminar de profiles
    DELETE FROM public.profiles WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Permitir ejecución a usuarios autenticados (la comprobación interna restringe a Administrador)
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
