# Análisis de la hoja «Comparativa SGEO FINAL»

Este documento explica cómo se leyó la hoja del Excel y cómo se replican sus
cálculos en la aplicación. **Toda la lógica de puntaje proviene del Excel**; las
extensiones (que el Excel no define) están señaladas explícitamente.

> **Actualización (archivo «Auditorías Final.xlsx»):**
> - La valoración "Cumple parcialmente" pasó de `PC` a **`CP`** (fórmula de la columna S).
> - El ciclo PDCA se separó: antes "VERIFICAR ACTUAR" iba junto; ahora son **4 fases**
>   (`PLANIFICAR`, `HACER`, `VERIFICAR`, `ACTUAR`). E5 queda partido: SE 21–26 en
>   VERIFICAR y SE 27 (Mejora continua) en ACTUAR. **Esto no cambia el cálculo por
>   elemento ni el total** — la fase es sólo un agrupador.
> - Los encabezados L/T/U/V pasaron de "…del Capítulo" a **"…del Elemento"**.
> - Se agregó la comparación completa con **CCPS** y el modelo CCPS quedó en una 2ª hoja
>   del Excel, que la app muestra en "Modelo CCPS".
> - **`NA` ("No aplica") ya no penaliza:** se excluye del cálculo del elemento (ver §4.5).

---

## 1. Estructura de la hoja

La hoja tiene los encabezados en la **fila 4** y los datos en las **filas 5 a 31**
(27 subelementos). Las columnas A y B están combinadas verticalmente por elemento.

| Col | Encabezado | Significado | Uso en la app |
|-----|------------|-------------|---------------|
| A | *(PDCA)* | Fase del ciclo PDCA: `PLANIFICAR`, `HACER`, `VERIFICAR`, `ACTUAR` | Fase del ciclo, a nivel de subelemento |
| B | `Elemento MODELO YPF EO` | `E1`…`E5` con su nombre | Elemento (nivel 2) |
| C | `SE` | Número de subelemento (1…27) | Identificador del subelemento |
| D | `Detalle` | Nombre del subelemento / requisito | Texto del ítem a auditar |
| E | `Sub Elemento MODELO YPF 2.0` | Referencias cruzadas al Modelo YPF 2.0 | Sólo informativo (se muestra al auditor) |
| F–K | `ISO 9001`, `ISO 14001`, `ISO 45001`, `CCPS`, `ISO 39001`, `ISO 50001` | Requisitos equivalentes de cada norma | Sólo informativo |
| L | `Puntaje del Elemento` | Peso del **elemento** (sólo en su primera fila) | Ponderación del elemento |
| M | `PONDERACIÓN INICIAL` | Peso del **subelemento** dentro del elemento — **siempre 1** | Denominador del % de logro |
| N | `VALORACIÓN` | **Entrada del auditor**: `C` / `CP` / `NC` / `NA` | Único dato que se carga |
| O–R | `C`, `NC`, `PC`, `N/A` | Columnas auxiliares (marcas 1 / 0.3 / “-”) | **No se usan** en el resultado final (ver nota) |
| S | `EVALUACIÓN FINAL` | Fórmula: convierte la valoración a fracción | Réplica exacta |
| T | `% DE LOGRO DEL ELEMENTO` | `SUMA(S del elemento) / SUMA(M del elemento)` | Réplica exacta |
| U | `ESTADO DEL ELEMENTO` | Nivel según umbrales de % | Réplica exacta |
| V | `PUNTAJE DEL ELEMENTO` | `L × T` | Réplica exacta |
| W | `TOTAL AUDITORÍA` | `(V_E1 + V_E2 + V_E3 + V_E4 + V_E5) / 100` | Réplica exacta (ver extensión de alcance parcial) |

### Elementos y pesos (columna L)

| Cód. | Elemento | Fase PDCA | Subelementos | Peso (L) |
|------|----------|-----------|--------------|----------|
| E1 | Liderazgo y enfoque a clientes | PLANIFICAR | 1–3 | 15 |
| E2 | Planificación | PLANIFICAR | 4–7 | 15 |
| E3 | Soporte a la gestión, procesos y normativa | HACER | 8–11 | 15 |
| E4 | Operación | HACER | 12–20 | 35 |
| E5 | Evaluación y mejora | VERIFICAR (SE 21–26) + ACTUAR (SE 27) | 21–27 | 20 |
| | | | **27** | **100** |

---

## 2. Fórmulas del Excel (celdas reales)

**Columna S — `EVALUACIÓN FINAL`** (fila 5, se repite en todas):
```
=IF(N5="C",100%,IF(N5="CP",30%,IF(N5="NC",0%,IF(N5="NA","-",""))))
```
→ `C = 1.0` · `CP = 0.3` · `NC = 0.0` · `NA = "-"` (texto, que `SUMA` ignora) · vacío = `""`

**Columna T — `% DE LOGRO DEL ELEMENTO`** (fila 5, rango del elemento E1 = filas 5:7):
```
=(SUM(S5:S7)/SUM(M5:M7))
```
Como `M` siempre vale 1, el **denominador es el número de subelementos del elemento**.
El numerador suma las fracciones de S; `NA` y las celdas vacías suman 0.

**Columna U — `ESTADO DEL ELEMENTO`**:
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

**Columna V — `PUNTAJE DEL ELEMENTO`**:
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
S(valoración):        C→1.0 · CP→0.3 · NC→0.0 · NA→0.0 (en el numerador)
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
| Todo `CP` | W = 30 % → “Crítico” | 30 % → “Crítico” |
| E1 = `C, C, CP` | T = 76,67 % ; V = 11,5 | idéntico |

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

4. **Estado global y resultado por fase PDCA:** el Excel no los calcula. Se aplican
   los mismos umbrales de la columna U al total y a cada fase. Para el puntaje por
   fase, el peso de cada elemento se reparte en partes iguales entre sus subelementos,
   de modo que la suma de las 4 fases da exactamente el total (E5 se divide: 6/7 de
   sus 20 puntos van a VERIFICAR y 1/7 a ACTUAR).

5. **`NA` (“No aplica”) — DIVERGENCIA DELIBERADA DEL EXCEL:** el Excel cuenta el `NA`
   como 0 en el numerador y lo mantiene en el denominador (penaliza). **La app lo
   excluye por completo**: un subelemento `NA` no entra ni en el numerador ni en el
   denominador del elemento, ni en el reparto de peso por fase.
   - Un elemento con **algunos** `NA` conserva todo su peso `L`; su % de logro se
     calcula sólo sobre los subelementos aplicables (los no-`NA`).
   - Un elemento con **todos** sus subelementos en `NA` queda **“No aplica”**: sin %
     de logro, sin puntaje, y **no cuenta en el total** (su peso `L` se descuenta del
     divisor, igual que un elemento fuera de alcance).
   - Si *toda* la auditoría queda en `NA`, el total muestra “—” (no “0% Crítico”).
   El avance de carga sí cuenta el `NA` como decisión tomada (una fila marcada `NA`
   está “resuelta”).

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
