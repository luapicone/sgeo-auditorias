import { api, session } from '../api.js';
import { renderShell, getEstructura } from '../app.js';
import { h, toast, spinner, modal } from '../ui.js';

export async function renderNuevaAuditoria() {
  renderShell('/auditoria/nueva', spinner());
  const [est, companies] = await Promise.all([getEstructura(), api.companies()]);

  let companyList = companies;
  const scope = new Set(est.elementos.flatMap((e) => e.subelementos.map((s) => s.se))); // todos por defecto

  const selCompany = h('select', { required: true },
    h('option', { value: '' }, '— Seleccionar —'),
    ...companyList.map((c) => h('option', { value: c.id }, c.nombre)));
  const inFecha = h('input', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
  const inAuditor = h('input', { value: session.user.nombre, required: true });
  const inAlcance = h('textarea', { rows: 3, placeholder: 'Ej.: Auditoría integral del SGEO en planta X, turnos A y B.' },
    'Auditoría integral del Sistema de Gestión de Excelencia Operacional (SGEO).');

  const scopeBox = h('div', {});
  renderScope();

  const form = h('form', { class: 'card pad', style: 'max-width:820px', onsubmit: submit },
    h('div', { class: 'two-col' },
      h('div', { class: 'field' },
        h('label', {}, 'Empresa auditada *'),
        h('div', { style: 'display:flex;gap:8px' }, selCompany,
          h('button', { type: 'button', class: 'btn sm', onclick: addCompany }, '+ Empresa'))),
      h('div', { class: 'field' }, h('label', {}, 'Fecha *'), inFecha)),
    h('div', { class: 'two-col' },
      h('div', { class: 'field' }, h('label', {}, 'Auditor responsable *'), inAuditor),
      h('div', {})),
    h('div', { class: 'field' }, h('label', {}, 'Alcance de la auditoría'), inAlcance),
    h('div', { class: 'field' },
      h('label', {}, 'Elementos y subelementos a auditar'),
      h('div', { class: 'hint' }, 'Desmarque lo que quede fuera de alcance. Los ítems fuera de alcance se excluyen del cálculo.'),
      scopeBox),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'submit' }, 'Crear auditoría'),
      h('a', { class: 'btn ghost', href: '#/' }, 'Cancelar')));

  renderShell('/auditoria/nueva', h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Nueva auditoría'),
      h('div', { class: 'sub' }, 'Complete los datos e indique el alcance.'))),
    form));

  function renderScope() {
    scopeBox.innerHTML = '';
    for (const el of est.elementos) {
      const inEl = el.subelementos.map((s) => s.se);
      const allOn = inEl.every((se) => scope.has(se));
      const head = h('div', { class: 'elem-head' },
        h('input', {
          type: 'checkbox', ...(allOn ? { checked: true } : {}),
          onchange: (e) => { inEl.forEach((se) => (e.target.checked ? scope.add(se) : scope.delete(se))); renderScope(); },
        }),
        h('span', { class: 'code' }, el.codigo),
        h('span', { class: 'name' }, el.nombre),
        h('span', { class: 'mini' }, `${inEl.filter((se) => scope.has(se)).length}/${inEl.length}`));
      const chips = h('div', { class: 'chips', style: 'padding:10px 16px' },
        ...el.subelementos.map((s) => {
          const on = scope.has(s.se);
          return h('div', {
            class: 'chip' + (on ? ' on' : ''),
            onclick: () => { on ? scope.delete(s.se) : scope.add(s.se); renderScope(); },
          }, `${s.se}. ${s.detalle}`);
        }));
      scopeBox.append(h('div', { class: 'elem' }, head, chips));
    }
  }

  function addCompany() {
    const nombre = h('input', { required: true });
    const sector = h('input', {});
    const ubic = h('input', {});
    modal({
      title: 'Nueva empresa',
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, 'Nombre *'), nombre),
        h('div', { class: 'field' }, h('label', {}, 'Sector'), sector),
        h('div', { class: 'field' }, h('label', {}, 'Ubicación'), ubic)),
      actions: [
        { label: 'Cancelar', fn: (c) => c() },
        { label: 'Crear', class: 'primary', fn: async (c) => {
          if (!nombre.value.trim()) return;
          const nc = await api.createCompany({ nombre: nombre.value, sector: sector.value, ubicacion: ubic.value });
          companyList.push(nc);
          selCompany.append(h('option', { value: nc.id }, nc.nombre));
          selCompany.value = nc.id;
          toast('Empresa creada', 'ok');
          c();
        } },
      ],
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!selCompany.value) return toast('Seleccione una empresa', 'err');
    if (scope.size === 0) return toast('Seleccione al menos un subelemento', 'err');
    try {
      const a = await api.createAudit({
        company_id: Number(selCompany.value),
        fecha: inFecha.value,
        alcance_texto: `${inAlcance.value}\n\nAuditor responsable: ${inAuditor.value}`.trim(),
        scope: [...scope],
      });
      toast('Auditoría creada', 'ok');
      location.hash = '#/auditoria/' + a.id;
    } catch (ex) {
      toast(ex.message, 'err');
    }
  }
}
