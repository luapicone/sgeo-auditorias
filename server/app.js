/**
 * app.js — Aplicación Express (API REST + estáticos). No hace listen():
 *   · server/index.js  la levanta para desarrollo local
 *   · api/index.js     la exporta como función serverless (Vercel)
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { q, one, many, ready } from './db.js';
import { seedIfEmpty } from './seed.js';
import { calcularResultado } from './scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_DIR = join(__dirname, '..', 'public');
const JWT_SECRET = process.env.JWT_SECRET || 'sgeo-dev-secret-cambiar-en-produccion';

const estructura = JSON.parse(readFileSync(join(__dirname, 'data', 'estructura-sgeo.json'), 'utf8'));
const SES_VALIDOS = new Set(estructura.elementos.flatMap((e) => e.subelementos.map((s) => s.se)));

const app = express();
app.use(express.json({ limit: '2mb' }));

// Espera a que la BD esté inicializada (esquema + datos de ejemplo) antes de atender /api
app.use('/api', (req, res, next) => {
  ready()
    .then(seedIfEmpty)
    .then(() => next())
    .catch((e) => { console.error(e); res.status(500).json({ error: 'Error de base de datos' }); });
});

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno' });
});

/* ─────────────── Auth ─────────────── */
function sign(user) {
  return jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, JWT_SECRET, { expiresIn: '12h' });
}
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Sesión inválida o expirada' }); }
}
function soloJefa(req, res, next) {
  if (req.user.rol !== 'jefa') return res.status(403).json({ error: 'Requiere perfil jefa/coordinadora' });
  next();
}

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await one('SELECT * FROM users WHERE username = $1', [String(username || '').trim()]);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  res.json({ token: sign(user), user: { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol } });
}));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  res.json({ user: await one('SELECT id, username, nombre, rol FROM users WHERE id = $1', [req.user.id]) });
}));

/* ─────────────── Estructura SGEO ─────────────── */
app.get('/api/structure', auth, (_req, res) => res.json(estructura));

/* ─────────────── Usuarios (filtros de la jefa) ─────────────── */
app.get('/api/users', auth, soloJefa, wrap(async (_req, res) => {
  res.json(await many("SELECT id, nombre, username, rol FROM users WHERE rol = 'auditor' ORDER BY nombre"));
}));

/* ─────────────── Empresas ─────────────── */
app.get('/api/companies', auth, wrap(async (_req, res) => {
  res.json(await many('SELECT * FROM companies ORDER BY nombre'));
}));
app.post('/api/companies', auth, wrap(async (req, res) => {
  const { nombre, sector, ubicacion, notas } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const row = await one(
    'INSERT INTO companies (nombre, sector, ubicacion, notas) VALUES ($1,$2,$3,$4) RETURNING *',
    [nombre.trim(), sector || null, ubicacion || null, notas || null]
  );
  res.status(201).json(row);
}));

/* ─────────────── Auditorías ─────────────── */
async function loadAudit(id) {
  const a = await one(
    `SELECT a.*, c.nombre AS company_nombre, c.sector AS company_sector, c.ubicacion AS company_ubicacion
     FROM audits a JOIN companies c ON c.id = a.company_id WHERE a.id = $1`, [id]
  );
  if (!a) return null;
  a.items = await many('SELECT se, valoracion, observacion FROM audit_items WHERE audit_id = $1 ORDER BY se', [id]);
  a.resultado = calcularResultado(estructura, a.items);
  return a;
}

