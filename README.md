# Makers · Venezuela — registro de producción

Registro abierto de producción 3D para la donación médica en Venezuela.
Los makers anotan cuántas férulas fabrican y entregan; el panel público suma
el esfuerzo de toda la red en tiempo real.

**Creado por [KAFETIN](https://www.kafetin.co) · con la tecnología de Fab City**
· [Things That Work](https://ttw.fab.city/venezuela)

> **Datos:** Fab City es una organización sin ánimo de lucro con sede en Estonia.
> La gestión de datos de este registro sigue los estándares de la Unión Europea
> (RGPD / GDPR).

---

## 1. Qué es esto

Una aplicación **estática** (HTML/CSS/JS, sin framework ni paso de build) que
habla directamente con una base de datos **Supabase** (PostgreSQL). No hay
servidor propio que mantener: el navegador del maker lee y escribe contra
Supabase usando una clave pública (`anon`), y la seguridad la imponen las
políticas de la base de datos (RLS), no el secreto de la clave.

---

## 2. Arquitectura

```
   Navegador del maker (móvil/escritorio)
   ┌─────────────────────────────────────────┐
   │  index.html  (UI + enrutador de rutas)   │
   │  models-data.js  (catálogo + miniaturas) │
   │  supabase-client.js  → window.M4V        │
   └───────────────┬─────────────────────────┘
                   │  HTTPS (REST + Storage), clave anon pública
                   ▼
   ┌─────────────────────────────────────────┐
   │  Supabase (PostgreSQL)  — operado por FC │
   │  · tablas: makers, models,               │
   │    production_events, destinations       │
   │  · vistas públicas: dashboard_* , inventory
   │  · RLS: anon inserta; PII no es legible   │
   │  · Storage: bucket "fotos"               │
   └─────────────────────────────────────────┘
```

**Capas:**

- **Presentación** — `index.html`. Un solo archivo con el tema TTW (crema,
  naranja, Helvetica), un enrutador propio basado en History API, y cuatro
  vistas (inicio, registro, panel, aportar). Sin dependencias salvo el SDK de
  Supabase cargado por CDN.
- **Datos del catálogo** — `models-data.js` expone `window.CATALOG`
  (`IDS, NAMES, SUBS, ALTAS, IMGS`). Las miniaturas van en base64 para que el
  registro funcione sin pedir imágenes externas.
- **Acceso a datos** — `supabase-client.js` expone `window.M4V`, la única puerta
  entre la UI y la base. Toda lectura/escritura pasa por aquí (ver §6, API).
- **Backend** — Supabase. Postgres es la fuente de verdad; el panel lee vistas
  agregadas; las fotos viven en Storage.

**Identidad sin fricción:** un maker se identifica una vez. Se genera un UUID en
el dispositivo (`localStorage`) que actúa como su id; no hace falta cuenta ni
contraseña. La verificación por *magic-link* está prevista en el esquema pero
desactivada hasta la Fase 2.

**Enrutado de rutas limpias:** el enrutador lee `location.pathname`. Como GitHub
Pages no tiene router de servidor, `404.html` es una copia de `index.html`: ante
una ruta profunda (`/dashboard`) Pages sirve el 404, la app arranca y muestra la
sección correcta. El enrutador es agnóstico al prefijo, así que funciona igual en
`usuario.github.io/makers4venezuela/` que bajo un dominio propio.

---

## 3. Archivos

| Archivo | Rol |
|---|---|
| `index.html` | App completa: tema TTW, enrutador, registro, panel (con mapa, filtros y exportación), aportar |
| `404.html` | Copia de `index.html` — hace funcionar las rutas profundas en GitHub Pages |
| `models-data.js` | Catálogo de 17 modelos + miniaturas (base64) |
| `supabase-client.js` | Capa de datos `window.M4V` (clave anon incluida) |
| `schema.sql` | Esquema completo de Supabase (tablas, vistas, RLS, datos de los 17 modelos) |
| `migrate/` | Importación única del histórico del Google Sheet original |

---

## 4. Rutas (cada una con su URL, compartible)

| URL | Vista |
|---|---|
| `/` | Inicio — los tres accesos |
| `/registro` | Registro móvil: identifícate, elige modelo, anota fabricadas/entregadas + foto |
| `/dashboard` | Panel público — KPIs, **mapa por país**, producción por modelo, talleres; filtros de periodo / país / modelo y **exportación CSV** |
| `/ingesta` | Aportar historial: carga varios lotes pasados de una vez |

---

## 5. Puesta en marcha y despliegue

**Backend (Supabase, cuenta de Fab City):**

1. Crear proyecto Supabase. Copiar *Project URL* y *anon public key*.
2. SQL Editor → ejecutar `schema.sql`.
3. Storage → crear bucket público **`fotos`**.
4. Pegar URL y anon key al inicio de `supabase-client.js` (la anon key es
   pública; va en el repo sin problema).

**Frontend (GitHub Pages):**

1. Subir los archivos al repositorio.
2. Settings → Pages → desplegar desde `main`, carpeta raíz.
3. Confirmar que `404.html` está en la raíz (sirve las rutas profundas).

---

## 6. API — cómo leer y escribir datos

Hay dos formas de hablar con el backend: la **capa `window.M4V`** (para la web)
y la **API REST de Supabase** directa (para integraciones, p. ej. un agente de
impresora). Ambas usan la misma clave anon pública y respetan las mismas reglas
RLS.

### 6.1 Capa `window.M4V` (JavaScript en el navegador)

| Función | Qué hace |
|---|---|
| `M4V.saveProfile({name, org, country, city, phone, email})` | Crea/actualiza el perfil del maker en este dispositivo |
| `M4V.getProfile()` | Devuelve el perfil guardado localmente |
| `M4V.registerProduction(entry)` | Inserta un lote de producción (ver forma abajo) |
| `M4V.getRows()` | Lee el feed agregado para el panel (`{fecha, empresa, tipo, fab, ent, pais}`) |
| `M4V.getDashboard({range, country})` | Totales ya agregados (alternativa a `getRows`) |
| `M4V.listModels()` | Catálogo desde la base (`id, name, variant, …`) |
| `M4V.uploadPhoto(file)` | Sube una foto al bucket `fotos`, devuelve URL pública |
| `M4V.addDestination({name, city, org})` | Registra una clínica/destino de entrega |
| `M4V.getMyInventory()` | Inventario del maker (en mano = fabricadas − entregadas) |

Forma de `entry` para `registerProduction`:

```js
await M4V.registerProduction({
  modelId: 7,                       // id del catálogo, o null si es modelo libre
  modelLabel: "FTM Mano - 4to y 5to Metacarpo", // etiqueta legible
  fabricadas: 12,
  entregadas: 8,
  fecha: "2026-06-29",              // YYYY-MM-DD (por defecto hoy)
  notas: "Para clínica X",          // opcional
  status: "delivered",              // "printed" | "delivered" | "verified"
  source: "manual",                 // "manual" | "api"
  photoFile: fileInput.files[0]     // opcional
});
```

### 6.2 API REST de Supabase (integraciones externas)

Base URL: `https://<PROYECTO>.supabase.co/rest/v1`
Cabeceras en cada llamada:

```
apikey: <ANON_KEY>
Authorization: Bearer <ANON_KEY>
Content-Type: application/json
```

**Insertar un evento de producción** (esto es lo que haría un agente OctoPrint /
Moonraker al terminar una impresión — fíjese en `source: "api"`):

```bash
curl -X POST 'https://<PROYECTO>.supabase.co/rest/v1/production_events' \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "maker_id": "<UUID-DEL-MAKER>",
    "model_id": 7,
    "model_label": "FTM Mano - 4to y 5to Metacarpo",
    "qty_fabricated": 1,
    "qty_delivered": 0,
    "status": "printed",
    "event_date": "2026-06-29",
    "source": "api",
    "notes": "auto: impresión finalizada"
  }'
```

**Leer el panel público** (vista segura, sin datos personales):

```bash
# todos los eventos (para agregación en cliente)
curl 'https://<PROYECTO>.supabase.co/rest/v1/dashboard_events?select=*' \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"

# totales por país
curl 'https://<PROYECTO>.supabase.co/rest/v1/dashboard_by_country?select=*' \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"

# totales por modelo
curl 'https://<PROYECTO>.supabase.co/rest/v1/dashboard_by_model?select=*' \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

**Lo que la clave anon NO puede hacer:** leer la tabla `makers` (teléfono/correo
quedan privados), ni actualizar/borrar eventos de otros. Solo puede *insertar*
makers y eventos, y *leer* las vistas `dashboard_*`. Para operaciones
administrativas (verificación, exportaciones con PII) se usa la `service_role`
key, que custodia Fab City y nunca se publica.

---

## 7. Modelo de datos

- **makers** — quién imprime (nombre, taller, país, ciudad, contacto). PII protegida por RLS.
- **models** — catálogo (17 modelos sembrados; `medically_validated` por defecto `false`).
- **production_events** — el corazón: maker, modelo, fabricadas, entregadas, fecha, estado, foto, `source`.
- **destinations** — clínicas/hospitales de entrega.
- **inventory** *(vista)* — en mano = fabricadas − entregadas, por maker y modelo.
- **dashboard_events / dashboard_by_country / dashboard_by_model / dashboard_orgs** *(vistas públicas)* — agregados sin datos personales; son la superficie de exportación.

Mapa modelo→id: los ids sembrados (1–17) coinciden con el orden del catálogo en
`models-data.js`. **No reordenar las filas sembradas** o se rompe la correspondencia.

---

## 8. Hoja de ruta

- **Fase 2 — verificación + inventario.** Rol verificador que confirma entregas;
  vista de inventario por maker. Hasta entonces, los conteos son auto-reportados.
- **Fase 3 — ingesta por API de impresora.** Los campos `source` (`manual`/`api`)
  y `model_label` ya existen; un agente OctoPrint/Moonraker puede POSTear eventos
  (§6.2) sin cambiar el esquema. Empezar por OctoPrint/Moonraker; Bambu como best-effort.
- **Fab City Index.** Las vistas por país/modelo son la superficie de exportación;
  conectar al Index como indicador-caso (respuesta de manufactura distribuida en
  crisis), no como línea base, hasta tener normalización y un trimestre de datos.

---

## 9. Gobernanza y datos

Creado por **KAFETIN** ([www.kafetin.co](https://www.kafetin.co)), que mantiene
la aplicación. **Fab City** aporta la tecnología y es responsable de los datos
(controlador): organización sin ánimo de lucro con sede en Estonia, con gestión
de datos conforme a los estándares de la Unión Europea (RGPD / GDPR).

Los cambios de esquema son **aditivos** (nuevas columnas/vistas) para no romper
versiones anteriores del front-end. Por estar operado por Fab City, este proyecto
sirve de plantilla reutilizable para la próxima respuesta de crisis.
