-- ================================================================
-- FUNCIÓN PARA QUE EL ADMINISTRADOR PUEDA MODIFICAR LA CONTRASEÑA
-- DE CUALQUIER USUARIO DIRECTAMENTE SIN SOLICITAR LA CONTRASEÑA ANTIGUA
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    target_user_id UUID,
    new_password TEXT
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
      'error', 'No autorizado: solo los usuarios con rol Administrador pueden restablecer contraseñas'
    );
  END IF;

  -- 2. Validar longitud mínima de la contraseña
  IF length(new_password) < 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'La nueva contraseña debe contener al menos 6 caracteres'
    );
  END IF;

  -- 3. Actualizar la contraseña en auth.users con hash bcrypt
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Usuario no encontrado en el sistema de autenticación'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Permitir ejecución a usuarios autenticados (la comprobación interna restringe a Administrador)
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
