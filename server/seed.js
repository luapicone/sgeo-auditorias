/**
 * seed.js — Datos de ejemplo.
 *
 *  - seedIfEmpty(q):  crea los datos sólo si la tabla users está vacía (lo llama db.js
 *                     en cada arranque; no destruye nada).
 *  - `npm run seed`:  BORRA todo y vuelve a crear los datos de ejemplo.
 */
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { q as dbq } from './db.js';
import { calcularResultado } from './scoring.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const estructura = JSON.parse(readFileSync(join(__dirname, 'data', 'estructura-sgeo.json'), 'utf8'));
const TODAS_SES = estructura.elementos.flatMap((e) => e.subelementos.map((s) => s.se));
const hash = (p) => bcrypt.hashSync(p, 10);

const USERS = [
  { username: 'auditor',  password: 'auditor123', nombre: 'Juan Pérez',      rol: 'auditor' },
  { username: 'auditor2', password: 'auditor123', nombre: 'María Gómez',     rol: 'auditor' },
  { username: 'jefa',     password: 'jefa123',    nombre: 'Laura Fernández', rol: 'jefa' },
];
const COMPANIES = [
  { nombre: 'Refinería Norte S.A.',          sector: 'Refinación',              ubicacion: 'Plaza Huincul, Neuquén' },
  { nombre: 'Petroquímica del Sur S.A.',     sector: 'Petroquímica',            ubicacion: 'Bahía Blanca, Buenos Aires' },
  { nombre: 'Logística Andina S.R.L.',       sector: 'Almacenaje y transporte', ubicacion: 'Luján de Cuyo, Mendoza' },
  { nombre: 'Terminal Portuaria Atlántico',  sector: 'Terminales marítimas',    ubicacion: 'Puerto Rosales, Buenos Aires' },
];

function valoracionesPara(nivel, seed) {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const out = {};
  for (const se of TODAS_SES) {
    const p = nivel + (rnd() - 0.5) * 0.5;
    if (p > 0.82) out[se] = 'C';
    else if (p > 0.55) out[se] = rnd() > 0.4 ? 'C' : 'PC';
    else if (p > 0.35) out[se] = rnd() > 0.5 ? 'PC' : 'NC';
    else out[se] = rnd() > 0.7 ? 'NA' : 'NC';
  }
  return out;
}

const ELEMS_SES = (codes) =>
  estructura.elementos.filter((e) => codes.includes(e.codigo)).flatMap((e) => e.subelementos.map((s) => s.se));

const PLAN = [
  { comp: 0, user: 'auditor',  fecha: '2025-03-12', nivel: 0.62, seed: 11, cerrada: true },
  { comp: 0, user: 'auditor',  fecha: '2026-03-18', nivel: 0.78, seed: 12, cerrada: true },
  { comp: 1, user: 'auditor2', fecha: '2025-06-04', nivel: 0.71, seed: 21, cerrada: true },
  { comp: 1, user: 'auditor2', fecha: '2026-06-10', nivel: 0.83, seed: 22, cerrada: true },
  { comp: 2, user: 'auditor',  fecha: '2026-02-20', nivel: 0.44, seed: 31, cerrada: true },
  { comp: 3, user: 'auditor2', fecha: '2026-05-15', nivel: 0.55, seed: 41, cerrada: true,
    scope: ELEMS_SES(['E1', 'E2', 'E4']),
    alcance: 'Alcance parcial: Liderazgo (E1), Planificación (E2) y Operación (E4).' },
  { comp: 2, user: 'auditor',  fecha: '2026-08-28', nivel: 0.60, seed: 33, cerrada: false },
  { comp: 0, user: 'auditor',  fecha: '2026-09-05', nivel: 0.80, seed: 15, cerrada: false,
    scope: ELEMS_SES(['E4', 'E5']),
    alcance: 'Seguimiento de hallazgos previos en Operación (E4) y Evaluación y mejora (E5).' },
];

let _seedPromise = null;
/** Siembra los datos de ejemplo sólo si la tabla users está vacía. Idempotente. */
export function seedIfEmpty() {
  if (!_seedPromise) _seedPromise = (async () => {
    const { rows } = await dbq('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n > 0) return false;
    await doSeed(dbq);
    return true;
  })();
  return _seedPromise;
}

async function doSeed(q) {
  const userId = {};
  for (const u of USERS) {
    const r = await q(
      'INSERT INTO users (username, password_hash, nombre, rol) VALUES ($1,$2,$3,$4) RETURNING id',
      [u.username, hash(u.password), u.nombre, u.rol]
    );
    userId[u.username] = r.rows[0].id;
  }

  const compId = [];
  for (const c of COMPANIES) {
    const r = await q(
      'INSERT INTO companies (nombre, sector, ubicacion) VALUES ($1,$2,$3) RETURNING id',
      [c.nombre, c.sector, c.ubicacion]
    );
    compId.push(r.rows[0].id);
  }

  for (const p of PLAN) {
    const scope = p.scope || TODAS_SES;
    const vals = valoracionesPara(p.nivel, p.seed);
    const items = scope.map((se) => ({ se, valoracion: p.cerrada || (se % 7 !== 0) ? vals[se] : null }));
    const resultado = calcularResultado(estructura, items);
    const nombre = USERS.find((u) => u.username === p.user).nombre;
    const r = await q(
      `INSERT INTO audits (company_id, auditor_id, auditor_nombre, fecha, alcance_texto, estado, resultado_json, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        compId[p.comp], userId[p.user], nombre, p.fecha,
        p.alcance || 'Auditoría integral del Sistema de Gestión de Excelencia Operacional (SGEO).',
        p.cerrada ? 'cerrada' : 'en_progreso',
        p.cerrada ? JSON.stringify(resultado) : null,
        p.cerrada ? p.fecha + 'T17:00:00Z' : null,
      ]
    );
    const auditId = r.rows[0].id;
    for (const it of items) {
      await q('INSERT INTO audit_items (audit_id, se, valoracion) VALUES ($1,$2,$3)', [auditId, it.se, it.valoracion]);
    }
  }
}

/* --------- Ejecución directa: npm run seed (reinicia los datos) --------- */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { USING_POSTGRES } = await import('./db.js');
  await dbq('TRUNCATE audit_items, audits, companies, users RESTART IDENTITY CASCADE');
  await doSeed(dbq);
  console.log(`\n  Semilla cargada (${USING_POSTGRES ? 'PostgreSQL' : 'PGlite local'}): ${USERS.length} usuarios, ${COMPANIES.length} empresas, ${PLAN.length} auditorías.`);
  console.log('  Auditor:  usuario "auditor"  / clave "auditor123"');
  console.log('  Auditor:  usuario "auditor2" / clave "auditor123"');
  console.log('  Jefa:     usuario "jefa"     / clave "jefa123"\n');
  process.exit(0);
}
