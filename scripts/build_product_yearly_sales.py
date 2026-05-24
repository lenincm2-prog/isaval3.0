import json
import math
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOURCE_FILES = [
    Path(r"C:\Users\User\Downloads\Listado de Detalles Kárdex Generaldeta.xls"),
    Path(r"C:\Users\User\Downloads\Listado de Detalles Kárdex General.xls"),
]
SALE_OPS = {"VENTA", "SALIDA PARA VENTA"}


def clean_text(value, fallback=""):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def money(value):
    if pd.isna(value):
        return 0.0
    try:
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return 0.0
        return value
    except (TypeError, ValueError):
        return 0.0


def roundn(value, digits=2):
    if value is None:
        return None
    try:
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, digits)
    except (TypeError, ValueError):
        return None


def classify_family(product):
    text = clean_text(product, "").upper()
    rules = [
        ("Impermeabilizacion", ["ISAFORT", "ANTIGOTER", "ELAST", "RHONAPLAST", "TERMOAISLANTE", "ISABLOCK"]),
        ("Suelos y deporte", ["SUELOS", "PISTA", "AUTONIVELANTE", "EPOXI", "POLIURETANO"]),
        ("Esmaltes y 2K", ["ESMALTE", "2KR", "DUEPOL"]),
        ("Selladores", ["SELLADOR", "SELLANTE", "ACQUASELL"]),
        ("Disolventes", ["DISOLVENTE", "THINNER", "DILUYENTE"]),
        ("Herramientas", ["PISTOLA", "BROCHA", "RODILLO", "CINTA", "ESPATULA"]),
        ("Servicios y descuentos", ["DESCUENTO", "FLETE", "SERVICIO", "DNIR"]),
    ]
    for family, keywords in rules:
        if any(keyword in text for keyword in keywords):
            return family
    return "Otros"


def product_base_name(product):
    text = clean_text(product, "").upper()
    text = re.sub(r"\b\d+([,.]\d+)?\s*(LTS?|LT|L|KG|KGS?|ML|GL|GAL|UNIDADES|UND|M2)\b\.?", " ", text)
    text = re.sub(r"\b\d+([,.]\d+)?\s*\+\s*\w+\.?", " ", text)
    text = re.sub(r"\b(B-TR|B-IN|BLANCO|NEGRO|TRANSPARENTE|MARRON|MARRÓN|GRIS|ROJO|AZUL|VERDE|AMARILLO|BASES? TINTOMETRA|BASES? TINTOM)\b", " ", text)
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:90] or clean_text(product)


def safe_id(text):
    text = clean_text(text, "sin-id").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "sin-id"


def build():
    existing_files = [file for file in SOURCE_FILES if file.exists()]
    if not existing_files:
        raise FileNotFoundError("No se encontro ningun archivo de Kardex.")

    frames = []
    for file in existing_files:
        frame = pd.read_excel(file, header=3)
        frame["source_file"] = file.name
        frames.append(frame)
    df = pd.concat(frames, ignore_index=True)
    dedup_cols = [col for col in ["Codigo Inventario", "Registro Contable", "Fecha Movimiento", "Cod. Almacén", "Cod. Producto", "Movimiento", "Cantidad", "Cantidad Entrada", "Cantidad Salida", "Saldo Cantidad"] if col in df.columns]
    if dedup_cols:
        df = df.drop_duplicates(dedup_cols, keep="last").copy()
    df = df[df["Cod. Producto"].notna()].copy()
    df["Fecha Movimiento"] = pd.to_datetime(df["Fecha Movimiento"], errors="coerce")
    df = df[df["Fecha Movimiento"].notna()].copy()
    df["_op"] = df["Nombre Tipo Operacion"].map(lambda value: clean_text(value).upper())
    df["_movement"] = df["Movimiento"].map(lambda value: clean_text(value).upper())
    df = df[df["_op"].isin(SALE_OPS) & (df["_movement"] == "SALIDA")].copy()
    df["year"] = df["Fecha Movimiento"].dt.year.astype(int)
    df["product"] = df["Nombre Producto"].map(clean_text)
    df["product_base"] = df["product"].map(product_base_name)
    df["family"] = df["product"].map(classify_family)
    df["quantity"] = df["Cantidad Salida"].map(money)

    grouped = (
        df.groupby(["product_base", "family", "year"], as_index=False)
        .agg(units=("quantity", "sum"), rows=("Cod. Producto", "count"), codes=("Cod. Producto", "nunique"))
        .sort_values(["product_base", "year"])
    )

    products = {}
    for _, row in grouped.iterrows():
        key = (row["product_base"], row["family"])
        product_id = safe_id(f"{row['family']}-{row['product_base']}")
        entry = products.setdefault(
            product_id,
            {
                "id": product_id,
                "product": row["product_base"],
                "family": row["family"],
                "yearly": {},
            },
        )
        entry["yearly"][str(int(row["year"]))] = {
            "units": roundn(row["units"]),
            "movements": int(row["rows"]),
            "codes": int(row["codes"]),
        }

    years = sorted({int(year) for item in products.values() for year in item["yearly"].keys()})
    payload = {
        "summary": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "sourceFile": ", ".join(file.name for file in existing_files),
            "products": len(products),
            "years": years,
        },
        "products": list(products.values()),
        "byId": products,
    }

    DATA_DIR.mkdir(exist_ok=True)
    json_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (DATA_DIR / "product-yearly-sales.json").write_text(json_payload, encoding="utf-8")
    (DATA_DIR / "product-yearly-sales.js").write_text(f"window.PRODUCT_YEARLY_SALES = {json_payload};\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
