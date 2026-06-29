# Makers · Venezuela — registro de producción

Registro abierto de producción 3D para la donación médica en Venezuela.
Los makers anotan cuántas férulas fabrican y entregan; el panel público suma
el esfuerzo de toda la red en tiempo real.

**Un proyecto de Fab City · [Things That Work](https://ttw.fab.city/venezuela).**
Backend (datos) operado por Fab City; front-end mantenido por Sebas.

---

## Qué es esto

Una app estática (HTML/CSS/JS, sin build) servida por GitHub Pages, conectada a
una base de datos **Supabase** (Postgres). Sin framework, sin servidor propio.

### Archivos

| Archivo | Rol |
|---|---|
| `index.html` | App completa: estilo TTW + enrutador de rutas limpias |
| `404.html` | Copia de `index.html` — hace que las rutas profundas funcionen en GitHub Pages |
| `models-data.js` | Catálogo de 17 modelos + miniaturas (base64) |
| `supabase-client.js` | Capa de datos: perfil, registro, panel, inventario |

### Rutas (cada una con su propia URL, compartible)

| URL | Vista |
|---|---|
| `/` | Inicio — los tres accesos |
| `/registro` | Registro móvil: identifícate, elige modelo, anota fab/entregadas + foto |
| `/dashboard` | Panel público — compartible como enlace |
| `/ingesta` | Aportar historial: carga varios lotes pasados de una vez |

La identidad del maker se guarda una sola vez en el dispositivo (sin cuenta).
La verificación por magic-link existe en el esquema pero está apagada (Fase 2).

---

## Puesta en marcha (Supabase — lado Fab City)

1. Proyecto Supabase en la cuenta de **Fab City**. Copia *Project URL* y *anon public key*.
2. SQL Editor → ejecuta `schema.sql` (del paquete `makers4venezuela-supabase`).
3. Storage → bucket público **`fotos`** (para fotos de entrega).
4. Pega URL y anon key en `supabase-client.js` (la anon key es pública, va en el repo).

> La anon key puede insertar makers y eventos, pero **no** puede leer la tabla
> `makers` (teléfono/correo quedan privados) — solo las vistas agregadas del panel.

## Despliegue (GitHub Pages — lado Sebas)

1. Commit de los archivos (ver abajo).
2. Settings → Pages → deploy desde `main`, carpeta raíz.
3. `404.html` debe estar en la raíz: es lo que sirve `/dashboard`, `/registro`, etc.

```bash
git add index.html 404.html models-data.js supabase-client.js README.md
git commit -m "TTW-skinned app: rutas limpias, panel público, registro + ingesta, backend Supabase"
git push origin main
```

---

## Modelo de datos (resumen)

- **makers** — quién imprime (nombre, taller, país, ciudad, contacto)
- **models** — catálogo (17 modelos sembrados; `medically_validated` por defecto false)
- **production_events** — el corazón: modelo, fabricadas, entregadas, fecha, foto, estado
- **destinations** — clínicas/hospitales de entrega
- **inventory** — vista derivada: en mano = fabricadas − entregadas
- Vistas públicas (`dashboard_*`) — agregados sin datos personales

Mapa modelo→id: los ids sembrados (1–17) coinciden con el orden del catálogo.
**No reordenar las filas sembradas** o se rompe la correspondencia.

---

## Hoja de ruta

- **Fase 2 — verificación + inventario.** Rol verificador que confirma entregas;
  vista de inventario por maker. Hasta entonces, los conteos son auto-reportados.
- **Fase 3 — ingesta por API de impresora.** El campo `source` (`manual`/`api`)
  y `model_label` ya existen; un agente OctoPrint/Moonraker puede POSTear eventos
  sin cambiar el esquema. Empezar por OctoPrint/Moonraker; Bambu como best-effort.
- **Fab City Index.** Las vistas por país/evento son la superficie de exportación;
  conectar al Index como indicador-caso (respuesta de manufactura distribuida en
  crisis), no como línea base, hasta tener normalización y un trimestre de datos.

## Gobernanza

Fab City es responsable de los datos (controlador). Sebas opera el front-end.
Cambios de esquema = aditivos (nuevas columnas/vistas) para no romper un
front-end antiguo. Por ser de Fab City, este proyecto es la plantilla
reutilizable para la próxima instancia de crisis.
