import { ESTADO_COLOR, VAL_LABEL } from './ui.js';

const BRAND = [10, 61, 145];
const fmtPct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

function header(doc, titulo, subtitulo) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 26, 'F');
  // Sello YPF sobre recuadro blanco
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(12, 6, 20, 14, 1.5, 1.5, 'F');
  doc.setTextColor(...BRAND);
  doc.setFont('times', 'bold'); doc.setFontSize(14);
  doc.text('YPF', 22, 16, { align: 'center' });
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('SGEO · Sistema de Gestión de Excelencia Operacional', 37, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(titulo + (subtitulo ? '  —  ' + subtitulo : ''), 37, 19);
  doc.setTextColor(30);
}

function footer(doc) {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Generado ${new Date().toLocaleString('es-AR')}`, 14, doc.internal.pageSize.getHeight() - 8);
    doc.text(`Página ${i} / ${n}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
}

/** Resumen ejecutivo de una auditoría individual. */
export function pdfAuditoria(audit) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const r = audit.resultado;
  header(doc, 'Resumen ejecutivo de auditoría', audit.company_nombre);

  doc.autoTable({
    startY: 32,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ['Empresa auditada', audit.company_nombre + (audit.company_sector ? ` (${audit.company_sector})` : '')],
      ['Ubicación', audit.company_ubicacion || '—'],
      ['Fecha de auditoría', audit.fecha],
      ['Auditor responsable', audit.auditor_nombre],
      ['Estado', audit.estado === 'cerrada' ? 'Cerrada' : 'En progreso'],
      ['Alcance', audit.alcance_texto || 'Auditoría integral SGEO'],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 46 } },
  });

  let y = doc.lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Resultado global', 14, y); y += 2;

  const est = r.total.estado;
  doc.autoTable({
    startY: y + 2,
    head: [['% de cumplimiento total', 'Puntaje (sobre peso incluido)', 'Estado', 'Avance']],
    body: [[
      fmtPct(r.total.logro),
      `${r.total.puntajeSobre100.toFixed(1)} / ${r.total.pesoIncluido}`,
      est,
      `${r.avance.subelementosValorados}/${r.avance.totalSubelementos} (${r.avance.porcentaje.toFixed(0)}%)`,
    ]],
    styles: { fontSize: 10, halign: 'center' },
    headStyles: { fillColor: BRAND },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) {
        const c = ESTADO_COLOR[est] || '#333';
        d.cell.styles.textColor = hexToRgb(c); d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Resultado por elemento', 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [['Cód.', 'Elemento', 'Fase PDCA', 'Peso', '% Logro', 'Puntaje', 'Estado', 'Valorados']],
    body: r.elementos.map((e) => [
      e.codigo, e.nombre, e.pdca, e.pesoElemento, fmtPct(e.logro),
      e.puntajeElemento.toFixed(1), e.estado, `${e.subelementosValorados}/${e.totalSubelementos}`,
    ]),
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: BRAND },
    columnStyles: { 1: { cellWidth: 58 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 6) {
        d.cell.styles.textColor = hexToRgb(ESTADO_COLOR[d.cell.raw] || '#333');
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Detalle por subelemento', 14, y);
  const detBody = [];
  for (const e of r.elementos) {
    for (const s of e.subelementos) {
      detBody.push([e.codigo, s.se, s.detalle, s.valoracion ? VAL_LABEL[s.valoracion] : 'Pendiente',
        s.evaluacionFinal != null ? (s.evaluacionFinal * 100).toFixed(0) + '%' : '—']);
    }
  }
  doc.autoTable({
    startY: y + 3,
    head: [['Elem.', 'SE', 'Subelemento / Requisito', 'Valoración', 'Eval. final']],
    body: detBody,
    styles: { fontSize: 8 },
    headStyles: { fillColor: BRAND },
    columnStyles: { 2: { cellWidth: 92 } },
  });

  footer(doc);
  doc.save(`Auditoria_${slug(audit.company_nombre)}_${audit.fecha}.pdf`);
}

/** Reporte comparativo entre varias auditorías. */
export function pdfComparativo(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  header(doc, 'Reporte comparativo de auditorías', `${data.auditorias.length} auditorías`);

  doc.autoTable({
    startY: 32,
    head: [['Empresa', 'Fecha', 'Auditor', 'Estado', '% Total', 'Nivel', 'Avance']],
    body: data.auditorias.map((a) => [
      a.empresa, a.fecha, a.auditor, a.estado === 'cerrada' ? 'Cerrada' : 'En progreso',
      fmtPct(a.total.logro), a.total.estado, `${a.avance.porcentaje.toFixed(0)}%`,
    ]),
    styles: { fontSize: 9 }, headStyles: { fillColor: BRAND },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 5) {
        d.cell.styles.textColor = hexToRgb(ESTADO_COLOR[d.cell.raw] || '#333');
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  let y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('% de logro por elemento', 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [['Cód.', 'Elemento', ...data.auditorias.map((a) => a.empresa)]],
    body: data.elementos.map((el) => [
      el.codigo, el.nombre,
      ...data.auditorias.map((a) => {
        const m = a.elementos.find((x) => x.codigo === el.codigo);
        return m && m.logro != null ? fmtPct(m.logro) : '—';
      }),
    ]),
    styles: { fontSize: 8.5 }, headStyles: { fillColor: BRAND },
    columnStyles: { 1: { cellWidth: 55 } },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Estado por elemento', 14, y);
  doc.autoTable({
    startY: y + 3,
    head: [['Cód.', 'Elemento', ...data.auditorias.map((a) => a.empresa)]],
    body: data.elementos.map((el) => [
      el.codigo, el.nombre,
      ...data.auditorias.map((a) => {
        const m = a.elementos.find((x) => x.codigo === el.codigo);
        return m ? m.estado : '—';
      }),
    ]),
    styles: { fontSize: 8.5 }, headStyles: { fillColor: BRAND },
    columnStyles: { 1: { cellWidth: 55 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index >= 2) {
        d.cell.styles.textColor = hexToRgb(ESTADO_COLOR[d.cell.raw] || '#333');
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });

  footer(doc);
  doc.save(`Comparativo_auditorias_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function slug(s) { return String(s).normalize('NFD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, ''); }