app.get('/api/audits', auth, wrap(async (req, res) => {
  const { company_id, auditor_id, estado, se, desde, hasta } = req.query;
  const where = [];
  const params = [];
  const P = (v) => { params.push(v); return '$' + params.length; };
  if (req.user.rol === 'auditor') where.push(`a.auditor_id = ${P(req.user.id)}`);
  if (company_id) where.push(`a.company_id = ${P(Number(company_id))}`);
  if (auditor_id) where.push(`a.auditor_id = ${P(Number(auditor_id))}`);
  if (estado) where.push(`a.estado = ${P(String(estado))}`);
  if (desde) where.push(`a.fecha >= ${P(String(desde))}`);
  if (hasta) where.push(`a.fecha <= ${P(String(hasta))}`);
  if (se) where.push(`EXISTS (SELECT 1 FROM audit_items ai WHERE ai.audit_id = a.id AND ai.se = ${P(Number(se))})`);

  const rows = await many(
    `SELECT a.id, a.fecha, a.estado, a.alcance_texto, a.auditor_nombre, a.created_at, a.closed_at,
            a.company_id, c.nombre AS company_nombre, c.sector AS company_sector
     FROM audits a JOIN companies c ON c.id = a.company_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.fecha DESC, a.id DESC`, params
  );
  for (const r of rows) {
    const items = await many('SELECT se, valoracion FROM audit_items WHERE audit_id = $1', [r.id]);
    const resu = calcularResultado(estructura, items);
    r.total = resu.total;
    r.avance = resu.avance;
  }
  res.json(rows);
}));

