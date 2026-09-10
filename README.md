# Herramienta de Auditorías SGEO

Aplicación web para digitalizar la hoja **«Comparativa SGEO FINAL»** como
herramienta de auditoría del **Sistema de Gestión de Excelencia Operacional** (SGEO)
(Modelo de Excelencia Operacional YPF / Modelo YPF 2.0).

El auditor sólo carga la **valoración** de cada requisito (`Cumple` /
`Cumple parcialmente` / `No cumple` / `No aplica`); la aplicación replica los
puntajes, ponderaciones y estados del Excel. La jefa/coordinadora ve todas las
auditorías, las filtra y las compara.

> La réplica de los cálculos del Excel está documentada en
> **[`ANALISIS_EXCEL.md`](ANALISIS_EXCEL.md)**.

---

## 1. Cómo correrla localmente

**Requisitos:** Node.js ≥ 20. En local usa **PGlite** (Postgres embebido en un
archivo, sin instalar nada); en Vercel usa el **Postgres** que se conecte al proyecto.

```bash
cd sgeo-auditorias
npm install          # express, jsonwebtoken, bcryptjs, pg, @electric-sql/pglite
npm run seed         # crea la base con datos de ejemplo
npm start            # servidor en http://localhost:4000
```

Abrir <http://localhost:4000> e ingresar con alguno de los usuarios de prueba:

| Perfil | Usuario | Contraseña |
|--------|---------|-----------|
| Auditor | `auditor` | `auditor123` |
| Auditor | `auditor2` | `auditor123` |
| Jefa / Coordinadora | `jefa` | `jefa123` |

`npm run dev` levanta el servidor con recarga automática. `npm run seed`
**reinicia** los datos de ejemplo (borra todo y vuelve a crear).

Variables de entorno: `PORT` (default 4000), `JWT_SECRET`, `DATABASE_URL` / `POSTGRES_URL`
(si se define, usa ese Postgres en vez de PGlite local).

---

## 2. Arquitectura

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Cliente (SPA, vanilla JS)  │  HTTP  │  Servidor (Node + Express)   │
│  public/  (SPA vanilla JS)  │ ─────► │  server/  (Express)          │
│  · router por hash          │  JSON  │  · API REST + JWT            │
│  · Chart.js (gráficos)      │        │  · scoring.js (lógica Excel) │
│  · jsPDF (PDF individual y   │        │  · Postgres / PGlite (BD)    │
│    comparativo)             │        │  · sirve el cliente estático │
└─────────────────────────────┘        └──────────────┬───────────────┘
                                                      │
                                       Postgres (Vercel) / PGlite (local)
                                       server/data/estructura-sgeo.json
```

- **Sin build step.** El cliente son módulos ES servidos tal cual; Chart.js y jsPDF
  se cargan desde CDN (jsDelivr).
- **Una sola fuente de verdad para los cálculos:** `server/scoring.js`. El cliente
  nunca recalcula; muestra lo que devuelve la API.
- La estructura de elementos/subelementos/pesos vive en
  `server/data/estructura-sgeo.json`, generada desde el Excel con
  `scripts/extract-estructura.py` (ver sección 5).

### Estructura de carpetas

```
server/
  app.js           app Express (API REST + estáticos)
  index.js         arranque local · api/index.js = entrypoint Vercel
  db.js            capa de datos (Postgres / PGlite)
  schema.sql       esquema
  seed.js          datos de ejemplo (npm run seed)
  scoring.js       réplica de la lógica de la hoja "Comparativa SGEO FINAL"
  data/
    estructura-sgeo.json   estructura + pesos + umbrales (derivado del Excel)
    pgdata/                base local PGlite (se crea sola)
public/
  index.html
  css/styles.css
  js/
    app.js         router + shell
    api.js         cliente HTTP + sesión
    ui.js          helpers de UI
    charts.js      gráficos (Chart.js)
    pdf.js         generación de PDF (jsPDF)
    views/         login, dashboard, nueva, audit, comparar
scripts/
  extract-estructura.py       Excel  →  estructura-sgeo.json
  fuente-comparativa-sgeo.xlsx copia del Excel original
