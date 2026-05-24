import json
import math
import re
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASSET_DIR = ROOT / "assets"

FILES = [
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Ventas Periodo 1-01-2022  al 31-12-2022.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Ventas Periodo 1-01-2023  al 31-12-2023.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Ventas Periodo 1-01-2024  al 31-12-2024.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Ventas Periodo 1-01-2025  al 31-12-2025.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Ventas Periodo 01-01-2026 al 30-04-2026.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\OneDrive - PINTURAS ISAVAL SL --\Escritorio\ContaFile\Reportes\Mod. Venta\Reporte de Ventas Periodo 1-05-2026  al 31-05-2026.xlsx"),
]

CLIENT_FILES = [
    Path(r"C:\Users\Lenin Cabrera\Downloads\datos clientes.xls"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\clientes.xls"),
]
QUOTE_FILES = [
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Cotizacion Periodo 1-01-2026  al 30-04-2026.xlsx"),
    Path(r"C:\Users\Lenin Cabrera\Downloads\Reporte de Cotizacion Periodo 1-05-2026  al 15-05-2026.xlsx"),
]
KARDEX_FILE = Path(r"C:\Users\Lenin Cabrera\Downloads\Listado de Cabeceras Kárdex General.xls")
PRICE_FILE = Path(r"C:\Users\Lenin Cabrera\Downloads\Formato de Actualización de Precios.xlsx")
WAREHOUSE_STOCK_FILE = Path(r"C:\Users\Lenin Cabrera\Downloads\Consulta de Stock.xls")


def money(value):
    if pd.isna(value):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clean_text(value, fallback="Sin dato"):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def clean_doc(value):
    text = clean_text(value, "")
    if text.endswith(".0"):
        text = text[:-2]
    return re.sub(r"\D+", "", text) or clean_text(value)


def clean_phone(value):
    text = clean_text(value, "")
    text = re.sub(r"\D+", "", text)
    if not text:
        return ""
    if len(text) == 9:
        return "51" + text
    return text


def row_value(row, *names, fallback=""):
    for name in names:
        if name in row.index:
            value = clean_text(row.get(name), "")
            if value:
                return value
    return fallback


def merge_contact(existing, incoming):
    merged = dict(existing or {})
    for key, value in incoming.items():
        if value or not merged.get(key):
            merged[key] = value
    return merged


def find_header_row_by_any(file, sheet_name, tokens):
    probe = pd.read_excel(file, sheet_name=sheet_name, header=None, nrows=15)
    wanted = {token.lower() for token in tokens}
    for idx, row in probe.iterrows():
        values = {clean_text(v, "").lower() for v in row.tolist()}
        if values & wanted:
            return idx
    return 5


def voucher_key_frame(df):
    parts = []
    for col in ["Cod. TD.", "Tipo Doc.", "Serie", "Numero", "Doc. Cliente"]:
        if col in df.columns:
            parts.append(df[col].map(clean_text))
        else:
            parts.append(pd.Series([""] * len(df), index=df.index))
    return parts[0] + "|" + parts[1] + "|" + parts[2] + "|" + parts[3] + "|" + parts[4]


def doc_code_series(df, column):
    if column not in df.columns:
        return pd.Series([""] * len(df), index=df.index)
    return df[column].map(clean_text).str.replace(r"\.0$", "", regex=True).str.strip()


def credit_note_mask(df):
    doc_type = df["doc_type"] if "doc_type" in df.columns else df.get("Tipo Doc.", pd.Series([""] * len(df), index=df.index)).map(clean_text)
    doc_text = doc_type.str.upper()
    is_credit_text = doc_text.str.contains("NOTA DE CR|CREDITO|CRÉDITO", regex=True, na=False)
    is_debit_text = doc_text.str.contains("NOTA DE D|DEBITO|DÉBITO", regex=True, na=False)
    sunat_code = doc_code_series(df, "Cod. TD. Sunat")
    internal_code = doc_code_series(df, "Cod. TD.")
    is_credit_code = sunat_code.isin(["7", "07"]) | internal_code.isin(["7", "07"])
    return (is_credit_text | is_credit_code) & ~is_debit_text


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


def pct_change(current, previous):
    if abs(previous) < 0.01:
        return None if abs(current) < 0.01 else 1.0
    return (current - previous) / abs(previous)


def roundn(value, digits=2):
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return None
    return round(float(value), digits)


def status_bucket(status):
    text = clean_text(status, "").lower()
    if "atendido" in text:
        return "Cerrada"
    if "expirado" in text:
        return "Expirada"
    return "Pendiente"


def read_quotations_2026():
    existing_files = [file for file in QUOTE_FILES if file.exists()]
    if not existing_files:
        return {}
    quote_frames = []
    detail_frames = []
    for file in existing_files:
        quote_header = find_header_row_by_any(file, "Cotizacion", ["Nro. Cot.", "Nro de cotización"])
        detail_header = find_header_row_by_any(file, "Cotizacion Detallado", ["Nro. Cotizacion", "Nro de cotización"])
        quote_frame = pd.read_excel(file, sheet_name="Cotizacion", header=quote_header)
        detail_frame = pd.read_excel(file, sheet_name="Cotizacion Detallado", header=detail_header)
        quote_frame["source_file"] = file.name
        detail_frame["source_file"] = file.name
        quote_frames.append(quote_frame)
        detail_frames.append(detail_frame)
    quotes = pd.concat(quote_frames, ignore_index=True)
    detail = pd.concat(detail_frames, ignore_index=True)
    if "Estado" not in quotes.columns:
        quotes["Estado"] = "Elaborado"
    else:
        quotes["Estado"] = quotes["Estado"].fillna("Elaborado")

    quotes = quotes[pd.notna(quotes["Nro. Cot."])].copy()
    quotes["quote_no"] = quotes["Nro. Cot."].map(clean_text)
    quotes["date"] = pd.to_datetime(quotes["Fec. Emi."], errors="coerce")
    quotes["expiry"] = pd.to_datetime(quotes["Fec. Cad."], errors="coerce")
    quotes = quotes[quotes["date"].dt.year == 2026].copy()
    quotes["seller"] = quotes["Nom. Vdr."].map(clean_text)
    quotes["client_doc"] = quotes["Nro. Clt."].map(clean_doc)
    quotes["client"] = quotes["Nom. Clt."].map(clean_text)
    quotes["status"] = quotes["Estado"].map(clean_text)
    quotes["status_bucket"] = quotes["status"].map(status_bucket)
    quotes["amount"] = quotes["Valor"].map(money)
    quotes["total"] = quotes["Total"].map(money)
    quotes["month"] = quotes["date"].dt.month.fillna(0).astype(int)
    quotes["is_closed"] = quotes["status_bucket"].eq("Cerrada")
    quotes["is_expired"] = quotes["status_bucket"].eq("Expirada")
    quotes["is_pending"] = quotes["status_bucket"].eq("Pendiente")
    quotes = quotes.sort_values(["date", "source_file", "quote_no"]).drop_duplicates("quote_no", keep="last").copy()

    detail = detail[pd.notna(detail["Nro. Cotizacion"])].copy()
    detail["quote_no"] = detail["Nro. Cotizacion"].map(clean_text)
    detail = detail.merge(
        quotes[["quote_no", "seller", "client_doc", "client", "date", "status", "status_bucket", "is_closed"]],
        on="quote_no",
        how="inner",
    )
    detail["product_code"] = detail["Código Prod/Serv"].map(clean_text)
    detail["commercial_code"] = detail["Cod. Comercial"].map(clean_text)
    detail["product"] = detail["Descripción"].map(clean_text)
    detail["product_base"] = detail["product"].map(product_base_name)
    detail["family"] = detail["product"].map(classify_family)
    detail["amount"] = detail["Valor"].map(money)
    detail["quantity"] = detail["Cantidad"].map(money)
    if {"quote_no", "Item", "product_code"}.issubset(detail.columns):
        detail = detail.drop_duplicates(["quote_no", "Item", "product_code"], keep="last").copy()

    high_open_threshold = quotes.loc[~quotes["is_closed"], "amount"].quantile(0.85) if not quotes[~quotes["is_closed"]].empty else 0

    def table_records(df, cols, limit=None):
        use = df.head(limit) if limit else df
        return [{key: clean_json(value) for key, value in row.items()} for row in use[cols].to_dict("records")]

    seller_summary = (
        quotes.groupby("seller", as_index=False)
        .agg(
            quoted=("quote_no", "nunique"),
            closed=("is_closed", "sum"),
            expired=("is_expired", "sum"),
            pending=("is_pending", "sum"),
            quotedAmount=("amount", "sum"),
            closedAmount=("amount", lambda s: s[quotes.loc[s.index, "is_closed"]].sum()),
            avgTicket=("amount", "mean"),
            clients=("client_doc", "nunique"),
        )
    )
    seller_summary["closeRate"] = seller_summary["closed"] / seller_summary["quoted"].replace(0, pd.NA)
    seller_summary = seller_summary.fillna(0).sort_values(["closedAmount", "closeRate", "quoted"], ascending=False)

    products = (
        detail.groupby(["product_base", "family"], as_index=False)
        .agg(
            quotes=("quote_no", "nunique"),
            quotedAmount=("amount", "sum"),
            closedQuotes=("is_closed", "sum"),
            closedAmount=("amount", lambda s: s[detail.loc[s.index, "is_closed"]].sum()),
            quantity=("quantity", "sum"),
            clients=("client_doc", "nunique"),
            codes=("product_code", "nunique"),
        )
    )
    products["closeRate"] = products["closedQuotes"] / products["quotes"].replace(0, pd.NA)
    products = products.fillna(0)

    clients = (
        quotes.groupby(["client_doc", "client"], as_index=False)
        .agg(
            quotes=("quote_no", "nunique"),
            quotedAmount=("amount", "sum"),
            closed=("is_closed", "sum"),
            closedAmount=("amount", lambda s: s[quotes.loc[s.index, "is_closed"]].sum()),
            sellers=("seller", lambda s: ", ".join(sorted(set(s.dropna().astype(str)))[:3])),
        )
    ).sort_values(["quotedAmount", "quotes"], ascending=False)

    repeated = (
        detail.groupby(["client_doc", "client", "product_base"], as_index=False)
        .agg(
            quotes=("quote_no", "nunique"),
            quotedAmount=("amount", "sum"),
            closedQuotes=("is_closed", "sum"),
            firstDate=("date", "min"),
            lastDate=("date", "max"),
            sellers=("seller", lambda s: ", ".join(sorted(set(s.dropna().astype(str)))[:3])),
        )
    )
    repeated = repeated[repeated["quotes"] > 1].sort_values(["quotes", "quotedAmount"], ascending=False)

    expired_open = quotes[quotes["is_expired"]].sort_values("amount", ascending=False)
    high_open = quotes[(~quotes["is_closed"]) & (quotes["amount"] >= high_open_threshold)].sort_values("amount", ascending=False)
    status_summary = (
        quotes.groupby("status_bucket", as_index=False)
        .agg(count=("quote_no", "nunique"), amount=("amount", "sum"))
        .sort_values("count", ascending=False)
    )

    total_quotes = int(quotes["quote_no"].nunique())
    closed_quotes = int(quotes.loc[quotes["is_closed"], "quote_no"].nunique())
    expired_quotes = int(quotes.loc[quotes["is_expired"], "quote_no"].nunique())
    pending_quotes = int(quotes.loc[quotes["is_pending"], "quote_no"].nunique())
    total_amount = quotes["amount"].sum()
    closed_amount = quotes.loc[quotes["is_closed"], "amount"].sum()
    close_rate = closed_quotes / total_quotes if total_quotes else 0
    best_seller = seller_summary.sort_values("closedAmount", ascending=False).iloc[0] if not seller_summary.empty else None
    most_demanded = products.sort_values("quotedAmount", ascending=False).iloc[0] if not products.empty else None
    conclusion = (
        f"En 2026 se emitieron {total_quotes} cotizaciones por S/ {total_amount:,.0f}, con una tasa de cierre de {close_rate * 100:.1f}%. "
        f"Hay {expired_quotes} expiradas y {pending_quotes} abiertas, por lo que la prioridad es recuperar cotizaciones vencidas y acelerar seguimiento de alto monto."
    )
    if best_seller is not None:
        conclusion += f" El mayor monto cerrado lo concentra {best_seller['seller']} con S/ {best_seller['closedAmount']:,.0f}."
    if most_demanded is not None:
        conclusion += f" El producto con mayor demanda cotizada es {most_demanded['product_base']}."

    quote_rows = quotes.sort_values("amount", ascending=False).copy()
    quote_rows["dateText"] = quote_rows["date"].dt.strftime("%Y-%m-%d")
    quote_rows["expiryText"] = quote_rows["expiry"].dt.strftime("%Y-%m-%d")

    detail_rows = detail.sort_values("amount", ascending=False).copy()
    detail_rows["dateText"] = detail_rows["date"].dt.strftime("%Y-%m-%d")

    return {
        "sourceFile": ", ".join(file.name for file in existing_files),
        "sourceFiles": [file.name for file in existing_files],
        "summary": {
            "totalQuotes": total_quotes,
            "closedQuotes": closed_quotes,
            "expiredQuotes": expired_quotes,
            "pendingQuotes": pending_quotes,
            "totalAmount": roundn(total_amount),
            "closedAmount": roundn(closed_amount),
            "avgTicket": roundn(quotes["amount"].mean()),
            "closeRate": roundn(close_rate, 4),
            "highOpenThreshold": roundn(high_open_threshold),
            "conclusion": conclusion,
        },
        "sellerSummary": table_records(
            seller_summary,
            ["seller", "quoted", "closed", "closeRate", "expired", "pending", "quotedAmount", "closedAmount", "avgTicket", "clients"],
        ),
        "statusSummary": table_records(status_summary, ["status_bucket", "count", "amount"]),
        "topProductsByCount": table_records(products.sort_values("quotes", ascending=False), ["product_base", "family", "quotes", "quotedAmount", "closedQuotes", "closedAmount", "clients"], 20),
        "topProductsByAmount": table_records(products.sort_values("quotedAmount", ascending=False), ["product_base", "family", "quotes", "quotedAmount", "closedQuotes", "closedAmount", "clients"], 20),
        "topClosedProducts": table_records(products.sort_values(["closedAmount", "closedQuotes"], ascending=False), ["product_base", "family", "quotes", "quotedAmount", "closedQuotes", "closedAmount", "clients"], 20),
        "topClientsByCount": table_records(clients.sort_values("quotes", ascending=False), ["client_doc", "client", "quotes", "quotedAmount", "closed", "closedAmount", "sellers"], 20),
        "topClientsByAmount": table_records(clients.sort_values("quotedAmount", ascending=False), ["client_doc", "client", "quotes", "quotedAmount", "closed", "closedAmount", "sellers"], 20),
        "repeatedProducts": table_records(repeated, ["client_doc", "client", "product_base", "quotes", "quotedAmount", "closedQuotes", "firstDate", "lastDate", "sellers"], 40),
        "expiredOpen": table_records(expired_open.assign(dateText=expired_open["date"].dt.strftime("%Y-%m-%d"), expiryText=expired_open["expiry"].dt.strftime("%Y-%m-%d")), ["quote_no", "seller", "client", "status", "dateText", "expiryText", "amount"], 40),
        "highOpen": table_records(high_open.assign(dateText=high_open["date"].dt.strftime("%Y-%m-%d"), expiryText=high_open["expiry"].dt.strftime("%Y-%m-%d")), ["quote_no", "seller", "client", "status", "dateText", "expiryText", "amount"], 40),
        "quoteRows": table_records(quote_rows, ["quote_no", "seller", "client_doc", "client", "status", "status_bucket", "dateText", "expiryText", "amount"]),
        "detailRows": table_records(detail_rows, ["quote_no", "seller", "client_doc", "client", "status_bucket", "dateText", "product_code", "commercial_code", "product", "product_base", "family", "quantity", "amount"]),
    }


def read_price_stock(sales_lines=None, latest_year=None):
    if not PRICE_FILE.exists() or not KARDEX_FILE.exists():
        return {}
    stock = pd.read_excel(KARDEX_FILE, sheet_name=0, header=3)
    stock["productCode"] = stock["Cod. Producto"].map(clean_text)
    stock["commercialCode"] = stock["Cod. Comercial"].map(clean_text)
    stock["productName"] = stock["Nombre Producto"].map(clean_text)
    stock["stock"] = stock["Cant. Saldo"].map(money)
    stock["stockCost"] = stock["Costo Saldo"].map(money)
    stock["avgCost"] = stock.apply(lambda row: row["stockCost"] / row["stock"] if abs(row["stock"]) > 0.0001 else 0, axis=1)
    stock_lookup = {
        row["productCode"]: {
            "stock": roundn(row["stock"]),
            "stockCost": roundn(row["stockCost"]),
            "avgCost": roundn(row["avgCost"]),
            "stockCommercialCode": row["commercialCode"],
            "stockProductName": row["productName"],
        }
        for _, row in stock.iterrows()
        if row["productCode"]
    }
    warehouse_lookup = {}
    warehouse_columns = []
    if WAREHOUSE_STOCK_FILE.exists():
        warehouse_stock = pd.read_excel(WAREHOUSE_STOCK_FILE, sheet_name=0, header=3)
        warehouse_stock["productCode"] = warehouse_stock["Codigo"].map(clean_text)
        warehouse_columns = [
            col
            for col in warehouse_stock.columns
            if isinstance(col, str) and re.match(r"^A\d{2}-", col)
        ]
        for _, row in warehouse_stock.iterrows():
            product_code = row["productCode"]
            if not product_code:
                continue
            warehouses = []
            for col in warehouse_columns:
                qty = money(row.get(col, 0))
                if abs(qty) > 0.0001:
                    warehouses.append({"warehouse": col, "stock": roundn(qty)})
            warehouse_lookup[product_code] = warehouses

    price_raw = pd.read_excel(PRICE_FILE, sheet_name="PRECIOS DE PRODUCTOS", header=6)
    rows = []
    current = {}
    for _, row in price_raw.iterrows():
        level = int(money(row.get("Nivel", 0)))
        code = clean_text(row.get("Código Producto", ""), "")
        if not code:
            continue
        if level == 1:
            current = {
                "productCode": code,
                "commercialCode": clean_text(row.get("Código Comercial", ""), ""),
                "productName": clean_text(row.get("Nombre", ""), ""),
            }
            continue
        if level != 2:
            continue
        if not current or current.get("productCode") != code:
            current = {"productCode": code, "commercialCode": "", "productName": ""}
        value_sale = money(row.get("Valor Venta", 0))
        total_sale = money(row.get("Precio Venta", 0))
        stock_item = stock_lookup.get(code, {})
        commercial = current.get("commercialCode") or stock_item.get("stockCommercialCode", "")
        product_name = current.get("productName") or stock_item.get("stockProductName", "")
        rows.append(
            {
                "productCode": code,
                "commercialCode": commercial,
                "productName": product_name,
                "priceList": clean_text(row.get("Descripción Precio", ""), "Sin lista"),
                "valueSale": roundn(value_sale),
                "igv": roundn(max(0, total_sale - value_sale)),
                "totalSale": roundn(total_sale),
                "stock": stock_item.get("stock", 0),
                "warehouseStock": warehouse_lookup.get(code, []),
                "warehouseStockText": " · ".join(
                    f"{item['warehouse'].split('-', 1)[0]} {number_text(item['stock'])}"
                    for item in warehouse_lookup.get(code, [])
                ),
                "avgCost": stock_item.get("avgCost", 0),
            }
        )
    rows = sorted(rows, key=lambda item: (item["priceList"], item["productName"], item["productCode"]))
    sold_lookup = {}
    if sales_lines is not None and latest_year:
        sold_frame = sales_lines[sales_lines["year"] == latest_year].copy()
        if not sold_frame.empty:
            sold_group = (
                sold_frame.groupby("Codigo", as_index=False)
                .agg(last_sale=("fecha", "max"), sold_amount=("line_total", "sum"), sold_qty=("quantity", "sum"))
            )
            sold_lookup = {
                clean_text(row["Codigo"]): {
                    "lastSale": row["last_sale"].strftime("%Y-%m-%d") if pd.notna(row["last_sale"]) else "",
                    "soldAmount": roundn(row["sold_amount"]),
                    "soldQty": roundn(row["sold_qty"]),
                }
                for _, row in sold_group.iterrows()
            }
            existing_codes = {item["productCode"] for item in rows}
            product_ref = (
                sold_frame.sort_values("fecha")
                .groupby("Codigo", as_index=False)
                .agg(
                    commercialCode=("Cod. Comercial", lambda s: clean_text(s.dropna().iloc[-1], "") if len(s.dropna()) else ""),
                    productName=("product", lambda s: clean_text(s.dropna().iloc[-1], "") if len(s.dropna()) else ""),
                )
            )
            for _, ref in product_ref.iterrows():
                code = clean_text(ref["Codigo"])
                if not code or code in existing_codes:
                    continue
                sold = sold_lookup.get(code, {})
                rows.append(
                    {
                        "productCode": code,
                        "commercialCode": ref["commercialCode"],
                        "productName": ref["productName"],
                        "priceList": "Sin precio vigente",
                        "valueSale": 0,
                        "igv": 0,
                        "totalSale": 0,
                        "stock": 0,
                        "warehouseStock": [],
                        "warehouseStockText": "",
                        "avgCost": 0,
                        "lastSale": sold.get("lastSale", ""),
                        "soldAmount2026": sold.get("soldAmount", 0),
                        "soldQty2026": sold.get("soldQty", 0),
                    }
                )
    for item in rows:
        sold = sold_lookup.get(item["productCode"], {})
        item["lastSale"] = sold.get("lastSale", item.get("lastSale", ""))
        item["soldAmount2026"] = sold.get("soldAmount", item.get("soldAmount2026", 0))
        item["soldQty2026"] = sold.get("soldQty", item.get("soldQty2026", 0))
    rows = sorted(rows, key=lambda item: (item["priceList"], item["productName"], item["productCode"]))
    total_stock = sum(item["stock"] for item in rows if item["stock"])
    with_stock = sum(1 for item in rows if item["stock"] > 0)
    return {
        "sourceFiles": [PRICE_FILE.name, KARDEX_FILE.name] + ([WAREHOUSE_STOCK_FILE.name] if WAREHOUSE_STOCK_FILE.exists() else []),
        "rows": rows,
        "summary": {
            "priceRows": len(rows),
            "products": len({item["productCode"] for item in rows}),
            "withStock": with_stock,
            "soldThisYear": sum(1 for item in rows if item.get("lastSale")),
            "totalStock": roundn(total_stock),
            "priceLists": sorted({item["priceList"] for item in rows}),
            "warehouses": warehouse_columns,
        },
    }


def number_text(value):
    value = float(value or 0)
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def clean_json(value):
    if pd.isna(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, (float, int)):
        return roundn(value)
    return value


def dormant_segment(last_4, best_year, days_since):
    if best_year >= 50000 and last_4 <= best_year * 0.15 and days_since > 120:
        return "Dormido alto valor"
    if best_year >= 20000 and last_4 <= best_year * 0.25 and days_since > 120:
        return "Dormido medio valor"
    if best_year >= 10000 and last_4 <= best_year * 0.4 and days_since > 120:
        return "Caida relevante"
    return "Cartera activa"


def recovery_action(segment, top_family, days_since):
    if segment == "Dormido alto valor":
        return f"Recuperacion ejecutiva: revisar historial de {top_family}, contactar decisor y ofrecer reposicion con condicion por recompra"
    if segment == "Dormido medio valor":
        return f"Reactivacion comercial: llamada con ultimo mix de {top_family}, detectar proveedor actual y cotizar pedido puente"
    if segment == "Caida relevante":
        return f"Defensa de cuenta: validar motivo de caida en {top_family}, ajustar frecuencia y proponer complemento"
    if days_since > 90:
        return "Seguimiento preventivo: confirmar proxima obra o reposicion"
    return "Mantener cadencia y buscar venta cruzada"


def read_sources():
    sales_frames = []
    line_frames = []
    missing_detail_files = []
    for file in FILES:
        sheet_names = pd.ExcelFile(file).sheet_names
        sales_sheet = "Ventas" if "Ventas" in sheet_names else sheet_names[0]
        detail_sheet = "Ventas Detallado" if "Ventas Detallado" in sheet_names else None
        sales_header = find_header_row(file, sales_sheet)
        sales = pd.read_excel(file, sheet_name=sales_sheet, header=sales_header)
        if "Codigo Venta" not in sales.columns:
            sales["Codigo Venta"] = (
                sales.get("Registro Ctb.", "").map(clean_text)
                + "-"
                + sales.get("Serie", "").map(clean_text)
                + "-"
                + sales.get("Numero", "").map(clean_text)
            )
        sales["source_file"] = file.name
        sales_frames.append(sales)
        if detail_sheet:
            lines_header = find_header_row(file, detail_sheet)
            lines = pd.read_excel(file, sheet_name=detail_sheet, header=lines_header)
            lines["source_file"] = file.name
            line_frames.append(lines)
        else:
            missing_detail_files.append(file.name)
    sales = pd.concat(sales_frames, ignore_index=True)
    lines = pd.concat(line_frames, ignore_index=True) if line_frames else pd.DataFrame()
    return sales, lines, missing_detail_files


def find_header_row(file, sheet_name):
    probe = pd.read_excel(file, sheet_name=sheet_name, header=None, nrows=12)
    for idx, row in probe.iterrows():
        values = [clean_text(v, "") for v in row.tolist()]
        if "Codigo Venta" in values:
            return idx
    return 5


def read_clients():
    if not CLIENT_FILE.exists():
        return {}
    raw = pd.read_excel(CLIENT_FILE, sheet_name=0, header=None)
    header_idx = 0
    for idx, row in raw.head(10).iterrows():
        values = [clean_text(v, "") for v in row.tolist()]
        if "Teléfono 1" in values and "Correo" in values:
            header_idx = idx
            break
    raw.columns = [clean_text(c, "") for c in raw.iloc[header_idx].tolist()]
    raw = raw.iloc[header_idx + 1 :].copy()
    records = {}
    for _, row in raw.iterrows():
        doc = clean_doc(row.get("Nro. Doc.", ""))
        if not doc:
            continue
        razon = clean_text(row.get("Razón Social", ""), "")
        full_name = " ".join(
            part
            for part in [
                clean_text(row.get("Nombres", ""), ""),
                clean_text(row.get("Ap. Paterno", ""), ""),
                clean_text(row.get("Ap. Materno", ""), ""),
            ]
            if part
        ).strip()
        contact = razon or full_name
        phone_1 = clean_phone(row.get("Teléfono 1", ""))
        phone_2 = clean_phone(row.get("Teléfono 2", ""))
        email = clean_text(row.get("Correo", ""), "")
        records[doc] = {
            "clientCode": clean_text(row.get("Código", ""), ""),
            "tradeName": clean_text(row.get("Nom. Comercial", ""), ""),
            "contact": contact,
            "phone": phone_1 or phone_2,
            "phone1": phone_1,
            "phone2": phone_2,
            "fax": clean_phone(row.get("Fax", "")),
            "email": email,
            "address": clean_text(row.get("Dirección", ""), ""),
            "status": clean_text(row.get("Estado", ""), ""),
        }
    return records


def read_clients():
    records = {}
    for file in CLIENT_FILES:
        if not file.exists():
            continue
        raw = pd.read_excel(file, sheet_name=0, header=None)
        header_idx = 0
        for idx, row in raw.head(12).iterrows():
            values = [clean_text(v, "") for v in row.tolist()]
            if ("Teléfono 1" in values or "TelÃ©fono 1" in values) and "Correo" in values:
                header_idx = idx
                break
        raw.columns = [clean_text(c, "") for c in raw.iloc[header_idx].tolist()]
        raw = raw.iloc[header_idx + 1 :].copy()
        for _, row in raw.iterrows():
            doc = clean_doc(row_value(row, "Nro. Doc."))
            if not doc:
                continue
            razon = row_value(row, "Razón Social", "RazÃ³n Social")
            full_name = " ".join(
                part
                for part in [
                    row_value(row, "Nombres"),
                    row_value(row, "Ap. Paterno"),
                    row_value(row, "Ap. Materno"),
                ]
                if part
            ).strip()
            contact = razon or full_name
            phone_1 = clean_phone(row_value(row, "Teléfono 1", "TelÃ©fono 1"))
            phone_2 = clean_phone(row_value(row, "Teléfono 2", "TelÃ©fono 2"))
            incoming = {
                "clientCode": row_value(row, "Código", "CÃ³digo"),
                "tradeName": row_value(row, "Nom. Comercial"),
                "contact": contact,
                "phone": phone_1 or phone_2,
                "phone1": phone_1,
                "phone2": phone_2,
                "fax": clean_phone(row_value(row, "Fax")),
                "email": row_value(row, "Correo"),
                "address": row_value(row, "Dirección", "DirecciÃ³n"),
                "seller": row_value(row, "Vendedor"),
                "status": row_value(row, "Estado"),
                "entryDate": pd.to_datetime(row.get("Fecha Ingreso", None), errors="coerce").strftime("%Y-%m-%d")
                if pd.notna(pd.to_datetime(row.get("Fecha Ingreso", None), errors="coerce"))
                else "",
                "source": file.name,
            }
            records[doc] = merge_contact(records.get(doc), incoming)
    return records


def build():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logo_src = Path(r"C:\Users\Lenin Cabrera\Downloads\isaval-global-logo.png")
    if logo_src.exists():
        shutil.copy2(logo_src, ASSET_DIR / "isaval-global-logo.png")

    contacts = read_clients()
    sales, lines, missing_detail_files = read_sources()
    sales = sales[pd.notna(sales["Codigo Venta"])].copy()
    lines = lines[pd.notna(lines["Codigo Venta"])].copy()

    sales["fecha"] = pd.to_datetime(sales["Fecha Emi."], errors="coerce")
    sales["year"] = sales["fecha"].dt.year.fillna(sales["Ejercicio"]).astype(int)
    sales["quarter"] = sales["fecha"].dt.quarter.fillna(((sales["Periodo"].astype(int) - 1) // 3) + 1).astype(int)
    sales["month"] = sales["fecha"].dt.month.fillna(sales["Periodo"]).astype(int)
    sales["period_key"] = sales["year"].astype(str) + "-Q" + sales["quarter"].astype(str)
    sales["client_doc"] = sales["Doc. Cliente"].map(clean_doc)
    sales["client"] = sales["Cliente"].map(clean_text)
    sales["seller"] = sales["Vendedor"].map(clean_text)
    sales["payment"] = sales["Forma Pago"].map(clean_text)
    sales["doc_type"] = sales["Tipo Doc."].map(clean_text)
    sales["total_sale"] = sales["Valor"].map(money)
    sales["value"] = sales["Valor"].map(money)
    sales["discount"] = sales["Descuento"].map(money) + sales["Descuento Fina."].map(money)
    sales["voucher_key"] = voucher_key_frame(sales)
    sales["is_cancelled"] = sales["Anulado"].astype(str).str.upper().str.contains("SI|SÍ|TRUE|ANUL", regex=True, na=False)
    sales = sales[~sales["is_cancelled"]].copy()
    before_dedup = len(sales)
    sales = sales.sort_values(["fecha", "source_file", "Codigo Venta"]).drop_duplicates("voucher_key", keep="last").copy()
    duplicate_vouchers_removed = before_dedup - len(sales)

    # Credit notes arrive positive in several historical exports. Force them negative in both header and detail.
    credit_mask = credit_note_mask(sales)
    sales.loc[credit_mask & (sales["total_sale"] > 0), "total_sale"] *= -1
    sales.loc[credit_mask & (sales["value"] > 0), "value"] *= -1
    sales["is_credit_note"] = credit_mask

    lines = lines.merge(
        sales[["Codigo Venta", "fecha", "year", "quarter", "period_key", "client_doc", "client", "seller", "is_credit_note"]],
        on="Codigo Venta",
        how="inner",
    )
    lines["month"] = lines["fecha"].dt.month.astype(int)
    lines["product"] = lines["Producto / Servicio"].map(clean_text)
    lines["family"] = lines["product"].map(classify_family)
    lines["product_base"] = lines["product"].map(product_base_name)
    lines["line_total"] = lines["Valor"].map(money)
    lines["quantity"] = lines["Cant"].map(money)
    product_credit_notes_adjusted = int(lines.loc[lines["is_credit_note"], "Codigo Venta"].nunique())
    lines.loc[lines["is_credit_note"] & (lines["line_total"] > 0), "line_total"] *= -1
    lines.loc[lines["is_credit_note"] & (lines["quantity"] > 0), "quantity"] *= -1
    if {"Codigo Venta", "Item", "Codigo"}.issubset(lines.columns):
        lines = lines.drop_duplicates(["Codigo Venta", "Item", "Codigo"], keep="last").copy()
    product_lines = lines.copy()

    latest_date = sales["fecha"].max()
    latest_year = int(latest_date.year)
    latest_quarter = int(latest_date.quarter)
    latest_month = int(latest_date.month)
    all_periods = [f"{year}-Q{quarter}" for year in range(2022, latest_year + 1) for quarter in range(1, 5)]
    periods = [
        p
        for p in all_periods
        if int(p[:4]) < latest_year or int(p[-1]) <= latest_quarter
    ]
    years = list(range(2022, latest_year + 1))
    completed_years = [year for year in years if year < latest_year]
    latest_period = f"{latest_year}-Q{latest_quarter}"

    period_sales = (
        sales.groupby(["client_doc", "client", "period_key"], as_index=False)
        .agg(total=("total_sale", "sum"), orders=("Codigo Venta", "nunique"))
    )
    client_base = (
        sales.groupby(["client_doc", "client"], as_index=False)
        .agg(
            total=("total_sale", "sum"),
            orders=("Codigo Venta", "nunique"),
            first_purchase=("fecha", "min"),
            last_purchase=("fecha", "max"),
            seller=("seller", lambda s: s.mode().iat[0] if not s.mode().empty else clean_text(s.iloc[-1])),
            avg_ticket=("total_sale", "mean"),
            discount=("discount", "sum"),
        )
    )
    yearly = sales.groupby(["client_doc", "client", "year"], as_index=False).agg(total=("total_sale", "sum"))
    product_mix = (
        lines.groupby(["client_doc", "client", "family"], as_index=False)
        .agg(total=("line_total", "sum"), units=("quantity", "sum"))
        .sort_values(["client_doc", "total"], ascending=[True, False])
    )
    client_products = (
        lines.groupby(["client_doc", "client", "Codigo", "Cod. Comercial", "product", "family"], as_index=False)
        .agg(quantity=("quantity", "sum"), total=("line_total", "sum"), orders=("Codigo Venta", "nunique"))
        .sort_values(["client_doc", "total"], ascending=[True, False])
    )
    period_lookup = {
        key: group.to_dict("records")
        for key, group in period_sales.groupby(["client_doc", "client"], sort=False)
    }
    yearly_lookup = {
        key: group.to_dict("records")
        for key, group in yearly.groupby(["client_doc", "client"], sort=False)
    }
    mix_lookup = {
        key: group.head(3).to_dict("records")
        for key, group in product_mix.groupby(["client_doc", "client"], sort=False)
    }
    product_lookup = {
        key: group.head(80).to_dict("records")
        for key, group in client_products.groupby(["client_doc", "client"], sort=False)
    }

    clients = []
    for _, row in client_base.iterrows():
        doc = row["client_doc"]
        name = row["client"]
        key = (doc, name)
        q = {p: 0.0 for p in periods}
        q_orders = {p: 0 for p in periods}
        for prow in period_lookup.get(key, []):
            q[prow["period_key"]] = roundn(prow["total"])
            q_orders[prow["period_key"]] = int(prow["orders"])
        y = {str(year): 0.0 for year in years}
        for yrow in yearly_lookup.get(key, []):
            y[str(int(yrow["year"]))] = roundn(yrow["total"])

        last_4 = sum(q[p] for p in periods[-4:])
        prev_4 = sum(q[p] for p in periods[-8:-4])
        trend = pct_change(last_4, prev_4)
        active_quarters = sum(1 for p in periods if abs(q[p]) >= 1)
        last_date = row["last_purchase"]
        days_since = int((sales["fecha"].max() - last_date).days) if pd.notna(last_date) else 9999
        best_period = max(q, key=q.get) if q else ""
        best_quarter = max(q.values()) if q else 0
        best_year = max([y[str(year)] for year in completed_years] or list(y.values()) or [0])
        avg_active_quarter = row["total"] / active_quarters if active_quarters else 0
        drop_from_best_year = pct_change(last_4, best_year)

        mix_rows = mix_lookup.get(key, [])
        mix = [{"family": r["family"], "total": roundn(r["total"])} for r in mix_rows]
        top_family = mix[0]["family"] if mix else "Sin mix"
        product_rows = product_lookup.get(key, [])
        products = [
            {
                "code": clean_text(r["Codigo"]),
                "commercialCode": clean_text(r["Cod. Comercial"], ""),
                "name": r["product"],
                "family": r["family"],
                "quantity": roundn(r["quantity"]),
                "total": roundn(r["total"]),
                "orders": int(r["orders"]),
            }
            for r in product_rows
        ]

        segment = dormant_segment(last_4, best_year, days_since)
        if segment in ["Dormido alto valor", "Dormido medio valor", "Caida relevante"]:
            recovery_value = max(0, best_year - last_4)
        else:
            recovery_value = max(0, prev_4 - last_4)
        dormant_score = 0
        dormant_score += min(35, best_year / 2500)
        dormant_score += min(25, max(0, days_since - 60) / 12)
        dormant_score += min(25, recovery_value / 2500)
        dormant_score += 15 if last_4 <= best_year * 0.1 and best_year > 0 else 0
        dormant_score = min(100, int(round(dormant_score)))
        contact = contacts.get(clean_doc(doc), {})

        recent = last_4 > 0
        had_previous = prev_4 > 0
        if segment in ["Dormido alto valor", "Dormido medio valor"]:
            stage = "Recuperar"
            action = recovery_action(segment, top_family, days_since)
            priority = 96 if segment == "Dormido alto valor" else 90
        elif days_since > 180 and (had_previous or best_year >= 10000):
            stage = "Recuperar"
            action = recovery_action(segment, top_family, days_since)
            priority = 86
        elif trend is not None and trend <= -0.35 and had_previous:
            stage = "Defender"
            action = recovery_action(segment, top_family, days_since)
            priority = 82
        elif recent and (trend is not None and trend >= 0.25):
            stage = "Expandir"
            action = "Proponer venta cruzada y mayor cobertura"
            priority = 70
        elif recent:
            stage = "Mantener"
            action = "Seguimiento de recurrencia y proximo pedido"
            priority = 55
        else:
            stage = "Prospectar"
            action = "Validar contacto y necesidad actual"
            priority = 45

        if last_4 >= 10000:
            priority += 8
        if recovery_value >= 5000:
            priority += 7
        if segment == "Dormido alto valor":
            priority += 10
        if dormant_score >= 80:
            priority += 5
        priority = min(100, priority)

        clients.append(
            {
                "id": safe_id(f"{doc}-{name}"),
                "doc": doc,
                "name": name,
                "seller": row["seller"],
                "contact": contact,
                "stage": stage,
                "action": action,
                "priority": int(priority),
                "total": roundn(row["total"]),
                "last4": roundn(last_4),
                "prev4": roundn(prev_4),
                "trend": roundn(trend, 4),
                "recoveryValue": roundn(recovery_value),
                "bestYear": roundn(best_year),
                "bestQuarter": roundn(best_quarter),
                "bestPeriod": best_period,
                "dropFromBestYear": roundn(drop_from_best_year, 4),
                "avgActiveQuarter": roundn(avg_active_quarter),
                "dormantSegment": segment,
                "dormantScore": dormant_score,
                "orders": int(row["orders"]),
                "avgTicket": roundn(row["avg_ticket"]),
                "discount": roundn(row["discount"]),
                "activeQuarters": active_quarters,
                "lastPurchase": last_date.strftime("%Y-%m-%d") if pd.notna(last_date) else "",
                "daysSince": days_since,
                "topFamily": top_family,
                "quarterly": q,
                "quarterOrders": q_orders,
                "yearly": y,
                "mix": mix,
                "products": products,
            }
        )

    clients = sorted(clients, key=lambda c: (c["priority"], c["recoveryValue"], c["last4"]), reverse=True)

    quarterly = (
        sales.groupby(["period_key"], as_index=False)
        .agg(total=("total_sale", "sum"), orders=("Codigo Venta", "nunique"), clients=("client_doc", "nunique"))
    )
    quarterly_map = {row["period_key"]: row for _, row in quarterly.iterrows()}
    timeline = [
        {
            "period": p,
            "total": roundn(quarterly_map[p]["total"]) if p in quarterly_map else 0,
            "orders": int(quarterly_map[p]["orders"]) if p in quarterly_map else 0,
            "clients": int(quarterly_map[p]["clients"]) if p in quarterly_map else 0,
        }
        for p in periods
    ]
    quarter_comparison = []
    for quarter in range(1, 5):
        row = {"quarter": f"Q{quarter}"}
        for year in years:
            key = f"{year}-Q{quarter}"
            row[str(year)] = roundn(quarterly_map[key]["total"]) if key in quarterly_map else 0
        quarter_comparison.append(row)

    month_names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    months_ytd = list(range(1, latest_month + 1))

    def monthly_rows(frame, group_cols, label_cols, total_col, top_n=20):
        year_frame = frame[frame["year"] == latest_year].copy()
        monthly = year_frame.groupby(group_cols + ["month"], as_index=False).agg(total=(total_col, "sum"))
        totals = year_frame.groupby(group_cols, as_index=False).agg(total=(total_col, "sum")).sort_values("total", ascending=False).head(top_n)
        rows = []
        for _, item in totals.iterrows():
            mask = True
            for col in group_cols:
                mask = mask & (monthly[col] == item[col])
            item_months = {str(m): 0.0 for m in months_ytd}
            for _, mrow in monthly[mask].iterrows():
                item_months[str(int(mrow["month"]))] = roundn(mrow["total"])
            row = {
                "total": roundn(item["total"]),
                "months": item_months,
            }
            for source_col, output_col in label_cols:
                row[output_col] = clean_text(item[source_col])
            rows.append(row)
        return rows

    current_month_sales = sales[(sales["year"] == latest_year) & (sales["month"] == latest_month)]
    current_month_product_lines = product_lines[(product_lines["year"] == latest_year) & (product_lines["month"] == latest_month)]
    monthly_summary = {
        "year": latest_year,
        "latestMonth": latest_month,
        "latestMonthName": month_names[latest_month - 1],
        "months": [{"number": m, "name": month_names[m - 1]} for m in months_ytd],
        "monthTotal": roundn(current_month_sales["total_sale"].sum()),
        "sellerRows": monthly_rows(sales, ["seller"], [("seller", "name")], "total_sale", 20),
        "clientRows": monthly_rows(sales, ["client_doc", "client"], [("client", "name"), ("client_doc", "doc")], "total_sale", 20),
        "productRows": monthly_rows(product_lines, ["product_base", "family"], [("product_base", "name"), ("family", "family")], "line_total", 20),
        "currentMonthSellers": [
            {"name": r["seller"], "total": roundn(r["total"])}
            for _, r in current_month_sales.groupby("seller", as_index=False).agg(total=("total_sale", "sum")).sort_values("total", ascending=False).head(10).iterrows()
        ],
        "currentMonthClients": [
            {"name": r["client"], "doc": r["client_doc"], "total": roundn(r["total"])}
            for _, r in current_month_sales.groupby(["client_doc", "client"], as_index=False).agg(total=("total_sale", "sum")).sort_values("total", ascending=False).head(10).iterrows()
        ],
        "currentMonthProducts": [
            {"name": r["product_base"], "family": r["family"], "total": roundn(r["total"])}
            for _, r in current_month_product_lines.groupby(["product_base", "family"], as_index=False).agg(total=("line_total", "sum")).sort_values("total", ascending=False).head(10).iterrows()
        ],
    }
    monthly_comparison = []
    monthly_sales = sales.groupby(["year", "month"], as_index=False).agg(total=("total_sale", "sum"))
    monthly_sales_lookup = {(int(r["year"]), int(r["month"])): roundn(r["total"]) for _, r in monthly_sales.iterrows()}
    for month_number, month_name in enumerate(month_names, start=1):
        row = {"month": month_name, "monthNumber": month_number}
        for year in years:
            is_future = year == latest_year and month_number > latest_month
            row[str(year)] = None if is_future else monthly_sales_lookup.get((year, month_number), 0)
        monthly_comparison.append(row)

    sellers = []
    seller_group = sales.groupby("seller", as_index=False).agg(total=("total_sale", "sum"), orders=("Codigo Venta", "nunique"), clients=("client_doc", "nunique"))
    for _, row in seller_group.sort_values("total", ascending=False).iterrows():
        seller_clients = [c for c in clients if c["seller"] == row["seller"]]
        sellers.append(
            {
                "seller": row["seller"],
                "total": roundn(row["total"]),
                "orders": int(row["orders"]),
                "clients": int(row["clients"]),
                "atRisk": sum(1 for c in seller_clients if c["stage"] in ["Recuperar", "Defender"]),
                "recoveryValue": roundn(sum(c["recoveryValue"] for c in seller_clients)),
            }
        )

    families = (
        product_lines.groupby("family", as_index=False)
        .agg(total=("line_total", "sum"), units=("quantity", "sum"), products=("product", "nunique"))
        .sort_values("total", ascending=False)
    )
    family_rows = [
        {"family": r["family"], "total": roundn(r["total"]), "units": roundn(r["units"]), "products": int(r["products"])}
        for _, r in families.iterrows()
    ]

    top_products = (
        product_lines.groupby(["product", "family"], as_index=False)
        .agg(total=("line_total", "sum"), units=("quantity", "sum"), clients=("client_doc", lambda s: s[s.astype(str).str.len() > 0].nunique()))
        .sort_values("total", ascending=False)
        .head(60)
    )
    product_rows = [
        {"product": r["product"], "family": r["family"], "total": roundn(r["total"]), "units": roundn(r["units"]), "clients": int(r["clients"])}
        for _, r in top_products.iterrows()
    ]

    all_product_groups = (
        product_lines.groupby(["product_base", "family"], as_index=False)
        .agg(
            total=("line_total", "sum"),
            units=("quantity", "sum"),
            clients=("client_doc", lambda s: s[s.astype(str).str.len() > 0].nunique()),
            codes=("Codigo", "nunique"),
            presentations=("product", "nunique"),
        )
        .sort_values("total", ascending=False)
    )
    top_product_groups = all_product_groups.head(20)
    product_group_buyers = (
        lines.groupby(["product_base", "family", "client_doc", "client"], as_index=False)
        .agg(
            total=("line_total", "sum"),
            quantity=("quantity", "sum"),
            orders=("Codigo Venta", "nunique"),
            last_purchase=("fecha", "max"),
        )
        .sort_values(["product_base", "total"], ascending=[True, False])
    )
    product_group_buyer_lookup = {
        (product_base, family): group.head(200).to_dict("records")
        for (product_base, family), group in product_group_buyers.groupby(["product_base", "family"], sort=False)
    }
    product_group_yearly = (
        product_lines.groupby(["product_base", "family", "year"], as_index=False)
        .agg(total=("line_total", "sum"), units=("quantity", "sum"), orders=("Codigo Venta", "nunique"), clients=("client_doc", lambda s: s[s.astype(str).str.len() > 0].nunique()))
    )
    product_group_yearly_lookup = {}
    for (product_base, family), group in product_group_yearly.groupby(["product_base", "family"], sort=False):
        product_group_yearly_lookup[(product_base, family)] = {
            str(int(row["year"])): {
                "total": roundn(row["total"]),
                "units": roundn(row["units"]),
                "orders": int(row["orders"]),
                "clients": int(row["clients"]),
            }
            for _, row in group.iterrows()
        }
    top_product_group_rows = [
        {
            "id": safe_id(f"{r['family']}-{r['product_base']}"),
            "product": r["product_base"],
            "family": r["family"],
            "total": roundn(r["total"]),
            "units": roundn(r["units"]),
            "clients": int(r["clients"]),
            "codes": int(r["codes"]),
            "presentations": int(r["presentations"]),
            "yearly": product_group_yearly_lookup.get((r["product_base"], r["family"]), {}),
            "buyers": [
                {
                    "clientId": safe_id(f"{buyer['client_doc']}-{buyer['client']}"),
                    "doc": buyer["client_doc"],
                    "name": buyer["client"],
                    "total": roundn(buyer["total"]),
                    "quantity": roundn(buyer["quantity"]),
                    "orders": int(buyer["orders"]),
                    "lastPurchase": buyer["last_purchase"].strftime("%Y-%m-%d") if pd.notna(buyer["last_purchase"]) else "",
                }
                for buyer in product_group_buyer_lookup.get((r["product_base"], r["family"]), [])
            ],
        }
        for _, r in top_product_groups.iterrows()
    ]
    product_group_rows = [
        {
            "id": safe_id(f"{r['family']}-{r['product_base']}"),
            "product": r["product_base"],
            "family": r["family"],
            "total": roundn(r["total"]),
            "units": roundn(r["units"]),
            "clients": int(r["clients"]),
            "codes": int(r["codes"]),
            "presentations": int(r["presentations"]),
            "yearly": product_group_yearly_lookup.get((r["product_base"], r["family"]), {}),
            "buyers": [
                {
                    "clientId": safe_id(f"{buyer['client_doc']}-{buyer['client']}"),
                    "doc": buyer["client_doc"],
                    "name": buyer["client"],
                    "total": roundn(buyer["total"]),
                    "quantity": roundn(buyer["quantity"]),
                    "orders": int(buyer["orders"]),
                    "lastPurchase": buyer["last_purchase"].strftime("%Y-%m-%d") if pd.notna(buyer["last_purchase"]) else "",
                }
                for buyer in product_group_buyer_lookup.get((r["product_base"], r["family"]), [])
            ],
        }
        for _, r in all_product_groups.iterrows()
    ]

    top_clients = [
        {
            "id": c["id"],
            "name": c["name"],
            "doc": c["doc"],
            "seller": c["seller"],
            "total": c["total"],
            "orders": c["orders"],
            "lastPurchase": c["lastPurchase"],
            "topFamily": c["topFamily"],
        }
        for c in sorted(clients, key=lambda c: c["total"], reverse=True)[:20]
    ]

    sales_2026_by_doc = (
        sales[sales["year"] == latest_year]
        .groupby("client_doc", as_index=False)
        .agg(sales=("total_sale", "sum"), orders=("Codigo Venta", "nunique"), last_purchase=("fecha", "max"))
    )
    sales_2026_lookup = {
        row["client_doc"]: {
            "sales": roundn(row["sales"]),
            "orders": int(row["orders"]),
            "lastPurchase": row["last_purchase"].strftime("%Y-%m-%d") if pd.notna(row["last_purchase"]) else "",
        }
        for _, row in sales_2026_by_doc.iterrows()
    }
    new_client_items = []
    for doc, contact in contacts.items():
        entry_date = pd.to_datetime(contact.get("entryDate", ""), errors="coerce")
        if pd.isna(entry_date) or int(entry_date.year) != latest_year:
            continue
        sold = sales_2026_lookup.get(doc, {"sales": 0, "orders": 0, "lastPurchase": ""})
        seller = clean_text(contact.get("seller", ""), "Sin comercial")
        name = clean_text(contact.get("contact", ""), "") or clean_text(contact.get("tradeName", ""), "") or doc
        new_client_items.append(
            {
                "id": safe_id(f"{doc}-{name}"),
                "doc": doc,
                "name": name,
                "seller": seller,
                "entryDate": entry_date.strftime("%Y-%m-%d"),
                "phone": contact.get("phone", ""),
                "email": contact.get("email", ""),
                "sold": sold["sales"] > 0,
                "sales": sold["sales"],
                "orders": sold["orders"],
                "lastPurchase": sold["lastPurchase"],
            }
        )
    new_client_summary = []
    for seller, group in pd.DataFrame(new_client_items).groupby("seller") if new_client_items else []:
        records = group.to_dict("records")
        sold_records = [item for item in records if item["sold"]]
        new_client_summary.append(
            {
                "seller": seller,
                "registered": len(records),
                "soldClients": len(sold_records),
                "conversionRate": roundn(len(sold_records) / len(records), 4) if records else 0,
                "sales": roundn(sum(item["sales"] for item in records)),
                "orders": int(sum(item["orders"] for item in records)),
                "clients": sorted(records, key=lambda item: (item["sold"], item["sales"], item["entryDate"]), reverse=True),
            }
        )
    new_client_summary = sorted(new_client_summary, key=lambda item: (item["soldClients"], item["sales"], item["registered"]), reverse=True)
    new_clients_2026 = {
        "year": latest_year,
        "totalRegistered": len(new_client_items),
        "soldClients": sum(1 for item in new_client_items if item["sold"]),
        "sales": roundn(sum(item["sales"] for item in new_client_items)),
        "bySeller": new_client_summary,
    }

    total_sales = sales["total_sale"].sum()
    total_latest_year = sales[sales["year"] == latest_year]["total_sale"].sum()
    same_quarters_previous = sales[
        (sales["year"] == latest_year - 1) & (sales["quarter"] <= latest_quarter)
    ]["total_sale"].sum()
    summary = {
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "latestPeriod": latest_period,
        "periodLabel": f"2022 Q1 - {latest_year} Q{latest_quarter}",
        "sourceFiles": [f.name for f in FILES],
        "missingDetailFiles": missing_detail_files,
        "duplicateVouchersRemoved": int(duplicate_vouchers_removed),
        "correctedProductSource": "",
        "productCreditNotesAdjusted": product_credit_notes_adjusted,
        "totalSales": roundn(total_sales),
        "salesLatestYear": roundn(total_latest_year),
        "latestYear": latest_year,
        "latestQuarter": latest_quarter,
        "latestMonth": latest_month,
        "growthLatestYtd": roundn(pct_change(total_latest_year, same_quarters_previous), 4),
        "orders": int(sales["Codigo Venta"].nunique()),
        "clients": int(sales["client_doc"].nunique()),
        "activeClientsLatestYear": int(sales[sales["year"] == latest_year]["client_doc"].nunique()),
        "recoverClients": sum(1 for c in clients if c["stage"] == "Recuperar"),
        "defendClients": sum(1 for c in clients if c["stage"] == "Defender"),
        "expandClients": sum(1 for c in clients if c["stage"] == "Expandir"),
        "dormantHighValueClients": sum(1 for c in clients if c["dormantSegment"] == "Dormido alto valor"),
        "dormantMidValueClients": sum(1 for c in clients if c["dormantSegment"] == "Dormido medio valor"),
        "recoveryPipeline": roundn(sum(c["recoveryValue"] for c in clients)),
        "highValueRecoveryPipeline": roundn(
            sum(c["recoveryValue"] for c in clients if c["dormantSegment"] == "Dormido alto valor")
        ),
    }

    quotes_2026 = read_quotations_2026()
    price_stock = read_price_stock(product_lines, latest_year)

    payload = {
        "summary": summary,
        "periods": periods,
        "timeline": timeline,
        "quarterComparison": quarter_comparison,
        "monthlySummary": monthly_summary,
        "monthlyComparison": monthly_comparison,
        "years": years,
        "clients": clients,
        "sellers": sellers,
        "families": family_rows,
        "products": product_rows,
        "productGroups": product_group_rows,
        "topProductGroups": top_product_group_rows,
        "topClients": top_clients,
        "newClients2026": new_clients_2026,
        "quotes2026": quotes_2026,
        "priceStock": price_stock,
    }
    json_payload = json.dumps(payload, ensure_ascii=False, indent=2)
    (DATA_DIR / "crm-data.json").write_text(json_payload, encoding="utf-8")
    (DATA_DIR / "crm-data.js").write_text(f"window.CRM_DATA = {json_payload};\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
