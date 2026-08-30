# 🚚 Garde - Sistema de Gestión y Calendario de Descargas Logísticas

Plataforma web integral diseñada para optimizar la planificación, asignación de muelles y control en tiempo real de operaciones de carga y descarga de mercancías.

---

## ✨ Características Principales

- 📅 **Calendario Interactivo Multivista**: Visualización por mes, semana, día y lista con filtros dinámicos (estado, muelle, transportista, tipo de descarga).
- 🏢 **Gestión de Muelles y Turnos**: Asignación inteligente de muelles de carga/descarga y control de capacidades horarias.
- 👥 **Control de Acceso Basado en Roles (RBAC)**:
  - **Administradores / Jefes de Tráfico**: Creación y gestión de citas, administración de usuarios, asignación de muelles y reportes.
  - **Transportistas / Conductores**: Consulta de horarios asignados, confirmación de llegadas y seguimiento de estado.
- 📄 **Importación y Procesamiento Inteligente**: Soporte para parseo de ficheros (PDF, Excel/CSV, texto de correos electrónicos) con auto-rellenado de citas.
- 🔔 **Notificaciones y Estado en Tiempo Real**: Sincronización instantánea de estados (*Pendiente*, *En Muelle*, *Descargando*, *Completado*, *Retrasado*).
- 📱 **Diseño 100% Responsivo y Moderno**: Experiencia optimizada para tablets, móviles y escritorios con tema oscuro profesional y estética cuidada.

---

## 🛠️ Stack Tecnológico

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Estilos**: [Tailwind CSS](https://tailwindcss.com/), [Lucide Icons](https://lucide.dev/)
- **Backend & Base de Datos**: [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth en tiempo real)
- **Procesamiento de Documentos**: [PDF.js](https://mozilla.github.io/pdf.js/), [XLSX](https://sheetjs.com/)
- **Fechas y Tiempo**: [date-fns](https://date-fns.org/)

---

## 🚀 Puesta en Marcha en Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git
cd TU_REPOSITORIO
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
```env
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

### 4. Iniciar servidor de desarrollo
```bash
npm run dev
```

---

## 🔒 Seguridad
- Variables de entorno excluidas del repositorio vía `.gitignore`.
- Políticas de seguridad a nivel de fila (RLS) habilitadas en Supabase.
