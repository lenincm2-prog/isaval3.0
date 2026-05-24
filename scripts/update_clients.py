import json
import math
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CRM_JSON = DATA_DIR / "crm-data.json"
CRM_JS = DATA_DIR / "crm-data.js"
CLIENT_FILE = Path(r"C:\Users\User\Downloads\clientesa mayo.xls")


def clean_text(value, fallback=""):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text if text else fallback


def clean_doc(value):
    text = clean_text(value, "")
    return re.sub(r"\D+", "", text) or clean_text(value, "")


def clean_phone(value):
    text = re.sub(r"\D+", "", clean_text(value, ""))
    if not text or text == "0":
        return ""
    if len(text) == 9:
        return "51" + text
    return text


def roundn(value, digits=2):
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return 0
    return round(float(value), digits)


def safe_id(text):
    text = clean_text(text, "sin-id").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "sin-id"


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


def read_clients_file():
    raw = pd.read_excel(CLIENT_FILE, sheet_name=0, header=None)
    header_idx = 0
    for idx, row in raw.head(12).iterrows():
        values = [clean_text(v, "") for v in row.tolist()]
        if "Nro. Doc." in values and "Fecha Ingreso" in values:
            header_idx = idx
            break

    raw.columns = [clean_text(c, "") for c in raw.iloc[header_idx].tolist()]
    raw = raw.iloc[header_idx + 1 :].copy()

    records = {}
    for _, row in raw.iterrows():
        doc = clean_doc(row_value(row, "Nro. Doc."))
        if not doc:
            continue
        razon = row_value(row, "Razón Social", "RazÃ³n Social", "RazÃƒÂ³n Social")
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
        phone_1 = clean_phone(row_value(row, "Teléfono 1", "TelÃ©fono 1", "TelÃƒÂ©fono 1"))
        phone_2 = clean_phone(row_value(row, "Teléfono 2", "TelÃ©fono 2", "TelÃƒÂ©fono 2"))
        entry_date = pd.to_datetime(row.get("Fecha Ingreso", None), errors="coerce")
        incoming = {
            "clientCode": row_value(row, "Código", "CÃ³digo", "CÃƒÂ³digo"),
            "tradeName": row_value(row, "Nom. Comercial"),
            "contact": contact,
            "phone": phone_1 or phone_2,
            "phone1": phone_1,
            "phone2": phone_2,
            "fax": clean_phone(row_value(row, "Fax")),
            "email": row_value(row, "Correo"),
            "address": row_value(row, "Dirección", "DirecciÃ³n", "DirecciÃƒÂ³n"),
            "seller": row_value(row, "Vendedor"),
            "status": row_value(row, "Estado"),
            "entryDate": entry_date.strftime("%Y-%m-%d") if pd.notna(entry_date) else "",
            "source": CLIENT_FILE.name,
        }
        records[doc] = merge_contact(records.get(doc), incoming)
    return records


def client_sales_lookup(payload, year):
    lookup = {}
    for client in payload.get("clients") or []:
        doc = clean_doc(client.get("doc", ""))
        if not doc:
            continue
        yearly_sales = roundn((client.get("yearly") or {}).get(str(year), 0))
        yearly_orders = sum(
            int(value or 0)
            for period, value in (client.get("quarterOrders") or {}).items()
            if str(period).startswith(f"{year}-")
        )
        lookup[doc] = {
            "sales": yearly_sales,
            "orders": yearly_orders,
            "lastPurchase": client.get("lastPurchase", ""),
        }
    return lookup


def rebuild_new_clients_2026(payload, contacts):
    latest_year = int((payload.get("summary") or {}).get("latestYear") or 2026)
    sales_lookup = client_sales_lookup(payload, latest_year)
    items = []

    for doc, contact in contacts.items():
        entry_date = pd.to_datetime(contact.get("entryDate", ""), errors="coerce")
        if pd.isna(entry_date) or int(entry_date.year) != latest_year:
            continue
        sold = sales_lookup.get(doc, {"sales": 0, "orders": 0, "lastPurchase": ""})
        seller = clean_text(contact.get("seller", ""), "Sin comercial")
        name = clean_text(contact.get("contact", ""), "") or clean_text(contact.get("tradeName", ""), "") or doc
        items.append(
            {
                "id": safe_id(f"{doc}-{name}"),
                "doc": doc,
                "name": name,
                "seller": seller,
                "entryDate": entry_date.strftime("%Y-%m-%d"),
                "phone": contact.get("phone", ""),
                "email": contact.get("email", ""),
                "sold": sold["sales"] > 0,
                "sales": roundn(sold["sales"]),
                "orders": int(sold["orders"]),
                "lastPurchase": sold["lastPurchase"],
            }
        )

    by_seller = []
    if items:
        for seller, group in pd.DataFrame(items).groupby("seller"):
            records = group.to_dict("records")
            sold_records = [item for item in records if item["sold"]]
            by_seller.append(
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

    by_seller = sorted(by_seller, key=lambda item: (item["soldClients"], item["sales"], item["registered"]), reverse=True)
    payload["newClients2026"] = {
        "year": latest_year,
        "totalRegistered": len(items),
        "soldClients": sum(1 for item in items if item["sold"]),
        "sales": roundn(sum(item["sales"] for item in items)),
        "bySeller": by_seller,
    }


def write_payload(payload):
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    CRM_JSON.write_text(encoded, encoding="utf-8")
    CRM_JS.write_text(f"window.CRM_DATA = {encoded};\n", encoding="utf-8")


def main():
    if not CLIENT_FILE.exists():
        raise FileNotFoundError(CLIENT_FILE)

    payload = json.loads(CRM_JSON.read_text(encoding="utf-8"))
    contacts = read_clients_file()
    rebuild_new_clients_2026(payload, contacts)
    summary = payload.setdefault("summary", {})
    summary["generatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    source_files = summary.setdefault("sourceFiles", [])
    if CLIENT_FILE.name not in source_files:
        source_files.append(CLIENT_FILE.name)

    write_payload(payload)
    print(
        json.dumps(
            {
                "clientFileRows": len(contacts),
                "registered2026": payload["newClients2026"]["totalRegistered"],
                "soldNewClients2026": payload["newClients2026"]["soldClients"],
                "newClientSales2026": payload["newClients2026"]["sales"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