```

---

## 3. Modelo de datos

PostgreSQL, 4 tablas (`server/schema.sql`):

| Tabla | Campos principales | Notas |
|-------|--------------------|-------|
| `users` | `username`, `password_hash` (bcrypt), `nombre`, `rol` (`auditor` \| `jefa`) | |
| `companies` | `nombre`, `sector`, `ubicacion`, `notas` | Empresas auditadas |
| `audits` | `company_id`, `auditor_id`, `auditor_nombre`, `fecha`, `alcance_texto`, `estado` (`en_progreso` \| `cerrada`), `resultado_json`, `closed_at` | `resultado_json` = snapshot del resultado al cerrar |
| `audit_items` | `audit_id`, `se`, `valoracion` (`C`/`CP`/`NC`/`NA`, nullable), `observacion` | **La existencia de la fila = subelemento en alcance.** Valoración `null` = pendiente |

**Los puntajes calculados y resultados finales no se guardan denormalizados**: se
computan en cada request con `scoring.js` a partir de `audit_items` +
`estructura-sgeo.json`. Al cerrar la auditoría se congela una copia en
`audits.resultado_json` para trazabilidad.

La estructura del modelo (elementos, subelementos, pesos, umbrales) es un JSON
versionado, no una tabla, porque es un catálogo fijo derivado del Excel.

---

## 4. API REST

Todas las rutas (excepto login) requieren `Authorization: Bearer <token>`.

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/api/auth/login` | — | Devuelve `{token, user}` |
| GET | `/api/auth/me` | ambos | Valida sesión |
| GET | `/api/structure` | ambos | Estructura SGEO (JSON) |
| GET | `/api/companies` · POST | ambos | Listar / crear empresas |
| GET | `/api/users` | jefa | Auditores (para filtros) |
| GET | `/api/audits` | ambos | Lista con filtros: `company_id`, `auditor_id`, `estado`, `se`, `desde`, `hasta`. El auditor sólo ve las suyas |
| POST | `/api/audits` | auditor | Crear (`company_id`, `fecha`, `alcance_texto`, `scope[]`) |
| GET | `/api/audits/:id` | ambos | Auditoría + ítems + `resultado` calculado |
| PATCH | `/api/audits/:id/scope` | auditor dueño | Cambiar alcance |
| PATCH | `/api/audits/:id/items` | auditor dueño | Cargar valoraciones `[{se, valoracion, observacion}]` |
| POST | `/api/audits/:id/close` | auditor dueño | Cerrar (avisa si hay pendientes; `{forzar:true}` para cerrar igual) |
| POST | `/api/audits/:id/reopen` | auditor dueño | Reabrir |
| DELETE | `/api/audits/:id` | auditor dueño | Eliminar |
| GET | `/api/compare?ids=1,2,3` | jefa | Payload comparativo (2 a 6 auditorías) |

---

## 5. Cómo se replican los cálculos del Excel

Resumen (el detalle completo, con las fórmulas celda por celda, está en
[`ANALISIS_EXCEL.md`](ANALISIS_EXCEL.md)):

1. **Valoración → fracción** (columna S del Excel):
   `C = 1.0`, `CP = 0.3`, `NC = 0.0`. **`NA` no se cuenta** (se excluye del cálculo).
2. **% de logro del elemento** (columna T): `Σ fracciones / cantidad de subelementos`
   (cada subelemento pesa 1, columna M).
3. **Estado** (columna U): umbrales `91 / 81 / 61 / 41 %` →
   `Mantener / Optimizar / Mejorar / Implementar / Crítico`.
4. **Puntaje del elemento** (columna V): `peso_L × % de logro`
   (pesos `E1..E5 = 15, 15, 15, 35, 20`; suman 100).
5. **Total de auditoría** (columna W): `Σ puntajes / Σ pesos` (= `/100` con alcance
   completo).

Con las 27 filas cargadas, los resultados de la app son **idénticos** a las celdas
T/U/V/W del Excel. Lo único que la app agrega (porque el Excel no lo define) es el
manejo de **alcance parcial**, el tratamiento de **`NA` como no computable** y el **estado global / resultado por fase PDCA (4 fases)** — todo
señalado en `ANALISIS_EXCEL.md` §4.

### Regenerar la estructura desde el Excel

