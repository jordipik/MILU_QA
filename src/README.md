# Estructura principal

## client/auth
Autenticacion real de usuarios: login, registro, sesion y bloqueo inicial de la pagina.

## client/projects
Selector de proyectos, permisos, miembros, creacion/borrado de proyectos y cabecera de acciones.

## client/splash
Pantalla inicial animada antes del login.

## client/milu-demo
Funcionalidad del proyecto demo MILU QA.

- `js/`: tabla, lectura de JSON, visor PDF, overlays de colores, esquemas, revision, edicion, exportacion y helpers.
- `styles/`: estilos necesarios para la pantalla MILU QA, PDF y paneles relacionados.

## server/auth
Usuarios, sesiones, roles y autenticacion.

## server/projects
Proyectos, permisos, miembros y asignaciones.

## server/milu-demo
Backend especifico del demo MILU QA.

- `routers/`: rutas HTTP auxiliares.
- `services/`: servicios de revision, cache, SQLite y copia PDF.
- `validation/`: validaciones de payload y campos editables.
- `scripts/`: scripts JS usados por el backend para recalculo, exportacion, copia PDF y enriquecimiento.
- `config/`: configuracion compartida, como lista de engines.
- `lib/`: helpers de escritura/exportacion usados por backend.

## trash
Cuarentena para archivos que no son necesarios para que la pagina funcione. No se borra nada directamente: primero se mueve aqui para poder recuperar si hiciera falta.
