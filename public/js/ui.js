/** Helpers de UI: creación de elementos, formato, toasts, modales. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const pct = (x, dec = 1) => (x == null || Number.isNaN(x) ? '—' : (x * 100).toFixed(dec) + '%');
export const pct100 = (x, dec = 1) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(dec) + '%');
export const num = (x, dec = 1) => (x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(dec));

export const ESTADO_COLOR = {
  Mantener: '#1a7f5a', Optimizar: '#3b82a0', Mejorar: '#c98a1b',
  Implementar: '#d9722b', 'Crítico': '#c0392b', '—': '#8a8f98',
};
export const VAL_LABEL = { C: 'Cumple', PC: 'Cumple parcialmente', NC: 'No cumple', NA: 'No aplica' };

export function estadoBadge(estado) {
  return h('span', { class: 'badge estado', style: `background:${ESTADO_COLOR[estado] || '#8a8f98'}` }, estado || '—');
}
export function estadoAuditBadge(estado) {
  return h('span', { class: 'badge ' + estado }, estado === 'cerrada' ? 'Cerrada' : 'En progreso');
}
export function meter(fraction) {
  const p = Math.max(0, Math.min(1, fraction || 0));
  return h('div', { class: 'meter' },
    h('div', { class: 'bar' }, h('i', { style: `width:${p * 100}%` })),
    h('span', { class: 'pct' }, pct(fraction, 0)));
}

export function toast(msg, kind = '') {
  const t = h('div', { class: 'toast ' + kind }, msg);
  document.getElementById('toast-stack').append(t);
  setTimeout(() => t.remove(), 3600);
}

export function modal({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  const close = () => (root.innerHTML = '');
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal' },
      h('h3', {}, title),
      typeof body === 'string' ? h('div', { html: body }) : body,
      h('div', { class: 'btn-row' },
        ...(actions || [{ label: 'Cerrar', fn: close }]).map((a) =>
          h('button', { class: 'btn ' + (a.class || ''), onclick: () => a.fn(close) }, a.label)))));
  root.innerHTML = '';
  root.append(bg);
  return close;
}

export function confirmModal(title, message, onYes, yesLabel = 'Confirmar', yesClass = 'primary') {
  modal({
    title, body: `<p>${message}</p>`,
    actions: [
      { label: 'Cancelar', fn: (c) => c() },
      { label: yesLabel, class: yesClass, fn: (c) => { c(); onYes(); } },
    ],
  });
}

export function spinner() { return h('div', { class: 'spinner' }); }

/** Logotipo YPF (letras blancas, fondo transparente). variant: 'box' | 'lg' | 'plain'. */
export function ypfLogo(variant = 'box') {
  const cls = 'ypf-mark' + (variant === 'lg' ? ' lg' : variant === 'plain' ? ' plain' : '');
  return h('span', { class: cls },
    h('img', { src: '/assets/ypf-logo-white.png', alt: 'YPF', width: 100, height: 40 }));
}

export function mount(node) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.append(node);
}
