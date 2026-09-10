/**
 * scoring.js — Réplica de la lógica de cálculo de la hoja "Comparativa SGEO FINAL".
 *
 * Módulo ES sin dependencias: se usa igual en el servidor (Node) y en el navegador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EQUIVALENCIA CON LAS COLUMNAS / FÓRMULAS DEL EXCEL
 * ─────────────────────────────────────────────────────────────────────────────
 *  Columna N  "VALORACIÓN"            -> "C" | "CP" | "NC" | "NA"
 *  Columna M  "PONDERACIÓN INICIAL"   -> siempre 1 (peso del subelemento dentro del elemento)
 *  Columna S  "EVALUACIÓN FINAL"      -> S(v):
 *                 =IF(N="C",100%,IF(N="CP",30%,IF(N="NC",0%,IF(N="NA","-",""))))
 *             C=1.0 · CP=0.3 · NC=0.0 · NA/""=0 en el numerador
 *  Columna T  "% DE LOGRO DEL ELEMENTO"
 *                 =(SUM(S del elemento) / SUM(M del elemento))
 *  Columna U  "ESTADO DEL ELEMENTO"
 *                 =IF(T>=91%,"Mantener",IF(T>=81%,"Optimizar",IF(T>=61%,"Mejorar",
 *                   IF(T>=41%,"Implementar","Crítico"))))
 *  Columna L  "PUNTAJE DEL ELEMENTO"  -> peso del elemento (E1=15, E2=15, E3=15, E4=35, E5=20; suma 100)
 *  Columna V  "PUNTAJE DEL ELEMENTO"  -> =L * T
 *  Columna W  "TOTAL AUDITORÍA"       -> =(V_E1 + V_E2 + V_E3 + V_E4 + V_E5) / 100
 *
 * FASES PDCA: la columna A agrupa los subelementos en PLANIFICAR / HACER / VERIFICAR / ACTUAR.
 * El Excel no calcula un puntaje por fase; acá se agrega como vista, repartiendo el peso de
 * cada elemento en partes iguales entre sus subelementos (la suma por fase = suma por elemento).
 *
 * EXTENSIONES (no definidas en el Excel, que asume las 27 filas completas):
 *  - Alcance parcial: un subelemento NO seleccionado se excluye del numerador Y del
 *    denominador. Un subelemento seleccionado sin valorar cuenta 0 en el numerador y 1 en
 *    el denominador (idéntico a una celda N vacía en el Excel).
 *  - Total con alcance parcial: se re-normaliza por la suma de los pesos L de los elementos
 *    incluidos (con las 27 filas el divisor es 100, idéntico al Excel).
 *  - "Estado" del total y de cada fase PDCA: se reutilizan los umbrales de la columna U.
 *  - NA ("No aplica"): 0 en el numerador y 1 en el denominador (penaliza), igual que el Excel.
 */

export const ESCALA = { C: 1.0, CP: 0.3, NC: 0.0, NA: 0.0 };

export const VALORACIONES = [
  { code: 'C', label: 'Cumple' },
  { code: 'CP', label: 'Cumple parcialmente' },
  { code: 'NC', label: 'No cumple' },
  { code: 'NA', label: 'No aplica' },
];

export const FASES_PDCA = ['PLANIFICAR', 'HACER', 'VERIFICAR', 'ACTUAR'];

/** Réplica de la columna U del Excel. */
export function estadoDesdeLogro(t) {
  if (t == null || Number.isNaN(t)) return '—';
  if (t >= 0.91) return 'Mantener';
  if (t >= 0.81) return 'Optimizar';
  if (t >= 0.61) return 'Mejorar';
  if (t >= 0.41) return 'Implementar';
  return 'Crítico';
}

export const COLOR_ESTADO = {
  Mantener: '#1a7f5a',
  Optimizar: '#3b82a0',
  Mejorar: '#c98a1b',
  Implementar: '#d9722b',
  'Crítico': '#c0392b',
  '—': '#8a8f98',
};

/** S(v): réplica de la columna S. */
export function evaluacionFinal(valoracion) {
  if (!valoracion) return 0;
  return ESCALA[valoracion] ?? 0;
}

