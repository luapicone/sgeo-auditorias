import { api } from '../api.js';
import { renderShell } from '../app.js';
import { h, pct, num, spinner, toast, estadoBadge } from '../ui.js';
import { radarElementos, barElementos, barTotales } from '../charts.js';
import { pdfComparativo } from '../pdf.js';

export async function renderComparar() {
  renderShell('/comparar', spinner());
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  let ids = (q.get('ids') || '').split(',').map(Number).filter(Boolean);

  const all = await api.audits();
  const selected = new Set(ids);

  const picker = h('div', { class: 'card pad', style: 'margin-bottom:18px' },
    h('div', { class: 'card-title' }, 'Seleccionar auditorías a comparar (2 a 6)'),
    h('div', { class: 'table-wrap', style: 'border:0;max-height:280px;overflow:auto' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Empresa'), h('th', {}, 'Fecha'), h('th', {}, 'Auditor'), h('th', {}, 'Estado'), h('th', { class: 'num' }, '% Total'))),
        h('tbody', {}, ...all.map((a) => {
          const cb = h('input', { type: 'checkbox', ...(selected.has(a.id) ? { checked: true } : {}), onchange: (e) => { e.target.checked ? selected.add(a.id) : selected.delete(a.id); } });
          return h('tr', {}, h('td', {}, cb), h('td', {}, a.company_nombre), h('td', {}, a.fecha), h('td', {}, a.auditor_nombre),
            h('td', {}, a.estado === 'cerrada' ? 'Cerrada' : 'En progreso'), h('td', { class: 'num' }, pct(a.total.logro, 1)));
        })))),
    h('div', { class: 'btn-row', style: 'margin-top:12px' },
      h('button', { class: 'btn primary', onclick: () => run([...selected]) }, 'Comparar')));

  const out = h('div', {});
  renderShell('/comparar', h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Comparación de auditorías'),
      h('div', { class: 'sub' }, 'Compare empresas o auditorías por elemento, fase y resultado total.'))),
    picker, out));

  if (ids.length >= 2) run(ids);

  async function run(list) {
    if (list.length < 2) return toast('Seleccione al menos 2 auditorías', 'err');
    if (list.length > 6) return toast('Máximo 6 auditorías', 'err');
    location.hash = '#/comparar?ids=' + list.join(',');
    out.innerHTML = ''; out.append(spinner());
    let data;
    try { data = await api.compare(list); }
    catch (ex) { out.innerHTML = ''; out.append(h('div', { class: 'empty' }, ex.message)); return; }
    paint(data);
  }

  function paint(data) {
    const A = data.auditorias;
    out.innerHTML = '';

    out.append(h('div', { class: 'btn-row', style: 'justify-content:flex-end;margin-bottom:14px' },
      h('button', { class: 'btn', onclick: () => pdfComparativo(data) }, '⤓ PDF comparativo')));

    // Resumen
    out.append(h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, 'Resumen')),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Empresa'), h('th', {}, 'Fecha'), h('th', {}, 'Auditor'), h('th', {}, 'Estado'),
          h('th', { class: 'num' }, '% Total'), h('th', {}, 'Nivel'), h('th', { class: 'num' }, 'Avance'))),
        h('tbody', {}, ...A.map((a) => h('tr', {},
          h('td', {}, a.empresa), h('td', {}, a.fecha), h('td', {}, a.auditor),
          h('td', {}, a.estado === 'cerrada' ? 'Cerrada' : 'En progreso'),
          h('td', { class: 'num' }, pct(a.total.logro, 1)), h('td', {}, estadoBadge(a.total.estado)),
          h('td', { class: 'num' }, `${num(a.avance.porcentaje, 0)}%`)))))));

    // Charts
    out.append(h('div', { class: 'two-col', style: 'margin-bottom:18px' },
      h('div', { class: 'card pad' }, h('div', { class: 'card-title' }, 'Cumplimiento total'),
        h('div', { style: 'height:280px;position:relative' }, h('canvas', { id: 'c-tot' }))),
      h('div', { class: 'card pad' }, h('div', { class: 'card-title' }, 'Perfil por elemento'),
        h('div', { style: 'height:280px;position:relative' }, h('canvas', { id: 'c-radar' })))));

    out.append(h('div', { class: 'card pad', style: 'margin-bottom:18px' },
      h('div', { class: 'card-title' }, '% de logro por elemento'),
      h('div', { style: 'height:360px;position:relative' }, h('canvas', { id: 'c-bar' }))));

    // Tabla comparativa por elemento (% logro)
    out.append(comparativeTable('% de logro por elemento', data, (m) => m ? pct(m.logro, 1) : '—'));
    // Tabla comparativa estado
    out.append(comparativeTable('Estado por elemento', data, (m) => m ? estadoBadge(m.estado) : '—', true));
    // Fases
    out.append(h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, '% de logro por fase PDCA')),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Fase'), ...A.map((a) => h('th', { class: 'num' }, a.empresa)))),
        h('tbody', {}, ...['PLANIFICAR', 'HACER', 'VERIFICAR', 'ACTUAR'].map((f) => h('tr', {},
          h('td', {}, f),
          ...A.map((a) => { const x = a.fases.find((z) => z.pdca === f); return h('td', { class: 'num' }, x ? pct(x.logro, 1) : '—'); })))))));

    setTimeout(() => {
      const series = A.map((a) => ({ label: a.empresa, byCodigo: Object.fromEntries(a.elementos.map((e) => [e.codigo, e])) }));
      barTotales(document.getElementById('c-tot'), A.map((a) => a.empresa), A.map((a) => +(100 * (a.total.logro || 0)).toFixed(1)), A.map((a) => a.total.estado));
      radarElementos(document.getElementById('c-radar'), data.elementos, series);
      barElementos(document.getElementById('c-bar'), data.elementos, series);
    }, 0);
  }

  function comparativeTable(title, data, cell, isNode) {
    const A = data.auditorias;
    return h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, title)),
      h('div', { class: 'table-wrap', style: 'border:0' },
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Cód.'), h('th', {}, 'Elemento'), ...A.map((a) => h('th', { class: 'num' }, `${a.empresa} · ${a.fecha.slice(0, 7)}`)))),
          h('tbody', {}, ...data.elementos.map((el) => h('tr', {},
            h('td', {}, el.codigo), h('td', {}, el.nombre),
            ...A.map((a) => {
              const m = a.elementos.find((x) => x.codigo === el.codigo);
              const c = cell(m);
              return h('td', { class: 'num' }, isNode ? c : c);
            })))))));
  }
}
