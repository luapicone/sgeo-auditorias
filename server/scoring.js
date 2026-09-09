/**
 * scoring.js — Réplica de la lógica de cálculo de la hoja "Comparativa SGEO FINAL".
 *
 * Módulo ES sin dependencias: se usa igual en el servidor (Node) y en el navegador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EQUIVALENCIA CON LAS COLUMNAS / FÓRMULAS DEL EXCEL
 * ─────────────────────────────────────────────────────────────────────────────
 *  Columna N  "VALORACIÓN"            -> valoracion del ítem: "C" | "PC" | "NC" | "NA"
 *  Columna M  "PONDERACIÓN INICIAL"   -> siempre 1 (peso del subelemento dentro del elemento)
 *  Columna S  "EVALUACIÓN FINAL"      -> S(v):
 *                 =IF(N="C",100%,IF(N="PC",30%,IF(N="NC",0%,IF(N="NA","-",""))))
 *             C=1.0 · PC=0.3 · NC=0.0 · NA/""=0 en el numerador
 *  Columna T  "% DE LOGRO DEL CAPÍTULO"
 *                 =(SUM(S del elemento) / SUM(M del elemento))
 *  Columna U  "ESTADO DEL CAPÍTULO"
 *                 =IF(T>=91%,"Mantener",IF(T>=81%,"Optimizar",IF(T>=61%,"Mejorar",
 *                   IF(T>=41%,"Implementar","Crítico"))))
 *  Columna L  "PUNTAJE DEL CAPÍTULO"  -> peso del elemento (E1=15, E2=15, E3=15, E4=35, E5=20; suma 100)
 *  Columna V  "PUNTAJE DEL CAPÍTULO"  -> =L * T
 *  Columna W  "TOTAL AUDITORÍA"       -> =(V_E1 + V_E2 + V_E3 + V_E4 + V_E5) / 100
 *
 * EXTENSIONES (no definidas en el Excel, que asume las 27 filas completas):
 *  - Alcance parcial: un subelemento NO seleccionado se excluye del numerador Y del
 *    denominador (no forma parte de la auditoría). Un subelemento seleccionado pero
 *    todavía sin valorar cuenta como 0 en el numerador y 1 en el denominador
 *    (idéntico a una celda N vacía en el Excel).
 *  - Total auditoría con alcance parcial: se re-normaliza dividiendo por la suma de los
 *    pesos L de los elementos incluidos, en vez de por 100 fijo. Con las 27 filas en
 *    alcance el resultado es idéntico al Excel (la suma de L es 100).
 *  - "Estado" del total de auditoría y de cada fase PDCA: se reutilizan los mismos
 *    umbrales de la columna U (el Excel no calcula un estado global).
 *  - NA ("No aplica"): el Excel lo trata como 0 en el numerador pero lo mantiene en el
 *    denominador (M=1), es decir, penaliza. Se respeta ese comportamiento.
 */

export const ESCALA = { C: 1.0, PC: 0.3, NC: 0.0, NA: 0.0 };

export const VALORACIONES = [
  { code: 'C', label: 'Cumple' },
  { code: 'PC', label: 'Cumple parcialmente' },
  { code: 'NC', label: 'No cumple' },
  { code: 'NA', label: 'No aplica' },
];

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
 *        Cada item.se debe existir en la estructura. valoracion null = pendiente.
 * @returns {object} resultado con desglose por subelemento, elemento, fase PDCA y total.
 */
export function calcularResultado(estructura, items) {
  const enAlcance = new Map(); // se -> valoracion|null
  for (const it of items) enAlcance.set(Number(it.se), it.valoracion || null);

  const elementos = [];
  const fases = new Map(); // pdca -> { puntajeObtenido, pesoIncluido }

  for (const el of estructura.elementos) {
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
        valoracion: valoracion,
        evaluacionFinal: valoracion ? s : null,
      });
    }

    if (subs.length === 0) continue; // elemento sin nada en alcance

    const logro = denom > 0 ? sumaS / denom : null;           // T
    const puntajeCapitulo = logro != null ? el.puntajeCapitulo * logro : 0; // V = L * T

    elementos.push({
      codigo: el.codigo,
      nombre: el.nombre,
      pdca: el.pdca,
      pesoCapitulo: el.puntajeCapitulo,        // L
      logro,                                   // T (0..1)
      estado: estadoDesdeLogro(logro),         // U
      puntajeCapitulo,                         // V
      totalSubelementos: subs.length,
      subelementosValorados: valorados,
      subelementos: subs,
    });

    const f = fases.get(el.pdca) || { pdca: el.pdca, puntajeObtenido: 0, pesoIncluido: 0 };
    f.puntajeObtenido += puntajeCapitulo;
    f.pesoIncluido += el.puntajeCapitulo;
    fases.set(el.pdca, f);
  }

  const pesoIncluidoTotal = elementos.reduce((a, e) => a + e.pesoCapitulo, 0);
  const puntajeObtenidoTotal = elementos.reduce((a, e) => a + e.puntajeCapitulo, 0);
  // W (re-normalizado por peso incluido; con alcance completo el divisor es 100)
  const totalAuditoria = pesoIncluidoTotal > 0 ? puntajeObtenidoTotal / pesoIncluidoTotal : null;

  const totalSub = elementos.reduce((a, e) => a + e.totalSubelementos, 0);
  const totalValorados = elementos.reduce((a, e) => a + e.subelementosValorados, 0);

  const fasesArr = [...fases.values()].map((f) => ({
    pdca: f.pdca,
    logro: f.pesoIncluido > 0 ? f.puntajeObtenido / f.pesoIncluido : null,
    puntaje: f.puntajeObtenido,
    peso: f.pesoIncluido,
    estado: estadoDesdeLogro(f.pesoIncluido > 0 ? f.puntajeObtenido / f.pesoIncluido : null),
  }));

  return {
    elementos,
    fases: fasesArr,
    total: {
      logro: totalAuditoria,                       // 0..1  (equivale a W)
      porcentaje: totalAuditoria != null ? totalAuditoria * 100 : null,
      puntajeSobre100: puntajeObtenidoTotal,       // puntos absolutos (sobre pesoIncluidoTotal)
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