app.post('/api/audits', auth, wrap(async (req, res) => {
  const { company_id, fecha, alcance_texto, scope } = req.body || {};
  if (!company_id) return res.status(400).json({ error: 'Empresa obligatoria' });
  if (!fecha) return res.status(400).json({ error: 'Fecha obligatoria' });
  if (!(await one('SELECT id FROM companies WHERE id = $1', [Number(company_id)])))
    return res.status(400).json({ error: 'Empresa inexistente' });

  const ses = Array.isArray(scope) && scope.length
    ? [...new Set(scope.map(Number))].filter((s) => SES_VALIDOS.has(s))
    : [...SES_VALIDOS];

  const a = await one(
    `INSERT INTO audits (company_id, auditor_id, auditor_nombre, fecha, alcance_texto)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [Number(company_id), req.user.id, req.user.nombre, String(fecha), alcance_texto || null]
  );
  for (const s of ses) await q('INSERT INTO audit_items (audit_id, se) VALUES ($1,$2)', [a.id, s]);
  res.status(201).json(await loadAudit(a.id));
}));

async function getEditable(req, res) {
  const a = await one('SELECT * FROM audits WHERE id = $1', [Number(req.params.id)]);
  if (!a) { res.status(404).json({ error: 'Auditoría no encontrada' }); return null; }
  if (req.user.rol === 'auditor' && a.auditor_id !== req.user.id) {
    res.status(403).json({ error: 'No es su auditoría' }); return null;
  }
  return a;
}

app.get('/api/audits/:id', auth, wrap(async (req, res) => {
  const a = await one('SELECT auditor_id FROM audits WHERE id = $1', [Number(req.params.id)]);
  if (!a) return res.status(404).json({ error: 'Auditoría no encontrada' });
  if (req.user.rol === 'auditor' && a.auditor_id !== req.user.id)
    return res.status(403).json({ error: 'No es su auditoría' });
  res.json(await loadAudit(Number(req.params.id)));
}));

app.patch('/api/audits/:id/scope', auth, wrap(async (req, res) => {
  const a = await getEditable(req, res);
  if (!a) return;
  if (a.estado === 'cerrada') return res.status(409).json({ error: 'Auditoría cerrada' });
  const ses = [...new Set((req.body.scope || []).map(Number))].filter((s) => SES_VALIDOS.has(s));
  if (!ses.length) return res.status(400).json({ error: 'Alcance vacío' });
  const actuales = (await many('SELECT se FROM audit_items WHERE audit_id = $1', [a.id])).map((r) => r.se);
  const set = new Set(ses);
  for (const s of actuales) if (!set.has(s)) await q('DELETE FROM audit_items WHERE audit_id = $1 AND se = $2', [a.id, s]);
  for (const s of ses) if (!actuales.includes(s))
    await q('INSERT INTO audit_items (audit_id, se) VALUES ($1,$2) ON CONFLICT DO NOTHING', [a.id, s]);
  res.json(await loadAudit(a.id));
}));

app.patch('/api/audits/:id/items', auth, wrap(async (req, res) => {
  const a = await getEditable(req, res);
  if (!a) return;
  if (a.estado === 'cerrada') return res.status(409).json({ error: 'Auditoría cerrada' });
  const cambios = Array.isArray(req.body.items) ? req.body.items : [];
  for (const c of cambios) {
    const se = Number(c.se);
    if (!SES_VALIDOS.has(se)) continue;
    const val = ['C', 'CP', 'NC', 'NA'].includes(c.valoracion) ? c.valoracion : null;
    const obs = c.observacion != null ? String(c.observacion) : null;
    await q(
      `INSERT INTO audit_items (audit_id, se, valoracion, observacion) VALUES ($1,$2,$3,$4)
       ON CONFLICT (audit_id, se) DO UPDATE SET valoracion = EXCLUDED.valoracion,
         observacion = EXCLUDED.observacion, updated_at = now()`,
      [a.id, se, val, obs]
    );
  }
  res.json(await loadAudit(a.id));
}));

app.post('/api/audits/:id/close', auth, wrap(async (req, res) => {
  const a = await getEditable(req, res);
  if (!a) return;
  const full = await loadAudit(a.id);
  const pendientes = full.items.filter((i) => !i.valoracion).length;
  if (pendientes > 0 && !req.body.forzar)
    return res.status(409).json({ error: `Quedan ${pendientes} subelementos sin valorar`, pendientes });
  await q(
    "UPDATE audits SET estado = 'cerrada', closed_at = now(), resultado_json = $1 WHERE id = $2",
    [JSON.stringify(full.resultado), a.id]
  );
  res.json(await loadAudit(a.id));
}));

app.post('/api/audits/:id/reopen', auth, wrap(async (req, res) => {
  const a = await getEditable(req, res);
  if (!a) return;
  await q("UPDATE audits SET estado = 'en_progreso', closed_at = NULL WHERE id = $1", [a.id]);
  res.json(await loadAudit(a.id));
}));

app.delete('/api/audits/:id', auth, wrap(async (req, res) => {
  const a = await getEditable(req, res);
  if (!a) return;
  await q('DELETE FROM audits WHERE id = $1', [a.id]);
  res.json({ ok: true });
}));

/* ─────────────── Comparación (jefa) ─────────────── */
app.get('/api/compare', auth, soloJefa, wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  if (ids.length < 2) return res.status(400).json({ error: 'Seleccione al menos 2 auditorías' });
  const audits = (await Promise.all(ids.map((id) => loadAudit(id)))).filter(Boolean);
  res.json({
    generado: new Date().toISOString(),
    elementos: estructura.elementos.map((e) => ({ codigo: e.codigo, nombre: e.nombre, pdca: e.pdca })),
    auditorias: audits.map((a) => ({
      id: a.id, empresa: a.company_nombre, sector: a.company_sector, fecha: a.fecha,
      auditor: a.auditor_nombre, estado: a.estado,
      total: a.resultado.total, avance: a.resultado.avance, fases: a.resultado.fases,
      elementos: a.resultado.elementos.map((el) => ({
        codigo: el.codigo, nombre: el.nombre, logro: el.logro, estado: el.estado, aplica: el.aplica,
        puntajeElemento: el.puntajeElemento, pesoElemento: el.pesoElemento,
      })),
    })),
  });
}));

/* ─────────────── Reportes (Power BI / BI) ───────────────
 * Endpoints de sólo lectura, en JSON plano, pensados para "Obtener datos → Web" de
 * Power BI (o cualquier herramienta de BI). Usan la MISMA lógica de server/scoring.js
 * que el resto de la app — no hay cálculos duplicados.
 * Protegidos por una clave (no requieren login de usuario): ?key=... o header x-api-key.
 * Se habilitan sólo si existe la variable de entorno REPORTS_API_KEY. */
const REPORTS_KEY = process.env.REPORTS_API_KEY || null;
function reportAuth(req, res, next) {
  if (!REPORTS_KEY)
    return res.status(503).json({ error: 'Reportes no habilitados: falta configurar REPORTS_API_KEY en el servidor' });
  const key = req.query.key || req.headers['x-api-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (key !== REPORTS_KEY) return res.status(401).json({ error: 'Clave de reportes inválida' });
  next();
}

/** Todas las auditorías (de todos los auditores) con su resultado calculado. */
async function allAuditsFull() {
  const rows = await many(
    `SELECT a.*, c.nombre AS company_nombre, c.sector AS company_sector, c.ubicacion AS company_ubicacion
     FROM audits a JOIN companies c ON c.id = a.company_id ORDER BY a.id`
  );
  for (const a of rows) {
    a.items = await many('SELECT se, valoracion, observacion FROM audit_items WHERE audit_id = $1 ORDER BY se', [a.id]);
    a.resultado = calcularResultado(estructura, a.items);
  }
  return rows;
}

app.get('/api/reportes/auditorias', reportAuth, wrap(async (_req, res) => {
  const audits = await allAuditsFull();
  res.json(audits.map((a) => ({
    auditoria_id: a.id,
    empresa: a.company_nombre, sector: a.company_sector, ubicacion: a.company_ubicacion,
    auditor: a.auditor_nombre, fecha: a.fecha, estado: a.estado, alcance: a.alcance_texto,
    total_pct: a.resultado.total.porcentaje, total_estado: a.resultado.total.estado,
    total_puntaje: a.resultado.total.puntajeSobre100, total_peso_incluido: a.resultado.total.pesoIncluido,
    avance_pct: a.resultado.avance.porcentaje,
    subelementos_total: a.resultado.avance.totalSubelementos,
    subelementos_valorados: a.resultado.avance.subelementosValorados,
    creada: a.created_at, cerrada: a.closed_at,
  })));
}));

app.get('/api/reportes/elementos', reportAuth, wrap(async (_req, res) => {
  const audits = await allAuditsFull();
  const rows = [];
  for (const a of audits) for (const e of a.resultado.elementos) rows.push({
    auditoria_id: a.id, empresa: a.company_nombre, auditor: a.auditor_nombre, fecha: a.fecha, estado_auditoria: a.estado,
    elemento_codigo: e.codigo, elemento_nombre: e.nombre, fase_pdca: e.pdca,
    peso: e.pesoElemento, aplica: e.aplica, logro_pct: e.logro != null ? e.logro * 100 : null,
    estado_elemento: e.estado, puntaje: e.puntajeElemento,
    subelementos_total: e.totalSubelementos, subelementos_aplicables: e.subelementosAplicables,
    subelementos_na: e.subelementosNA, subelementos_valorados: e.subelementosValorados,
  });
  res.json(rows);
}));

app.get('/api/reportes/subelementos', reportAuth, wrap(async (_req, res) => {
  const audits = await allAuditsFull();
  const rows = [];
  for (const a of audits) {
    const obs = new Map(a.items.map((it) => [it.se, it.observacion]));
    for (const e of a.resultado.elementos) for (const s of e.subelementos) rows.push({
      auditoria_id: a.id, empresa: a.company_nombre, auditor: a.auditor_nombre, fecha: a.fecha, estado_auditoria: a.estado,
      elemento_codigo: e.codigo, se: s.se, subelemento: s.detalle, fase_pdca: s.pdca,
      valoracion: s.valoracion, evaluacion_final_pct: s.evaluacionFinal != null ? s.evaluacionFinal * 100 : null,
      observacion: obs.get(s.se) || null,
    });
  }
  res.json(rows);
}));

app.get('/api/reportes/fases', reportAuth, wrap(async (_req, res) => {
  const audits = await allAuditsFull();
  const rows = [];
  for (const a of audits) for (const f of a.resultado.fases) rows.push({
    auditoria_id: a.id, empresa: a.company_nombre, fecha: a.fecha,
    fase_pdca: f.pdca, peso: f.peso, puntaje: f.puntaje,
    logro_pct: f.logro != null ? f.logro * 100 : null, estado: f.estado,
  });
  res.json(rows);
}));

/* ─────────────── Estáticos + SPA fallback ─────────────── */
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (r, p) => { if (/\.(css|js|html)$/.test(p)) r.setHeader('Cache-Control', 'no-store'); },
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado' });
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

export default app;
