import { api, session } from '../api.js';
import { renderShell, getEstructura } from '../app.js';
import { h, pct, num, toast, spinner, estadoBadge, estadoAuditBadge, meter, confirmModal, modal, VAL_LABEL } from '../ui.js';
import { radarElementos, barElementos, doughnutAvance } from '../charts.js';
import { pdfAuditoria } from '../pdf.js';

const VALS = ['C', 'PC', 'NC', 'NA'];

export async function renderAuditoria(id) {
  renderShell('/', spinner());
  const est = await getEstructura();
  let audit;
  try { audit = await api.audit(id); }
  catch (ex) { renderShell('/', h('div', { class: 'empty' }, ex.message)); return; }

  const editable = audit.estado !== 'cerrada' &&
    (session.user.rol === 'auditor' ? audit.auditor_id === session.user.id : false);
  const canManage = session.user.rol === 'auditor' && audit.auditor_id === session.user.id;

  let tab = 'carga';
  const pending = new Map(); // se -> {valoracion, observacion}
  let saveTimer = null;

  const container = h('div', {});
  renderShell('/', container);
  paint();

  function itemMap() {
    const m = new Map();
    for (const it of audit.items) m.set(it.se, it);
    return m;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 700);
  }
  async function flush() {
    if (!pending.size) return;
    const items = [...pending.entries()].map(([se, v]) => ({ se, ...v }));
    pending.clear();
    try {
      audit = await api.setItems(id, items);
      updateHeaderStats();
      if (tab === 'resultados') paint();
      flashSaved();
    } catch (ex) { toast(ex.message, 'err'); }
  }
  function flashSaved() {
    const s = document.getElementById('save-ind');
    if (s) { s.textContent = 'Guardado ✓'; s.style.opacity = '1'; setTimeout(() => (s.style.opacity = '.4'), 1200); }
  }

  function setVal(se, valoracion) {
    const cur = itemMap().get(se) || {};
    const it = audit.items.find((x) => x.se === se);
    if (it) it.valoracion = valoracion; else audit.items.push({ se, valoracion, observacion: null });
    pending.set(se, { valoracion, observacion: (it && it.observacion) ?? cur.observacion ?? null });
    scheduleSave();
  }
  function setObs(se, observacion) {
    const it = audit.items.find((x) => x.se === se);
    if (it) it.observacion = observacion; else audit.items.push({ se, valoracion: null, observacion });
    pending.set(se, { valoracion: it ? it.valoracion : null, observacion });
    scheduleSave();
  }

  /* ---------- render ---------- */
  function paint() {
    container.innerHTML = '';
    container.append(headerNode());
    container.append(tabsNode());
    container.append(tab === 'carga' ? cargaNode() : resultadosNode());
  }

  function headerNode() {
    const r = audit.resultado;
    return h('div', {},
      h('div', { class: 'breadcrumb' }, h('a', { href: '#/' }, '← Volver al panel')),
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', {}, audit.company_nombre),
          h('div', { class: 'sub' },
            `${audit.company_sector || ''} · Auditoría del ${audit.fecha} · ${audit.auditor_nombre} `,
            estadoAuditBadge(audit.estado))),
        h('div', { class: 'btn-row' },
          h('span', { id: 'save-ind', style: 'align-self:center;font-size:12px;color:var(--ink-3);opacity:.4' },
            editable ? 'Autoguardado' : ''),
          h('button', { class: 'btn', onclick: async () => { await flush(); pdfAuditoria(audit); } }, '⤓ PDF'),
          canManage && audit.estado === 'cerrada'
            ? h('button', { class: 'btn', onclick: reopen }, 'Reabrir')
            : null,
          canManage && audit.estado !== 'cerrada'
            ? h('button', { class: 'btn primary', onclick: cerrar }, 'Cerrar auditoría')
            : null)),
      h('div', { class: 'grid cols-4', style: 'margin-bottom:18px' },
        stat('Cumplimiento total', pct(r.total.logro, 1), `${num(r.total.puntajeSobre100)} / ${r.total.pesoIncluido} puntos`),
        stat('Nivel alcanzado', '', '', estadoBadge(r.total.estado)),
        stat('Avance de carga', `${r.avance.subelementosValorados}/${r.avance.totalSubelementos}`, `${num(r.avance.porcentaje, 0)}% valorado`),
        stat('Elementos en alcance', r.elementos.length, `de ${est.elementos.length}`)));
  }

  function updateHeaderStats() {
    // repaint header only
    const first = container.firstChild;
    const nh = headerNode();
    container.replaceChild(nh, first);
  }

  function tabsNode() {
    return h('div', { class: 'tabs' },
      h('button', { class: tab === 'carga' ? 'on' : '', onclick: () => { tab = 'carga'; paint(); } }, 'Carga de valoraciones'),
      h('button', { class: tab === 'resultados' ? 'on' : '', onclick: () => { tab = 'resultados'; paint(); } }, 'Resultados y avance'));
  }

  /* ---------- CARGA ---------- */
  function cargaNode() {
    const wrap = h('div', {});
    if (canManage && audit.estado !== 'cerrada')
      wrap.append(h('div', { class: 'btn-row', style: 'margin-bottom:14px' },
        h('button', { class: 'btn sm', onclick: editarAlcance }, 'Editar alcance')));

    if (!editable)
      wrap.append(h('div', { class: 'card pad', style: 'margin-bottom:14px;color:var(--ink-3)' },
        audit.estado === 'cerrada' ? 'Auditoría cerrada: solo lectura.' : 'Solo el auditor responsable puede cargar valoraciones.'));

    const scopeSet = new Set(audit.items.map((i) => i.se));
    const im = itemMap();

    for (const el of est.elementos) {
      const subs = el.subelementos.filter((s) => scopeSet.has(s.se));
      if (!subs.length) continue;
      const done = subs.filter((s) => im.get(s.se) && im.get(s.se).valoracion).length;
      const body = h('div', { class: 'elem-body' });
      const head = h('div', { class: 'elem-head' },
        h('span', { class: 'code' }, el.codigo),
        h('span', { class: 'name' }, el.nombre, h('div', { class: 'pdca-tag' }, el.pdca)),
        h('span', { class: 'mini' }, `${done}/${subs.length} · peso ${el.puntajeCapitulo}`),
        h('span', { style: 'width:120px' }, meter(subs.length ? done / subs.length : 0)));
      head.addEventListener('click', () => body.hidden = !body.hidden);
      body.hidden = done === subs.length && audit.estado !== 'cerrada' && done > 0 ? false : false;

      for (const s of subs) {
        const it = im.get(s.se) || {};
        const group = h('div', { class: 'val-group' },
          ...VALS.map((v) => h('button', {
            dataset: { v }, class: it.valoracion === v ? 'on' : '',
            onclick: (e) => {
              if (!editable) return;
              [...group.children].forEach((b) => b.classList.remove('on'));
              e.target.classList.add('on');
              setVal(s.se, v);
            },
          }, v)));
        const obs = h('textarea', {
          placeholder: 'Observación / evidencia (opcional)', ...(editable ? {} : { disabled: true }),
          oninput: (e) => setObs(s.se, e.target.value),
        }, it.observacion || '');
        body.append(h('div', { class: 'sub-row' },
          h('span', { class: 'se' }, s.se),
          h('div', { class: 'det' },
            h('div', {}, s.detalle),
            h('div', { class: 'refs' }, refText(s)),
            h('div', { class: 'obs' }, obs)),
          h('div', {}, group)));
      }
      wrap.append(h('div', { class: 'elem' }, head, body));
    }
    return wrap;
  }

  function refText(s) {
    const parts = [];
    if (s.subElementoYPF20) parts.push('YPF 2.0: ' + s.subElementoYPF20);
    if (s.iso9001) parts.push('ISO 9001: ' + s.iso9001);
    if (s.iso14001) parts.push('ISO 14001: ' + s.iso14001);
    if (s.iso45001) parts.push('ISO 45001: ' + s.iso45001);
    if (s.ccps) parts.push('CCPS: ' + s.ccps);
    return parts.join('   ·   ');
  }

  function editarAlcance() {
    const sel = new Set(audit.items.map((i) => i.se));
    const box = h('div', { style: 'max-height:50vh;overflow:auto' });
    for (const el of est.elementos) {
      box.append(h('div', { style: 'font-weight:600;margin:10px 0 4px' }, `${el.codigo} · ${el.nombre}`));
      const chips = h('div', { class: 'chips' });
      for (const s of el.subelementos) {
        const c = h('div', { class: 'chip' + (sel.has(s.se) ? ' on' : ''), onclick: () => { sel.has(s.se) ? sel.delete(s.se) : sel.add(s.se); c.classList.toggle('on'); } }, `${s.se}. ${s.detalle}`);
        chips.append(c);
      }
      box.append(chips);
    }
    modal({
      title: 'Editar alcance',
      body: h('div', {}, h('p', { class: 'hint' }, 'Quitar un subelemento elimina su valoración cargada.'), box),
      actions: [
        { label: 'Cancelar', fn: (c) => c() },
        { label: 'Guardar', class: 'primary', fn: async (c) => {
          try { audit = await api.setScope(id, [...sel]); toast('Alcance actualizado', 'ok'); c(); paint(); }
          catch (ex) { toast(ex.message, 'err'); }
        } },
      ],
    });
  }

  async function cerrar() {
    await flush();
    const pend = audit.resultado.avance.totalSubelementos - audit.resultado.avance.subelementosValorados;
    const doClose = async (forzar) => {
      try { audit = await api.close(id, forzar); toast('Auditoría cerrada', 'ok'); tab = 'resultados'; paint(); }
      catch (ex) { toast(ex.message, 'err'); }
    };
    if (pend > 0) {
      confirmModal('Cerrar auditoría',
        `Quedan <b>${pend}</b> subelementos sin valorar. Si cierra ahora, contarán como incumplidos en el cálculo. ¿Continuar?`,
        () => doClose(true), 'Cerrar igualmente', 'danger');
    } else {
      confirmModal('Cerrar auditoría', 'Una vez cerrada no podrá modificar las valoraciones (podrá reabrirla). ¿Confirmar cierre?', () => doClose(false));
    }
  }
  function reopen() {
    confirmModal('Reabrir auditoría', 'La auditoría volverá a estado "En progreso".', async () => {
      audit = await api.reopen(id); toast('Auditoría reabierta', 'ok'); paint();
    });
  }

  /* ---------- RESULTADOS ---------- */
  function resultadosNode() {
    const r = audit.resultado;
    const wrap = h('div', {});

    wrap.append(h('div', { class: 'grid cols-3', style: 'margin-bottom:18px' },
      h('div', { class: 'card pad' },
        h('div', { class: 'card-title' }, 'Resultado total de auditoría'),
        h('div', { style: 'font-size:34px;font-weight:700' }, pct(r.total.logro, 1)),
        h('div', { style: 'margin:6px 0' }, estadoBadge(r.total.estado)),
        h('div', { class: 'hint' }, `${num(r.total.puntajeSobre100)} de ${r.total.pesoIncluido} puntos ponderados`)),
      h('div', { class: 'card pad' },
        h('div', { class: 'card-title' }, 'Avance de la auditoría'),
        h('div', { style: 'height:150px;position:relative' }, h('canvas', { id: 'ch-av' }))),
      h('div', { class: 'card pad' },
        h('div', { class: 'card-title' }, 'Perfil por elemento'),
        h('div', { style: 'height:170px;position:relative' }, h('canvas', { id: 'ch-radar' })))));

    wrap.append(h('div', { class: 'card pad', style: 'margin-bottom:18px' },
      h('div', { class: 'card-title' }, '% de logro por elemento'),
      h('div', { style: 'height:320px;position:relative' }, h('canvas', { id: 'ch-bar' }))));

    // tabla por fase PDCA
    wrap.append(h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, 'Resultado por fase (capítulo / agrupador PDCA)')),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Fase'), h('th', { class: 'num' }, 'Peso'), h('th', { class: 'num' }, 'Puntaje'), h('th', { class: 'num' }, '% Logro'), h('th', {}, 'Estado'))),
        h('tbody', {}, ...r.fases.map((f) => h('tr', {},
          h('td', {}, f.pdca), h('td', { class: 'num' }, f.peso), h('td', { class: 'num' }, num(f.puntaje)),
          h('td', { class: 'num' }, pct(f.logro, 1)), h('td', {}, estadoBadge(f.estado))))))));

    // tabla por elemento
    wrap.append(h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, 'Resultado por elemento')),
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Cód.'), h('th', {}, 'Elemento'), h('th', {}, 'Fase'), h('th', { class: 'num' }, 'Peso (L)'),
          h('th', { class: 'num' }, '% Logro (T)'), h('th', { class: 'num' }, 'Puntaje (V=L·T)'), h('th', {}, 'Estado'), h('th', { class: 'num' }, 'Valorados'))),
        h('tbody', {}, ...r.elementos.map((e) => h('tr', {},
          h('td', {}, e.codigo), h('td', {}, e.nombre), h('td', {}, e.pdca),
          h('td', { class: 'num' }, e.pesoCapitulo), h('td', { class: 'num' }, pct(e.logro, 1)),
          h('td', { class: 'num' }, num(e.puntajeCapitulo)), h('td', {}, estadoBadge(e.estado)),
          h('td', { class: 'num' }, `${e.subelementosValorados}/${e.totalSubelementos}`)))))));

    // detalle por subelemento
    const detRows = [];
    for (const e of r.elementos)
      for (const s of e.subelementos)
        detRows.push(h('tr', {},
          h('td', {}, e.codigo), h('td', { class: 'num' }, s.se), h('td', {}, s.detalle),
          h('td', {}, s.valoracion ? VAL_LABEL[s.valoracion] : h('span', { class: 'badge soft' }, 'Pendiente')),
          h('td', { class: 'num' }, s.evaluacionFinal != null ? pct(s.evaluacionFinal, 0) : '—')));
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'pad', style: 'padding-bottom:0' }, h('div', { class: 'card-title' }, 'Detalle por subelemento')),
      h('div', { class: 'table-wrap', style: 'border:0' },
        h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Elem.'), h('th', { class: 'num' }, 'SE'), h('th', {}, 'Subelemento / Requisito'), h('th', {}, 'Valoración'), h('th', { class: 'num' }, 'Eval. final (S)'))),
          h('tbody', {}, ...detRows)))));

    setTimeout(() => {
      const series = [{ label: audit.company_nombre, byCodigo: Object.fromEntries(r.elementos.map((e) => [e.codigo, e])) }];
      const av = document.getElementById('ch-av');
      if (av) doughnutAvance(av, r.avance.subelementosValorados, r.avance.totalSubelementos - r.avance.subelementosValorados);
      const rd = document.getElementById('ch-radar');
      if (rd) radarElementos(rd, est.elementos, series);
      const br = document.getElementById('ch-bar');
      if (br) barElementos(br, r.elementos, series);
    }, 0);

    return wrap;
  }

  function stat(k, v, d, extra) {
    return h('div', { class: 'stat' }, h('div', { class: 'k' }, k),
      v ? h('div', { class: 'v' }, v) : null, extra || null, d ? h('div', { class: 'd' }, d) : null);
  }
}
