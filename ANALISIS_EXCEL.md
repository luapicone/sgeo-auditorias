# Análisis de la hoja «Comparativa SGEO FINAL»

Este documento explica cómo se leyó la hoja del Excel y cómo se replican sus
cálculos en la aplicación. **Toda la lógica de puntaje proviene del Excel**; las
extensiones (que el Excel no define) están señaladas explícitamente.

---

## 1. Estructura de la hoja

La hoja tiene los encabezados en la **fila 4** y los datos en las **filas 5 a 31**
(27 subelementos). Las columnas A y B están combinadas verticalmente por elemento.

| Col | Encabezado | Significado | Uso en la app |
|-----|------------|-------------|---------------|
| A | *(PDCA)* | Fase del ciclo PDCA: `PLANIFICAR`, `HACER`, `VERIFICAR ACTUAR` | Agrupador / “capítulo” de nivel superior |
| B | `Elemento MODELO YPF EO` | `E1`…`E5` con su nombre | Elemento (nivel 2) |
| C | `SE` | Número de subelemento (1…27) | Identificador del subelemento |
| D | `Detalle` | Nombre del subelemento / requisito | Texto del ítem a auditar |
| E | `Sub Elemento MODELO YPF 2.0` | Referencias cruzadas al Modelo YPF 2.0 | Sólo informativo (se muestra al auditor) |
| F–K | `ISO 9001`, `ISO 14001`, `ISO 45001`, `CCPS`, `ISO 39001`, `ISO 50001` | Requisitos equivalentes de cada norma | Sólo informativo |
| L | `Puntaje del Capítulo` | Peso del **elemento** (sólo en su primera fila) | Ponderación del elemento |
| M | `PONDERACIÓN INICIAL` | Peso del **subelemento** dentro del elemento — **siempre 1** | Denominador del % de logro |
| N | `VALORACIÓN` | **Entrada del auditor**: `C` / `PC` / `NC` / `NA` | Único dato que se carga |
| O–R | `C`, `NC`, `PC`, `N/A` | Columnas auxiliares (marcas 1 / 0.3 / “-”) | **No se usan** en el resultado final (ver nota) |
| S | `EVALUACIÓN FINAL` | Fórmula: convierte la valoración a fracción | Réplica exacta |
| T | `% DE LOGRO DEL CAPÍTULO` | `SUMA(S del elemento) / SUMA(M del elemento)` | Réplica exacta |
| U | `ESTADO DEL CAPÍTULO` | Nivel según umbrales de % | Réplica exacta |
| V | `PUNTAJE DEL CAPÍTULO` | `L × T` | Réplica exacta |
| W | `TOTAL AUDITORÍA` | `(V_E1 + V_E2 + V_E3 + V_E4 + V_E5) / 100` | Réplica exacta (ver extensión de alcance parcial) |

### Elementos y pesos (columna L)

| Cód. | Elemento | Fase PDCA | Subelementos | Peso (L) |
|------|----------|-----------|--------------|----------|
| E1 | Liderazgo y enfoque a clientes | PLANIFICAR | 1–3 | 15 |
| E2 | Planificación | PLANIFICAR | 4–7 | 15 |
| E3 | Soporte a la gestión, procesos y normativa | HACER | 8–11 | 15 |
| E4 | Operación | HACER | 12–20 | 35 |
| E5 | Evaluación y mejora | VERIFICAR ACTUAR | 21–27 | 20 |
| | | | **27** | **100** |

---

## 2. Fórmulas del Excel (celdas reales)

**Columna S — `EVALUACIÓN FINAL`** (fila 5, se repite en todas):
```
=IF(N5="C",100%,IF(N5="PC",30%,IF(N5="NC",0%,IF(N5="NA","-",""))))
```
→ `C = 1.0` · `PC = 0.3` · `NC = 0.0` · `NA = "-"` (texto, que `SUMA` ignora) · vacío = `""`

**Columna T — `% DE LOGRO DEL CAPÍTULO`** (fila 5, rango del elemento E1 = filas 5:7):
```
=(SUM(S5:S7)/SUM(M5:M7))
```
Como `M` siempre vale 1, el **denominador es el número de subelementos del elemento**.
El numerador suma las fracciones de S; `NA` y las celdas vacías suman 0.