```bash
pip install openpyxl
python3 scripts/extract-estructura.py [ruta/al/archivo.xlsx]
```

Sobrescribe `server/data/estructura-sgeo.json`. Si el Excel cambia (nuevos
subelementos, pesos distintos), correr este script y luego `npm run seed`.

---

## 6. Datos de ejemplo (`npm run seed`)

- **3 usuarios:** 2 auditores + 1 jefa (tabla de la sección 1).
- **4 empresas:** Refinería Norte, Petroquímica del Sur, Logística Andina,
  Terminal Portuaria Atlántico.
- **8 auditorías:**
  - 6 cerradas, incluyendo **2 empresas con auditoría en dos años distintos**
    (2025 y 2026) para comparar evolución, y una con **alcance parcial** (sólo
    E1, E2, E4).
  - 2 en progreso (una integral, una de seguimiento sobre E4/E5).
- Niveles de cumplimiento variados (de “Crítico” a “Optimizar”) para probar todos
  los estados y las comparaciones.

### Para probar la comparación

Entrar como `jefa` → **Comparar auditorías** → seleccionar, por ejemplo, las de
Refinería Norte (2026), Petroquímica del Sur (2026) y Terminal Portuaria, y pulsar
**Comparar**. O desde el panel principal, tildar varias filas y usar
**“Comparar seleccionadas”**. El botón **“PDF comparativo”** descarga el reporte.

---

## 7. Flujo de uso

**Auditor**

1. *Nueva auditoría* → empresa (se puede crear en el momento), fecha, auditor
   responsable, alcance, y qué elementos/subelementos auditar.
2. *Carga de valoraciones* → por cada requisito, un clic en `C` / `CP` / `NC` /
   `NA` (+ observación opcional). Autoguardado. El avance y el puntaje se
   actualizan en vivo.
3. *Resultados y avance* → puntaje por subelemento, elemento, fase PDCA y total,
   con gráficos.
4. *Cerrar auditoría* → queda en sólo lectura (se puede reabrir).
5. *PDF* → resumen ejecutivo de la auditoría.

**Jefa / Coordinadora**

1. *Panel principal* → todas las auditorías, con filtros (empresa, auditor,
   estado, elemento auditado, rango de fechas) y KPIs.
2. Seleccionar 2–6 y *Comparar* → tablas por elemento/fase, radar, barras y
   *PDF comparativo*.

---

## 8. Despliegue en Vercel (con Postgres gratis)

La app está lista para Vercel: `api/index.js` expone la app Express como función
serverless y `vercel.json` enruta `/api/*` hacia ella; el resto es estático.

En serverless **no hay disco persistente**, así que se usa Postgres:

1. Subir este proyecto a un repositorio de GitHub e importarlo en Vercel
   (**Add New… → Project**), o `vercel` con la CLI.
2. En el proyecto de Vercel: **Storage → Create Database → Postgres** (plan gratis).
   Vercel inyecta solo las variables `POSTGRES_URL` / `DATABASE_URL`.
3. **Settings → Environment Variables:** agregar `JWT_SECRET` con un valor propio.
4. **Redeploy.** En el primer arranque la app crea las tablas y carga los datos de
   ejemplo automáticamente (`server/db.js` + `server/seed.js` → `seedIfEmpty`).

Sin base de datos conectada, la parte estática (login, textos) carga igual pero las
llamadas a `/api` responden un error pidiendo conectar Postgres. En local, sin
`DATABASE_URL`, se usa PGlite (archivo en `server/data/pgdata`) sin configurar nada.

Para reiniciar los datos de ejemplo en producción: `Storage → Data → Query` y
`TRUNCATE audit_items, audits, companies, users RESTART IDENTITY CASCADE;`, luego
redeploy (o correr `npm run seed` localmente apuntando `DATABASE_URL` a esa base).

## 9. Notas de seguridad (entorno productivo)

Esta entrega está pensada para uso interno / demo. Antes de exponerla:

- Definir `JWT_SECRET` por variable de entorno.
- Servir por HTTPS.
- Cambiar las contraseñas de ejemplo y agregar una gestión de usuarios real.
- Hacer backup del archivo el Postgres del proyecto (Vercel → Storage → Backups).
