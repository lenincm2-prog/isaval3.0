import json
import math
from datetime import datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOURCE_FILES = [
    Path(r"C:\Users\User\Downloads\Listado de Detalles Kárdex Generaldeta.xls"),
    Path(r"C:\Users\User\Downloads\Listado de Detalles Kárdex General.xls"),
]

SALES_OPS = {"VENTA", "SALIDA PARA VENTA"}
OTHER_DEMAND_OPS = {
    "POR CONSUMO",
    "PROMOCIÓN",
    "PROMOCION",
    "MUESTRAS",
    "SALIDA PARA MUESTRA A CLIENTES",
    "SALIDA POR SERVICIO DE PRODUCCIÓN",
    "SALIDA A PRODUCCIÓN",
    "RETIRO",
    "DONACIÓN",
    "DONACION",
    "MERMAS",
}


def clean_text(value, fallback=""):
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def num(value):
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


def last_non_empty(values, fallback=""):
    cleaned = [clean_text(value) for value in values if clean_text(value)]
    return cleaned[-1] if cleaned else fallback


def status_for(stock_qty, sales_qty_365, days_inventory, days_since_sale, stock_value):
    if stock_qty <= 0 and sales_qty_365 > 0:
        return "Quiebre"
    if stock_qty <= 0:
        return "Sin stock"
    if sales_qty_365 <= 0:
        return "Sin rotacion"
    if days_inventory is not None and days_inventory < 30:
        return "Bajo stock"
    if days_inventory is not None and days_inventory > 360:
        return "Sobrestock"
    if days_since_sale is not None and days_since_sale > 180 and stock_value > 0:
        return "Lento"
    return "Saludable"


def recommendation_for(status, abc_class, months_coverage, days_since_sale):
    if status == "Quiebre":
        return "Reponer o transferir stock: hay venta reciente y saldo cero."
    if status == "Sin stock":
        return "Mantener sin compra salvo pedido confirmado."
    if status == "Sin rotacion":
        return "Revisar obsolescencia, liquidacion o traspaso a almacen con demanda."
    if status == "Bajo stock":
        return "Priorizar reposicion; validar lead time y pedido minimo."
    if status == "Sobrestock":
        return "Activar plan comercial, promocion o bloqueo de nuevas compras."
    if status == "Lento":
        return "Revisar precio, exposicion y ubicacion; evitar reposicion."
    if abc_class == "A":
        return "Control semanal de stock y cobertura."
    if months_coverage is not None and months_coverage > 6:
        return "Vigilar cobertura alta antes de comprar."
    if days_since_sale is not None and days_since_sale > 90:
        return "Impulsar venta o revisar sustitutos."
    return "Mantener seguimiento normal."