/**
 * Calcula el resultado completo de una auditoría.
 *
 * @param {object} estructura  Contenido de server/data/estructura-sgeo.json
 * @param {Array<{se:number, valoracion:string|null}>} items  Ítems EN ALCANCE.
 * @returns {object} resultado con desglose por subelemento, elemento, fase PDCA y total.
 */
export function calcularResultado(estructura, items) {
  const enAlcance = new Map(); // se -> valoracion|null
  for (const it of items) enAlcance.set(Number(it.se), it.valoracion || null);

  const elementos = [];
  const fases = new Map(); // pdca -> { logroNum, logroDen, puntaje, peso }

  for (const el of estructura.elementos) {
    const pesoEl = el.puntajeElemento;
    const pesoSub = el.subelementos.length ? pesoEl / el.subelementos.length : 0;

    const subs = [];
    let sumaS = 0;      // SUM(S) del elemento
    let denom = 0;      // SUM(M) del elemento = nº de subelementos en alcance
    let valorados = 0;

    for (const sub of el.subelementos) {
      if (!enAlcance.has(sub.se)) continue; // fuera de alcance -> se ignora
      const valoracion = enAlcance.get(sub.se);
      const s = evaluacionFinal(valoracion);
      denom += 1;                 // M = 1
      if (valoracion) { sumaS += s; valorados += 1; }
      subs.push({
        se: sub.se,
        detalle: sub.detalle,
        pdca: sub.pdca,
        valoracion,
        evaluacionFinal: valoracion ? s : null,
      });

      // aporte a la fase PDCA del subelemento
      const f = fases.get(sub.pdca) || { pdca: sub.pdca, logroNum: 0, logroDen: 0, puntaje: 0, peso: 0 };
      f.logroDen += 1;
      f.peso += pesoSub;
      if (valoracion) { f.logroNum += s; f.puntaje += pesoSub * s; }
      fases.set(sub.pdca, f);
    }

    if (subs.length === 0) continue; // elemento sin nada en alcance

    const logro = denom > 0 ? sumaS / denom : null;          // T
    const puntajeElemento = logro != null ? pesoEl * logro : 0; // V = L * T

    elementos.push({
      codigo: el.codigo,
      nombre: el.nombre,
      pdca: el.pdca,
      pesoElemento: pesoEl,                    // L
      logro,                                   // T (0..1)
      estado: estadoDesdeLogro(logro),         // U
      puntajeElemento,                         // V
      totalSubelementos: subs.length,
      subelementosValorados: valorados,
      subelementos: subs,
    });
  }

  const pesoIncluidoTotal = elementos.reduce((a, e) => a + e.pesoElemento, 0);
  const puntajeObtenidoTotal = elementos.reduce((a, e) => a + e.puntajeElemento, 0);
  const totalAuditoria = pesoIncluidoTotal > 0 ? puntajeObtenidoTotal / pesoIncluidoTotal : null;

  const totalSub = elementos.reduce((a, e) => a + e.totalSubelementos, 0);
  const totalValorados = elementos.reduce((a, e) => a + e.subelementosValorados, 0);

  const orden = estructura.fasesPDCA || FASES_PDCA;
  const fasesArr = [...fases.values()]
    .map((f) => ({
      pdca: f.pdca,
      logro: f.logroDen > 0 ? f.logroNum / f.logroDen : null,
      puntaje: f.puntaje,
      peso: f.peso,
      estado: estadoDesdeLogro(f.logroDen > 0 ? f.logroNum / f.logroDen : null),
    }))
    .sort((a, b) => orden.indexOf(a.pdca) - orden.indexOf(b.pdca));

  return {
    elementos,
    fases: fasesArr,
    total: {
      logro: totalAuditoria,                       // 0..1  (equivale a W)
      porcentaje: totalAuditoria != null ? totalAuditoria * 100 : null,
      puntajeSobre100: puntajeObtenidoTotal,
      pesoIncluido: pesoIncluidoTotal,
      estado: estadoDesdeLogro(totalAuditoria),
    },
    avance: {
      totalSubelementos: totalSub,
      subelementosValorados: totalValorados,
      porcentaje: totalSub > 0 ? (totalValorados / totalSub) * 100 : 0,
      completa: totalSub > 0 && totalValorados === totalSub,
    },
  };
}
