import { ESTADO_COLOR } from './ui.js';

const PALETTE = ['#0b3d5c', '#0e7c86', '#c98a1b', '#7a4fa3', '#4a515e', '#c0392b'];
const GRID = 'rgba(20,28,45,.08)';

export function radarElementos(canvas, elementos, series) {
  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels: elementos.map((e) => e.codigo),
      datasets: series.map((s, i) => ({
        label: s.label,
        data: elementos.map((e) => {
          const m = s.byCodigo[e.codigo];
          return m && m.logro != null ? +(m.logro * 100).toFixed(1) : null;
        }),
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length] + '22',
        pointBackgroundColor: PALETTE[i % PALETTE.length],
        borderWidth: 2,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, backdropColor: 'transparent' }, grid: { color: GRID }, angleLines: { color: GRID } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

export function barElementos(canvas, elementos, series) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: elementos.map((e) => `${e.codigo} · ${e.nombre}`),
      datasets: series.map((s, i) => ({
        label: s.label,
        data: elementos.map((e) => {
          const m = s.byCodigo[e.codigo];
          return m && m.logro != null ? +(m.logro * 100).toFixed(1) : null;
        }),
        backgroundColor: PALETTE[i % PALETTE.length],
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      scales: { x: { min: 0, max: 100, grid: { color: GRID }, title: { display: true, text: '% de logro' } }, y: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

export function barTotales(canvas, labels, valores, estados) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% de cumplimiento',
        data: valores,
        backgroundColor: estados ? estados.map((e) => ESTADO_COLOR[e] || '#0b3d5c') : '#0b3d5c',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100, grid: { color: GRID }, title: { display: true, text: '%' } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false } },
    },
  });
}

export function doughnutAvance(canvas, valorados, pendientes) {
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Valorados', 'Pendientes'],
      datasets: [{ data: [valorados, pendientes], backgroundColor: ['#0e7c86', '#e2e5ea'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } },
  });
}
