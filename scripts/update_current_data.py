import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CRM_JSON = DATA_DIR / "crm-data.json"
CRM_JS = DATA_DIR / "crm-data.js"

SALES_MAY_FILE = Path(r"C:\Users\User\Downloads\Reporte de Ventas Periodo 01-05-2026 al 31-05-2026.xlsx")
QUOTE_MAY_FILE = Path(r"C:\Users\User\Downloads\Reporte de Cotizacion Periodo 01-05-2026 al 23-05-2026.xlsx")


def money(value):
    if pd.isna(value):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clean_text(value, fallback=""):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def clean_doc(value):
    text = clean_text(value, "")
    if text.endswith(".0"):
        text = text[:-2]
    return "".join(ch for ch in text if ch.isdigit()) or clean_text(value)


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


def roundn(value, digits=2):
    return round(float(value), digits)


def status_bucket(status):
    text = clean_text(status).lower()
    if "atendido" in text:
        return "Cerrada"
    if "expirado" in text:
        return "Expirada"
    return "Pendiente"


def read_json_payload(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_payload(payload):
    json_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    CRM_JSON.write_text(json_payload, encoding="utf-8")
    CRM_JS.write_text(f"window.CRM_DATA = {json_payload};\n", encoding="utf-8")


def read_may_sales():
    sales = pd.read_excel(SALES_MAY_FILE, sheet_name="Ventas", header=5)
    sales = sales[pd.notna(sales["Codigo Venta"])].copy()
    sales["fecha"] = pd.to_datetime(sales["Fecha Mov."], errors="coerce")
    sales = sales[sales["fecha"].dt.year.eq(2026) & sales["fecha"].dt.month.eq(5)].copy()
    values = sales["Valor"].map(money)
    doc_text = sales["Tipo Doc."].map(clean_text).str.upper()
    sunat = sales["Cod. TD. Sunat"].map(clean_text).str.replace(r"\.0$", "", regex=True)
    credit = doc_text.str.contains("NOTA DE CR|CREDITO|CRÉDITO", regex=True, na=False) | sunat.isin(["7", "07"])
    values.loc[credit & (values > 0)] *= -1
    sales["net_value"] = values
    sales["is_credit_note"] = credit
    return sales


def replace_month(rows, may_rows, key_fields, extra_fields=(), limit=20):
    by_key = {}
    for row in rows or []:
        key = tuple(row.get(field, "") for field in key_fields)
        months = {str(k): money(v) for k, v in (row.get("months") or {}).items()}
        months["5"] = 0.0
        by_key[key] = {**row, "months": months}

    for item in may_rows:
        key = tuple(item.get(field, "") for field in key_fields)
        if key not in by_key:
            by_key[key] = {
                **{field: item.get(field, "") for field in key_fields},
                **{field: item.get(field, "") for field in extra_fields},
                "months": {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0},
            }
        by_key[key]["months"]["5"] = roundn(item["value"])
        for field in extra_fields:
            by_key[key][field] = item.get(field, by_key[key].get(field, ""))

    updated = []
    for row in by_key.values():
        row["months"] = {str(i): roundn(row.get("months", {}).get(str(i), 0)) for i in range(1, 6)}
        row["total"] = roundn(sum(row["months"].values()))
        updated.append(row)
    return sorted(updated, key=lambda row: row["total"], reverse=True)[:limit]


def update_sales(payload):
    if not SALES_MAY_FILE.exists():
        return {"updated": False, "reason": "missing sales file"}

    sales = read_may_sales()
    new_may = roundn(sales["net_value"].sum())
    old_may = 0.0

    monthly_comparison = payload.get("monthlyComparison") or []
    for row in monthly_comparison:
        if int(row.get("monthNumber", 0) or 0) == 5:
            old_may = money(row.get("2026"))
            row["2026"] = new_may
            break

    delta = new_may - old_may
    summary = payload["summary"]
    summary["generatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    summary["latestMonth"] = 5
    summary["salesLatestYear"] = roundn(money(summary.get("salesLatestYear")) + delta)
    summary["totalSales"] = roundn(money(summary.get("totalSales")) + delta)
    summary["activeClientsLatestYear"] = int(max(summary.get("activeClientsLatestYear", 0), sales["Doc. Cliente"].map(clean_doc).nunique()))

    for item in payload.get("timeline", []):
        if item.get("period") == "2026-Q2":
            item["total"] = roundn(money(item.get("total")) + delta)
            item["clients"] = int(max(item.get("clients", 0), sales["Doc. Cliente"].map(clean_doc).nunique()))

    for row in payload.get("quarterComparison", []):
        if row.get("quarter") == "Q2":
            row["2026"] = roundn(money(row.get("2026")) + delta)

    monthly = payload.get("monthlySummary") or {}
    monthly["latestMonth"] = 5
    monthly["latestMonthName"] = "May"
    monthly["monthTotal"] = new_may
    monthly["months"] = [{"number": i, "name": name} for i, name in [(1, "Ene"), (2, "Feb"), (3, "Mar"), (4, "Abr"), (5, "May")]]

    seller_may = [
        {"name": row["Vendedor"], "value": row["net_value"]}
        for _, row in sales.groupby("Vendedor", as_index=False).agg(net_value=("net_value", "sum")).iterrows()
    ]
    monthly["sellerRows"] = replace_month(monthly.get("sellerRows"), seller_may, ["name"], limit=20)

    client_may = [
        {"doc": clean_doc(row["Doc. Cliente"]), "name": row["Cliente"], "value": row["net_value"]}
        for _, row in sales.groupby(["Doc. Cliente", "Cliente"], as_index=False).agg(net_value=("net_value", "sum")).iterrows()
    ]
    monthly["clientRows"] = replace_month(monthly.get("clientRows"), client_may, ["doc", "name"], limit=20)

    lines = pd.read_excel(SALES_MAY_FILE, sheet_name="Ventas Detallado", header=5)
    lines = lines[pd.notna(lines["Codigo Venta"])].copy()
    lines = lines.merge(sales[["Codigo Venta", "is_credit_note"]], on="Codigo Venta", how="inner")
    lines["line_total"] = lines["Valor"].map(money)
    lines.loc[lines["is_credit_note"] & (lines["line_total"] > 0), "line_total"] *= -1
    lines["product_base"] = lines["Producto / Servicio"].map(product_base_name)
    lines["family"] = lines["Producto / Servicio"].map(classify_family)
    product_may = [
        {"name": row["product_base"], "family": row["family"], "value": row["line_total"]}
        for _, row in lines.groupby(["product_base", "family"], as_index=False).agg(line_total=("line_total", "sum")).iterrows()
    ]
    monthly["productRows"] = replace_month(monthly.get("productRows"), product_may, ["name"], ["family"], limit=20)

    source_files = summary.setdefault("sourceFiles", [])
    if SALES_MAY_FILE.name not in source_files:
        source_files.append(SALES_MAY_FILE.name)

    return {"updated": True, "oldMay": old_may, "newMay": new_may, "delta": roundn(delta)}


def read_may_quotes():
    quotes = pd.read_excel(QUOTE_MAY_FILE, sheet_name="Cotizacion", header=5)
    quotes = quotes[pd.notna(quotes["Nro. Cot."])].copy()
    quotes["quote_no"] = quotes["Nro. Cot."].map(clean_text)
    quotes["date"] = pd.to_datetime(quotes["Fec. Emi."], dayfirst=True, errors="coerce")
    quotes["expiry"] = pd.to_datetime(quotes["Fec. Cad."], dayfirst=True, errors="coerce")
    quotes = quotes[quotes["date"].dt.year.eq(2026)].copy()
    quotes["seller"] = quotes["Nom. Vdr."].map(clean_text)
    quotes["client_doc"] = quotes["Nro. Clt."].map(clean_doc)
    quotes["client"] = quotes["Nom. Clt."].map(clean_text)
    quotes["status"] = quotes["Estado"].map(clean_text) if "Estado" in quotes.columns else "Elaborado"
    quotes["status_bucket"] = quotes["status"].map(status_bucket)
    quotes["amount"] = quotes["Valor"].map(money)
    quotes["dateText"] = quotes["date"].dt.strftime("%Y-%m-%d")
    quotes["expiryText"] = quotes["expiry"].dt.strftime("%Y-%m-%d")
    return quotes


def update_quotes(payload):
    if not QUOTE_MAY_FILE.exists():
        return {"updated": False, "reason": "missing quote file"}

    quote_block = payload.get("quotes2026") or {}
    existing = pd.DataFrame(quote_block.get("quoteRows") or [])
    new_quotes = read_may_quotes()
    new_rows = new_quotes[["quote_no", "seller", "client_doc", "client", "status", "status_bucket", "dateText", "expiryText", "amount"]].copy()
    if existing.empty:
        merged = new_rows
    else:
        merged = pd.concat([existing, new_rows], ignore_index=True)
        merged = merged.sort_values(["dateText", "quote_no"]).drop_duplicates("quote_no", keep="last")

    merged["amount"] = merged["amount"].map(money)
    merged["is_closed"] = merged["status_bucket"].eq("Cerrada")
    merged["is_expired"] = merged["status_bucket"].eq("Expirada")
    merged["is_pending"] = merged["status_bucket"].eq("Pendiente")

    total_quotes = int(merged["quote_no"].nunique())
    closed_quotes = int(merged.loc[merged["is_closed"], "quote_no"].nunique())
    expired_quotes = int(merged.loc[merged["is_expired"], "quote_no"].nunique())
    pending_quotes = int(merged.loc[merged["is_pending"], "quote_no"].nunique())
    total_amount = roundn(merged["amount"].sum())
    closed_amount = roundn(merged.loc[merged["is_closed"], "amount"].sum())
    close_rate = closed_quotes / total_quotes if total_quotes else 0
    high_open_threshold = roundn(merged.loc[~merged["is_closed"], "amount"].quantile(0.85)) if not merged.loc[~merged["is_closed"]].empty else 0

    seller_summary = (
        merged.groupby("seller", as_index=False)
        .agg(
            quoted=("quote_no", "nunique"),
            closed=("is_closed", "sum"),
            expired=("is_expired", "sum"),
            pending=("is_pending", "sum"),
            quotedAmount=("amount", "sum"),
            closedAmount=("amount", lambda s: s[merged.loc[s.index, "is_closed"]].sum()),
            avgTicket=("amount", "mean"),
            clients=("client_doc", "nunique"),
        )
        .fillna(0)
    )
    seller_summary["closeRate"] = seller_summary["closed"] / seller_summary["quoted"].replace(0, pd.NA)
    seller_summary = seller_summary.fillna(0).sort_values(["closedAmount", "closeRate", "quoted"], ascending=False)

    status_summary = (
        merged.groupby("status_bucket", as_index=False)
        .agg(count=("quote_no", "nunique"), amount=("amount", "sum"))
        .sort_values("count", ascending=False)
    )

    quote_block["sourceFiles"] = sorted(set((quote_block.get("sourceFiles") or []) + [QUOTE_MAY_FILE.name]))
    quote_block["sourceFile"] = ", ".join(quote_block["sourceFiles"])
    quote_block["summary"] = {
        **(quote_block.get("summary") or {}),
        "totalQuotes": total_quotes,
        "closedQuotes": closed_quotes,
        "expiredQuotes": expired_quotes,
        "pendingQuotes": pending_quotes,
        "totalAmount": total_amount,
        "closedAmount": closed_amount,
        "avgTicket": roundn(merged["amount"].mean()),
        "closeRate": roundn(close_rate, 4),
        "highOpenThreshold": high_open_threshold,
        "conclusion": f"En 2026 se emitieron {total_quotes} cotizaciones por S/ {total_amount:,.0f}, con una tasa de cierre de {close_rate * 100:.1f}%.",
    }
    quote_block["sellerSummary"] = [
        {k: (roundn(v) if isinstance(v, float) else int(v) if k in {"quoted", "closed", "expired", "pending", "clients"} else v) for k, v in row.items()}
        for row in seller_summary.to_dict("records")
    ]
    quote_block["statusSummary"] = [
        {"status_bucket": row["status_bucket"], "count": int(row["count"]), "amount": roundn(row["amount"])}
        for row in status_summary.to_dict("records")
    ]
    quote_block["quoteRows"] = [
        {key: (roundn(value) if key == "amount" else value) for key, value in row.items() if key not in {"is_closed", "is_expired", "is_pending"}}
        for row in merged.sort_values("amount", ascending=False).to_dict("records")
    ]
    payload["quotes2026"] = quote_block
    return {"updated": True, "totalQuotes": total_quotes, "newFileQuotes": int(new_quotes["quote_no"].nunique())}


def main():
    payload = read_json_payload(CRM_JSON)
    sales_result = update_sales(payload)
    quote_result = update_quotes(payload)
    write_payload(payload)
    print(json.dumps({"sales": sales_result, "quotes": quote_result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
