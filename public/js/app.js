import { api, session } from './api.js';
import { h, mount, spinner, ypfLogo } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderNuevaAuditoria } from './views/nueva.js';
import { renderAuditoria } from './views/audit.js';
import { renderComparar } from './views/comparar.js';

/** Estructura SGEO cacheada en memoria (se pide una vez por sesión). */
export let ESTRUCTURA = null;
export async function getEstructura() {
  if (!ESTRUCTURA) ESTRUCTURA = await api.structure();
  return ESTRUCTURA;
}

function shell(active, content) {
  const u = session.user;
  const link = (hash, label) =>
    h('a', { class: 'nav-link' + (active === hash ? ' active' : ''), href: '#' + hash }, label);

  const nav = [link('/', 'Panel principal')];
  if (u.rol === 'auditor') nav.push(link('/auditoria/nueva', 'Nueva auditoría'));
  if (u.rol === 'jefa') nav.push(link('/comparar', 'Comparar auditorías'));

  return h('div', { class: 'app-shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'logo' }, ypfLogo('box'),
        h('span', { class: 'brandline' }, 'SGEO', h('small', {}, 'Auditorías'))),
      ...nav,
      h('div', { class: 'spacer' }),
      h('div', { class: 'user-box' },
        h('b', {}, u.nombre),
        u.rol === 'jefa' ? 'Jefa / Coordinadora' : 'Auditor',
        h('button', {
          class: 'btn-logout',
          onclick: () => { session.clear(); location.hash = '#/login'; },
        }, 'Cerrar sesión'))),
    h('main', { class: 'main' }, content));
}

export function renderShell(active, node) { mount(shell(active, node)); }

const routes = [
  { re: /^\/$/, fn: () => renderDashboard() },
  { re: /^\/auditoria\/nueva$/, fn: () => renderNuevaAuditoria() },
  { re: /^\/auditoria\/(\d+)$/, fn: (m) => renderAuditoria(Number(m[1])) },
  { re: /^\/comparar$/, fn: () => renderComparar() },
];

async function router() {
  const raw = location.hash.replace(/^#/, '') || '/';

  if (raw === '/login') { renderLogin(); return; }
  if (!session.token) { location.hash = '#/login'; return; }

  mount(h('div', { class: 'app-shell' }, h('div', {}), h('main', { class: 'main' }, spinner())));

  // Validar sesión y precargar estructura
  try {
    await api.me();
    await getEstructura();
  } catch {
    session.clear(); location.hash = '#/login'; return;
  }

  const path = raw.split('?')[0];
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { r.fn(m); return; }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