def abc_classes(rows):
    ordered = sorted(rows, key=lambda item: item["salesCost365"], reverse=True)
    total = sum(max(item["salesCost365"], 0) for item in ordered)
    cumulative = 0.0
    for item in ordered:
        if total <= 0 or item["salesCost365"] <= 0:
            item["abc"] = "C"
            item["abcShare"] = 0
            item["abcCumulative"] = 1
            continue
        cumulative += item["salesCost365"]
        share = item["salesCost365"] / total
        cumulative_share = cumulative / total
        item["abcShare"] = roundn(share, 4)
        item["abcCumulative"] = roundn(cumulative_share, 4)
        if cumulative_share <= 0.8:
            item["abc"] = "A"
        elif cumulative_share <= 0.95:
            item["abc"] = "B"
        else:
            item["abc"] = "C"


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
    df["_row"] = range(len(df))
    df["_op"] = df["Nombre Tipo Operacion"].map(lambda value: clean_text(value).upper())
    df["_movement"] = df["Movimiento"].map(lambda value: clean_text(value).upper())
    df["_is_sale"] = df["_op"].isin(SALES_OPS) & (df["_movement"] == "SALIDA")
    df["_is_other_demand"] = df["_op"].isin(OTHER_DEMAND_OPS) & (df["_movement"] == "SALIDA")

    latest_date = df["Fecha Movimiento"].max().normalize()
    d90 = latest_date - pd.Timedelta(days=90)
    d180 = latest_date - pd.Timedelta(days=180)
    d365 = latest_date - pd.Timedelta(days=365)

    sort_cols = ["Cod. Producto", "Cod. Almacén", "Fecha Movimiento", "_row"]
    latest_by_warehouse = df.sort_values(sort_cols).groupby(["Cod. Producto", "Cod. Almacén"], as_index=False).tail(1)

    rows = []
    for product_code, group in df.groupby("Cod. Producto"):
        product_code = clean_text(product_code)
        product_name = last_non_empty(group["Nombre Producto"], product_code)
        commercial_code = last_non_empty(group["Cod. Comercial"])
        product_class = last_non_empty(group["Clase"], "Sin clase")
        subclass = last_non_empty(group["Sub Clase"], "Sin sub clase")
        brand = last_non_empty(group["Marca"], "Sin marca")
        unit = last_non_empty(group["Nombre Unidad Medida"], "Unidades")
        existence = last_non_empty(group["Nombre Existencia"], "Sin dato")

        product_stock = latest_by_warehouse[latest_by_warehouse["Cod. Producto"].map(clean_text) == product_code]
        stock_qty = product_stock["Saldo Cantidad"].map(num).sum()
        stock_value = product_stock["Saldo Total"].map(num).sum()
        avg_cost = stock_value / stock_qty if stock_qty > 0 else 0

        sales = group[group["_is_sale"]]
        sales_365 = sales[sales["Fecha Movimiento"] >= d365]
        sales_180 = sales[sales["Fecha Movimiento"] >= d180]
        sales_90 = sales[sales["Fecha Movimiento"] >= d90]
        other_365 = group[group["_is_other_demand"] & (group["Fecha Movimiento"] >= d365)]

        sales_qty_365 = sales_365["Cantidad Salida"].map(num).sum()
        sales_qty_180 = sales_180["Cantidad Salida"].map(num).sum()
        sales_qty_90 = sales_90["Cantidad Salida"].map(num).sum()
        sales_cost_365 = sales_365["Total Salida"].map(num).sum()
        other_demand_qty_365 = other_365["Cantidad Salida"].map(num).sum()

        avg_daily_sales = sales_qty_365 / 365 if sales_qty_365 > 0 else 0
        days_inventory = stock_qty / avg_daily_sales if avg_daily_sales > 0 else None
        months_coverage = days_inventory / 30.4375 if days_inventory is not None else None
        turnover = sales_qty_365 / stock_qty if stock_qty > 0 else None

        last_sale = sales["Fecha Movimiento"].max()
        last_movement = group["Fecha Movimiento"].max()
        days_since_sale = int((latest_date - last_sale.normalize()).days) if pd.notna(last_sale) else None
        days_since_movement = int((latest_date - last_movement.normalize()).days) if pd.notna(last_movement) else None

        warehouse_rows = []
        for _, wh in product_stock.sort_values(["Cod. Almacén"]).iterrows():
            qty = num(wh.get("Saldo Cantidad"))
            value = num(wh.get("Saldo Total"))
            if abs(qty) < 0.0001 and abs(value) < 0.01:
                continue
            warehouse_rows.append(
                {
                    "warehouseCode": clean_text(wh.get("Cod. Almacén")),
                    "warehouse": clean_text(wh.get("Nom. Almacen"), "Sin almacen"),
                    "qty": roundn(qty),
                    "value": roundn(value),
                }
            )

        rows.append(
            {
                "productCode": product_code,
                "commercialCode": commercial_code,
                "product": product_name,
                "class": product_class,
                "subclass": subclass,
                "brand": brand,
                "unit": unit,
                "existence": existence,
                "stockQty": roundn(stock_qty),
                "stockValue": roundn(stock_value),
                "avgCost": roundn(avg_cost, 4),
                "salesQty365": roundn(sales_qty_365),
                "salesQty180": roundn(sales_qty_180),
                "salesQty90": roundn(sales_qty_90),
                "salesCost365": roundn(sales_cost_365),
                "otherDemandQty365": roundn(other_demand_qty_365),
                "avgMonthlySales": roundn(sales_qty_365 / 12),
                "daysInventory": roundn(days_inventory),
                "monthsCoverage": roundn(months_coverage),
                "turnover": roundn(turnover, 2),
                "lastSale": last_sale.strftime("%Y-%m-%d") if pd.notna(last_sale) else "",
                "lastMovement": last_movement.strftime("%Y-%m-%d") if pd.notna(last_movement) else "",
                "daysSinceSale": days_since_sale,
                "daysSinceMovement": days_since_movement,
                "warehouses": warehouse_rows,
            }
        )

    abc_classes(rows)
    for row in rows:
        row["status"] = status_for(
            row["stockQty"] or 0,
            row["salesQty365"] or 0,
            row["daysInventory"],
            row["daysSinceSale"],
            row["stockValue"] or 0,
        )
        row["recommendation"] = recommendation_for(row["status"], row["abc"], row["monthsCoverage"], row["daysSinceSale"])

    rows = sorted(rows, key=lambda item: (item["stockValue"], item["salesCost365"], item["stockQty"]), reverse=True)
    total_stock_value = sum(max(item["stockValue"] or 0, 0) for item in rows)
    total_sales_cost_365 = sum(max(item["salesCost365"] or 0, 0) for item in rows)

    status_counts = {}
    abc_counts = {}
    for row in rows:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
        abc_counts[row["abc"]] = abc_counts.get(row["abc"], 0) + 1

    class_map = {}
    for row in rows:
        class_map.setdefault(row["class"], []).append(row)
    by_class = []
    for name, items in sorted(class_map.items(), key=lambda pair: sum(i["stockValue"] or 0 for i in pair[1]), reverse=True):
        by_class.append(
            {
                "class": name,
                "products": len(items),
                "stockQty": roundn(sum(i["stockQty"] or 0 for i in items)),
                "stockValue": roundn(sum(i["stockValue"] or 0 for i in items)),
                "salesCost365": roundn(sum(i["salesCost365"] or 0 for i in items)),
            }
        )

    payload = {
        "summary": {
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "sourceFile": ", ".join(file.name for file in existing_files),
            "latestDate": latest_date.strftime("%Y-%m-%d"),
            "movementRows": int(len(df)),
            "products": len(rows),
            "withStock": sum(1 for item in rows if (item["stockQty"] or 0) > 0),
            "withoutStock": sum(1 for item in rows if (item["stockQty"] or 0) <= 0),
            "totalStockQty": roundn(sum(item["stockQty"] or 0 for item in rows)),
            "totalStockValue": roundn(total_stock_value),
            "salesCost365": roundn(total_sales_cost_365),
            "stockTurnoverValue": roundn(total_sales_cost_365 / total_stock_value, 2) if total_stock_value > 0 else None,
            "abcCounts": abc_counts,
            "statusCounts": status_counts,
        },
        "classes": by_class,
        "products": rows,
    }

    DATA_DIR.mkdir(exist_ok=True)
    json_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (DATA_DIR / "stock-analysis.json").write_text(json_payload, encoding="utf-8")
    (DATA_DIR / "stock-analysis.js").write_text(f"window.STOCK_ANALYSIS = {json_payload};\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    build()
