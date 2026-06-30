# Makers · Venezuela — registro de producción

Registro abierto de producción 3D para la donación médica en Venezuela.
Los makers anotan cuántas férulas fabrican y entregan; el panel público suma
el esfuerzo de toda la red en tiempo real.

**Creado por [KAFETIN](https://www.kafetin.co) · con la tecnología de [Fab City](https://fab.city/)**
· [Things That Work](https://ttw.fab.city/venezuela)

**Sitio en vivo (fuente de verdad): https://makers4venezuela.github.io/**

> **Datos:** Fab City es una organización sin ánimo de lucro con sede en Estonia.
> La gestión de datos sigue los estándares de la Unión Europea (RGPD / GDPR).

---

> ⚠️ **Migración en curso.** Existió una versión anterior en Netlify
> (`makers4venezuela.netlify.app`) que escribía a un Google Sheet. Ya se redirige
> a este sitio (`m4v-redirect/`). Mientras alguien siga registrando en la app
> vieja, usa `migrate/migrate-data.sql` (borra y recarga) para re-importar; una
> tarea diaria (`m4v-sync-old-sheet`) regenera ese SQL automáticamente. Cuando la
> app vieja quede sin uso, **Supabase es la única fuente de verdad.**

---

## 1. Qué es esto

App **estática** (HTML/CSS/JS, sin build) servida por GitHub Pages, conectada en
vivo desde el navegador a una base de datos **Supabase** (PostgreSQL). Sin
servidor propio: el navegador lee/escribe contra Supabase con una clave pública
(`anon`); la seguridad la imponen las políticas de la base (RLS) y vistas
agregadas, no el secreto de la clave.

Dependencias por CDN: SDK de Supabase, **Leaflet + CARTO** (mapa, sin token),
**jsPDF** (reportes).

---

## 2. Funciones

- **Registro móvil** — identifícate una vez (país, nombre, taller), elige modelo
  (con su ícono), anota fabricadas/entregadas + foto. Sin cuenta, sin fricción.
- **Aportar (historial)** — carga varios lotes pasados de una vez.
- **Panel público** — KPIs, **mapa coroplético por país** (Leaflet/CARTO,
  intensidad naranja = unidades; toca un país para filtrar), producción por
  modelo con íconos, y **talleres participantes**: toca un taller para ver sus
  totales (fabricadas / entregadas / registros) en un popup.
- **Mi panel** — el track record del maker, agrupado por su taller (incluye
  historial importado y otros dispositivos del mismo taller). **Marca posibles
  duplicados** (mismo modelo, fecha y cantidades).
- **Filtros** de periodo / país / modelo y **reporte PDF** descargable en cada vista.
- **Cambiar voluntario / Salir** — borra la identidad del dispositivo para que el
  siguiente maker (en un equipo compartido) registre a su nombre.

---

## 3. Arquitectura

```
   Navegador del maker
   ┌───────────────────────────────────────────┐
   │ index.html (UI + enrutador de rutas)        │
   │ models-data.js (catálogo + miniaturas)      │
   │ supabase-client.js → window.M4V             │
   │ Leaflet + CARTO (mapa) · jsPDF (reportes)   │
   └───────────────┬─────────────────────────────┘
                   │ HTTPS REST + Storage (clave anon pública)
                   ▼
   ┌───────────────────────────────────────────┐
   │ Supabase (PostgreSQL) — operado por Fab City│
   │ tablas: makers, models, production_events,  │
   │   destinations                              │
   │ vistas públicas: dashboard_events,          │
   │   dashboard_by_country/by_model, inventory, │
   │   makers_lookup, maker_events               │
   │ Storage: bucket "fotos"                     │
   └───────────────────────────────────────────┘
```

**Identidad sin fricción:** un UUID por dispositivo en `localStorage`; sin cuenta.
Al identificarte, la app **adopta** un maker existente con el mismo nombre+taller
(vista `makers_lookup`) para que tus registros nuevos se sumen a los previos en
vez de duplicar. La creación del maker usa un *insert* simple tolerante a
duplicados (los upserts requieren permiso UPDATE que no se otorga).

**Rutas limpias:** el enrutador usa History API; `404.html` es un redirector
estático que preserva la ruta (truco SPA para GitHub Pages) — no necesita
mantenimiento.

---

## 4. Archivos del repo

| Archivo | Rol |
|---|---|
| `index.html` | App completa (tema TTW, enrutador, todas las vistas) |
| `404.html` | Redirector SPA para rutas profundas en GitHub Pages |
| `models-data.js` | Catálogo de 17 modelos + miniaturas (base64) |
| `supabase-client.js` | Capa de datos `window.M4V` (incluye la clave anon, pública) |

Carpetas de apoyo (NO se despliegan; se ejecutan/usan a mano):
`migrate/` (SQL de importación y arreglos), `m4v-redirect/` (redirección de la app vieja).

## 5. Rutas

| URL | Vista |
|---|---|
| `/` | Inicio |
| `/registro` | Registro móvil |
| `/dashboard` | Panel público (mapa, modelos, talleres con popup) |
| `/ingesta` | Aportar historial |
| `/mis-registros` | Mi panel (track record + duplicados) |

---

## 6. Puesta en marcha (Supabase, cuenta de Fab City)

1. Crear proyecto. Copiar *Project URL* y *anon public key* → pegarlas al inicio de `supabase-client.js`.
2. SQL Editor → ejecutar `migrate/schema.sql` (esquema base).
3. Ejecutar `migrate/fix-rls.sql` (políticas/RLS para escritura anónima).
4. Ejecutar `migrate/user-panel.sql` (vistas `makers_lookup` + `maker_events`
   que activan **Mi panel** y el reconocimiento de makers que regresan).
5. (Opcional) `migrate/migrate-data.sql` para importar el histórico del Sheet viejo.
6. Storage → bucket público **`fotos`**.

Despliegue: subir `index.html`, `404.html`, `models-data.js`, `supabase-client.js`
a la raíz del repo (GitHub Pages, rama `main`).

---

## 7. API

Dos formas: la capa **`window.M4V`** (web) y la **API REST de Supabase**
(integraciones, p. ej. agente de impresora — campo `source:"api"`).

| `window.M4V` | Qué hace |
|---|---|
| `saveProfile({name,org,country,city,phone,email})` | Crea/identifica al maker (adopta uno existente por nombre+taller) |
| `registerProduction(entry)` | Inserta un lote (crea el maker si falta) |
| `getRows()` | Feed agregado del panel |
| `getMyEvents()` | Registros del maker (por dispositivo + mismo taller) — alimenta Mi panel |
| `listModels()` · `uploadPhoto(file)` · `addDestination()` · `getDashboard()` | Catálogo, foto, destino, totales |

REST: `https://<PROYECTO>.supabase.co/rest/v1/<tabla>` con cabeceras
`apikey` + `Authorization: Bearer <anon>`. La clave anon puede **insertar**
makers/eventos y **leer** las vistas `dashboard_*` / `maker_events` /
`makers_lookup`; **no** puede leer teléfono/correo de la tabla `makers`.

---

## 8. Modelo de datos

- **makers** — quién imprime (nombre, taller, país, ciudad, contacto). PII protegida.
- **models** — catálogo (17 sembrados; orden = ids 1–17, no reordenar).
- **production_events** — modelo, fabricadas, entregadas, fecha, estado, foto, `source`.
- **destinations** — clínicas/hospitales.
- Vistas: `inventory`, `dashboard_*` (agregados públicos), `makers_lookup` /
  `maker_events` (Mi panel; sin datos personales).

---

## 9. Hoja de ruta

- **Verificación (Fase 2):** rol verificador que confirma entregas; hasta entonces los conteos son auto-reportados.
- **API de impresora (Fase 3):** un agente OctoPrint/Moonraker puede POSTear eventos (`source:"api"`) sin cambiar el esquema.
- **Fab City Index:** las vistas por país/modelo son la superficie de exportación, como indicador-caso de manufactura distribuida en crisis.
- **Limpieza:** consolidar talleres con grafías distintas ("WORLD 3D" vs "WORLD3D").

## 10. Gobernanza

Creado por **KAFETIN**, que mantiene la app. **Fab City** aporta la tecnología y
es responsable de los datos (controlador): sin ánimo de lucro, con sede en
Estonia, gestión conforme al RGPD. Cambios de esquema = aditivos. Por estar
operado por Fab City, este proyecto es la plantilla reutilizable para la próxima
respuesta de crisis.
