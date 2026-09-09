import { api, session } from '../api.js';
import { renderShell } from '../app.js';
import { h, pct, estadoBadge, estadoAuditBadge, toast, spinner, confirmModal } from '../ui.js';
import { barTotales } from '../charts.js';

export async function renderDashboard() {
  const u = session.user;
  renderShell('/', spinner());

  const [companies, audits, users] = await Promise.all([
    api.companies(),
    api.audits(),
    u.rol === 'jefa' ? api.users() : Promise.resolve([]),
  ]);

  const state = { company_id: '', auditor_id: '', estado: '', se: '', desde: '', hasta: '', rows: audits };
  const selected = new Set();

  const head = h('div', { class: 'page-head' },
    h('div', {},
      h('h1', {}, u.rol === 'jefa' ? 'Panel de coordinación de auditorías' : 'Mis auditorías'),
      h('div', { class: 'sub' }, u.rol === 'jefa'
        ? 'Todas las auditorías del equipo. Filtre, seleccione y compare.'
        : 'Auditorías creadas por usted.')),
    u.rol === 'auditor'
      ? h('a', { class: 'btn primary', href: '#/auditoria/nueva' }, '+ Nueva auditoría')
      : h('button', { class: 'btn primary', id: 'btn-compare', disabled: true, onclick: goCompare }, 'Comparar seleccionadas'));

  const kpiRow = h('div', { class: 'grid cols-4', style: 'margin-bottom:20px' });
  const chartCard = h('div', { class: 'card pad', style: 'margin-bottom:20px' },
    h('div', { class: 'card-title' }, 'Cumplimiento total por auditoría'),
    h('div', { style: 'height:260px;position:relative' }, h('canvas', { id: 'ch-tot' })));

  // Filtros
  const opt = (v, t) => h('option', { value: v }, t);
  const fCompany = h('select', { onchange: (e) => { state.company_id = e.target.value; refetch(); } },
    opt('', 'Todas las empresas'), ...companies.map((c) => opt(c.id, c.nombre)));
  const fAuditor = u.rol === 'jefa'
    ? h('select', { onchange: (e) => { state.auditor_id = e.target.value; refetch(); } },
        opt('', 'Todos los auditores'), ...users.map((x) => opt(x.id, x.nombre)))
    : null;
  const fEstado = h('select', { onchange: (e) => { state.estado = e.target.value; refetch(); } },
    opt('', 'Todos los estados'), opt('en_progreso', 'En progreso'), opt('cerrada', 'Cerrada'));
  const fSe = h('select', { onchange: (e) => { state.se = e.target.value; refetch(); } },
    opt('', 'Cualquier subelemento'));
  const fDesde = h('input', { type: 'date', onchange: (e) => { state.desde = e.target.value; refetch(); } });
  const fHasta = h('input', { type: 'date', onchange: (e) => { state.hasta = e.target.value; refetch(); } });

  const filters = h('div', { class: 'card pad', style: 'margin-bottom:16px' },
    h('div', { class: 'filters' },
      field('Empresa', fCompany),
      fAuditor ? field('Auditor', fAuditor) : null,
      field('Estado', fEstado),
      field('Elemento auditado', fSe),
      field('Desde', fDesde),
      field('Hasta', fHasta),
      h('button', { class: 'btn sm', onclick: clearFilters }, 'Limpiar')));

  const tableWrap = h('div', { class: 'table-wrap' });

  renderShell('/', h('div', {}, head, kpiRow, u.rol === 'jefa' ? chartCard : null, filters, tableWrap));

  // llenar selector de subelementos
  const est = await api.structure();
  for (const el of est.elementos)
    for (const s of el.subelementos)
      fSe.append(opt(s.se, `${el.codigo}·${s.se} — ${s.detalle}`));

  paint();

  function field(label, node) {
    return h('div', { class: 'field' }, h('label', {}, label), node);
  }
  function clearFilters() {
    Object.assign(state, { company_id: '', auditor_id: '', estado: '', se: '', desde: '', hasta: '' });
    fCompany.value = ''; fEstado.value = ''; fSe.value = ''; fDesde.value = ''; fHasta.value = '';
    if (fAuditor) fAuditor.value = '';
    refetch();
  }
  async function refetch() {
    tableWrap.innerHTML = ''; tableWrap.append(spinner());
    state.rows = await api.audits({
      company_id: state.company_id, auditor_id: state.auditor_id, estado: state.estado,
      se: state.se, desde: state.desde, hasta: state.hasta,
    });
    paint();
  }

  function paint() {
    // KPIs
    const rows = state.rows;
    const cerradas = rows.filter((r) => r.estado === 'cerrada');
    const prom = cerradas.length
      ? cerradas.reduce((a, r) => a + (r.total.logro || 0), 0) / cerradas.length : null;
    kpiRow.innerHTML = '';
    kpiRow.append(
      kpi('Auditorías', rows.length, u.rol === 'jefa' ? 'en el sistema' : 'creadas por usted'),
      kpi('Cerradas', cerradas.length, `${rows.length - cerradas.length} en progreso`),
      kpi('Cumplimiento promedio', prom == null ? '—' : pct(prom, 1), 'auditorías cerradas'),
      kpi('Empresas', new Set(rows.map((r) => r.company_id)).size, 'con auditorías'));

    // Chart (jefa)
    if (u.rol === 'jefa') {
      const c = document.getElementById('ch-tot');
      if (c) {
        if (c._chart) c._chart.destroy();
        const cc = cerradas.slice(0, 12);
        c._chart = barTotales(c,
          cc.map((r) => `${r.company_nombre.slice(0, 16)} ${r.fecha.slice(2)}`),
          cc.map((r) => +(100 * (r.total.logro || 0)).toFixed(1)),
          cc.map((r) => r.total.estado));
      }
    }

    // Tabla
    tableWrap.innerHTML = '';
    if (!rows.length) { tableWrap.append(h('div', { class: 'empty' }, 'No hay auditorías para los filtros seleccionados.')); return; }

    const isJefa = u.rol === 'jefa';
    const thead = h('tr', {},
      isJefa ? h('th', { style: 'width:34px' }, '') : null,
      h('th', {}, 'Empresa'), h('th', {}, 'Fecha'), h('th', {}, 'Auditor'),
      h('th', {}, 'Estado'), h('th', { class: 'num' }, 'Avance'),
      h('th', { class: 'num' }, '% Total'), h('th', {}, 'Nivel'), h('th', {}, ''));

    const body = rows.map((r) => {
      const cb = isJefa ? h('input', {
        type: 'checkbox',
        onchange: (e) => { e.target.checked ? selected.add(r.id) : selected.delete(r.id); updateCompareBtn(); },
      }) : null;
      if (cb && selected.has(r.id)) cb.checked = true;
      return h('tr', {},
        isJefa ? h('td', {}, cb) : null,
        h('td', {}, h('a', { href: `#/auditoria/${r.id}` }, r.company_nombre),
          h('div', { style: 'font-size:12px;color:var(--ink-3)' }, r.company_sector || '')),
        h('td', {}, r.fecha),
        h('td', {}, r.auditor_nombre),
        h('td', {}, estadoAuditBadge(r.estado)),
        h('td', { class: 'num' }, `${r.avance.subelementosValorados}/${r.avance.totalSubelementos}`),
        h('td', { class: 'num' }, pct(r.total.logro, 1)),
        h('td', {}, estadoBadge(r.total.estado)),
        h('td', { class: 'num' },
          h('a', { class: 'btn sm', href: `#/auditoria/${r.id}` }, 'Abrir'),
          (r.estado === 'en_progreso')
            ? h('button', { class: 'btn sm danger', style: 'margin-left:6px', onclick: () => del(r) }, '✕')
            : null));
    });

    tableWrap.append(h('table', {}, h('thead', {}, thead), h('tbody', {}, ...body)));
  }

  function del(r) {
    confirmModal('Eliminar auditoría',
      `¿Eliminar la auditoría de <b>${r.company_nombre}</b> (${r.fecha})? Esta acción no se puede deshacer.`,
      async () => { await api.remove(r.id); toast('Auditoría eliminada', 'ok'); refetch(); },
      'Eliminar', 'danger');
  }
  function updateCompareBtn() {
    const b = document.getElementById('btn-compare');
    if (b) { b.disabled = selected.size < 2; b.textContent = `Comparar seleccionadas (${selected.size})`; }
  }
  function goCompare() {
    if (selected.size >= 2) location.hash = '#/comparar?ids=' + [...selected].join(',');
  }

  function kpi(k, v, d) {
    return h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  }
}