**Columna U — `ESTADO DEL CAPÍTULO`**:
```
=IF(T5>=91%,"Mantener",IF(T5>=81%,"Optimizar",IF(T5>=61%,"Mejorar",IF(T5>=41%,"Implementar","Crítico"))))
```

| % de logro (T) | Estado |
|----------------|--------|
| ≥ 91 % | Mantener |
| 81 – 90.99 % | Optimizar |
| 61 – 80.99 % | Mejorar |
| 41 – 60.99 % | Implementar |
| < 41 % | Crítico |

**Columna V — `PUNTAJE DEL CAPÍTULO`**:
```
=L5*T5
```

**Columna W — `TOTAL AUDITORÍA`**:
```
=(V5+V8+V12+V16+V25)/100
```
Suma del puntaje de los 5 elementos, dividido por 100 (la suma de los pesos L).
El resultado es una fracción 0–1 (equivale al % de cumplimiento global).

---

## 3. Réplica en la aplicación

Todo está implementado en **`server/scoring.js`** (un único módulo, sin dependencias,
usado tanto por el backend como para documentar la lógica). El servidor calcula
siempre el resultado; el cliente nunca recalcula.

```
S(valoración):        C→1.0 · PC→0.3 · NC→0.0 · NA→0.0 (en el numerador)
logro(elemento) = Σ S(subelementos en alcance) / (cantidad de subelementos en alcance)
estado(elemento) = umbral(logro)                     [tabla de la sección 2]
puntaje(elemento) = pesoL(elemento) × logro(elemento)
total = Σ puntaje(elementos en alcance) / Σ pesoL(elementos en alcance)
estado(total) = umbral(total)
```

Con las 27 filas cargadas, estos números coinciden **exactamente** con las celdas
T, U, V y W del Excel. Casos de verificación incluidos:

| Escenario | Excel | App |
|-----------|-------|-----|
| Todo `C` | W = 100 % → “Mantener” | 100 % → “Mantener” |
| Todo `NC` | W = 0 % → “Crítico” | 0 % → “Crítico” |
| Todo `PC` | W = 30 % → “Crítico” | 30 % → “Crítico” |
| E1 = `C, C, PC` | T = 76,67 % ; V = 11,5 | idéntico |

---

## 4. Extensiones (no definidas en el Excel)

El Excel asume que **siempre se cargan las 27 filas**. La app permite auditar un
subconjunto, por lo que se agregaron reglas explícitas:

1. **Alcance parcial (subelemento fuera de alcance):** se excluye del numerador *y*
   del denominador. No forma parte de la auditoría.

2. **Subelemento en alcance pero sin valorar:** cuenta como 0 en el numerador y 1 en
   el denominador — idéntico a una celda `N` vacía en el Excel. Al cerrar la
   auditoría la app avisa cuántos quedan pendientes.

3. **Total con alcance parcial:** en vez de dividir por 100 fijo, se divide por la
   **suma de los pesos L de los elementos incluidos**. Con alcance completo el
   divisor es 100 y el resultado es idéntico al Excel.

4. **Estado global y estado por fase PDCA:** el Excel no los calcula. Se aplican los
   mismos umbrales de la columna U al total y a cada fase (puntaje de la fase /
   peso de la fase).

5. **`NA` (“No aplica”):** el Excel lo trata como 0 en el numerador pero lo mantiene
   en el denominador (M = 1), es decir, **penaliza el puntaje**. La app respeta ese
   comportamiento. Si se quisiera que `NA` no penalice (excluirlo del denominador),
   es un cambio de una línea en `server/scoring.js` (función `calcularResultado`),
   pero se documenta aquí porque *cambiaría* el resultado respecto del Excel.

---

## 5. Observaciones sobre los datos de origen

- Las columnas F–K (referencias ISO) tienen varias celdas que Excel interpretó como
  fechas (p. ej. `4.2` quedó guardado como “04-feb-2026”). El script de importación
  las reconstruye como `mes.día`. Son sólo texto informativo; no afectan ningún
  cálculo.
- Las columnas auxiliares O, P, Q, R (`C`, `NC`, `PC`, `N/A`) contienen marcas
  manuales heredadas y **no intervienen** en las fórmulas S/T/U/V/W. Se ignoran.
- Las otras hojas del libro (`Comparativa SGEO`, `Comparativa SGEO (1)`,
  `Comparativa SGEO LD-RC`) son versiones previas; se usó únicamente
  `Comparativa SGEO FINAL` según lo solicitado.
