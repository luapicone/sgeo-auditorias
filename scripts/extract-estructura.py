#!/usr/bin/env python3
"""
extract-estructura.py — Convierte la hoja "Comparativa SGEO FINAL" del Excel fuente
en el archivo server/data/estructura-sgeo.json que consume la aplicación.

Uso:
    pip install openpyxl
    python3 scripts/extract-estructura.py [ruta_al_xlsx]

Lógica de mapeo (ver ANALISIS_EXCEL.md para el detalle):
    Columna A  -> pdca            (fase / agrupador: PLANIFICAR, HACER, VERIFICAR ACTUAR)
    Columna B  -> elemento        (E1..E5, "código: nombre"); celdas combinadas
    Columna C  -> se              (número de subelemento, 1..27)
    Columna D  -> detalle         (nombre del subelemento / requisito)
    Columnas E-K -> referencias normativas (YPF 2.0, ISO 9001/14001/45001, CCPS, ISO 39001/50001)
    Columna L  -> puntajeCapitulo (peso del elemento: 15/15/15/35/20; sólo primera fila del elemento)
    Columna M  -> ponderacionInicial (siempre 1)
"""
import json
import sys
import datetime
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl. Ejecute: pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts" / "fuente-comparativa-sgeo.xlsx"
OUT = ROOT / "server" / "data" / "estructura-sgeo.json"
SHEET = "Comparativa SGEO FINAL"
FIRST_ROW, LAST_ROW = 5, 31  # filas de datos (fila 4 = encabezados)


def clean(v):
    if v is None:
        return ""
    # Algunas celdas de referencia fueron interpretadas por Excel como fechas
    # (p. ej. "4.2" -> 04-feb). Se recuperan como "mes.día".
    if isinstance(v, datetime.datetime):
        return f"{v.month}.{v.day}"
    return str(v).strip()


def main():
    wb = openpyxl.load_workbook(SRC, data_only=False)
    ws = wb[SHEET]

    elements, order = {}, []
    cur_pdca = cur_elem = None

    for r in range(FIRST_ROW, LAST_ROW + 1):
        cur_pdca = ws.cell(r, 1).value or cur_pdca
        cur_elem = ws.cell(r, 2).value or cur_elem
        elem = cur_elem.strip()
        code, name = (elem.split(":", 1) + [""])[:2]
        code, name = code.strip(), name.strip()

        if elem not in elements:
            elements[elem] = {
                "codigo": code,
                "nombre": name,
                "pdca": cur_pdca.strip(),
                "puntajeCapitulo": ws.cell(r, 12).value,   # columna L
                "subelementos": [],
            }
            order.append(elem)

        elements[elem]["subelementos"].append({
            "se": ws.cell(r, 3).value,
            "detalle": clean(ws.cell(r, 4).value),
            "subElementoYPF20": clean(ws.cell(r, 5).value),
            "iso9001": clean(ws.cell(r, 6).value),
            "iso14001": clean(ws.cell(r, 7).value),
            "iso45001": clean(ws.cell(r, 8).value),
            "ccps": clean(ws.cell(r, 9).value),
            "iso39001": clean(ws.cell(r, 10).value),
            "iso50001": clean(ws.cell(r, 11).value),
            "ponderacionInicial": ws.cell(r, 13).value,     # columna M
        })

    data = {
        "fuente": SHEET,
        "modelo": "Modelo de Excelencia Operacional YPF / Modelo YPF 2.0",
        "escalaValoracion": {"C": 1.0, "PC": 0.3, "NC": 0.0, "NA": 0.0},
        "umbralesEstado": [
            {"min": 0.91, "estado": "Mantener"},
            {"min": 0.81, "estado": "Optimizar"},
            {"min": 0.61, "estado": "Mejorar"},
            {"min": 0.41, "estado": "Implementar"},
            {"min": 0.0, "estado": "Crítico"},
        ],
        "elementos": [elements[e] for e in order],
    }

    total = sum(e["puntajeCapitulo"] for e in data["elementos"])
    n_sub = sum(len(e["subelementos"]) for e in data["elementos"])
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OK  {OUT}")
    print(f"    {len(data['elementos'])} elementos · {n_sub} subelementos · suma de pesos L = {total}")


if __name__ == "__main__":
    main()
