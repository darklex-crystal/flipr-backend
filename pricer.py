"""
pricer.py — Moteur de pricing via SerpApi (eBay sold listings)
"""

import os
import httpx
import statistics
from typing import Optional

SERPAPI_KEY = os.getenv("SERPAPI_KEY")
SERPAPI_URL = "https://serpapi.com/search"

CONDITION_MULTIPLIERS = {
    "poor":    0.40,
    "fair":    0.62,
    "good":    0.78,
    "likenew": 0.92,
    "new":     1.00,
}

SPEED_MULTIPLIERS = {
    "fast":    0.88,
    "normal":  1.00,
    "patient": 1.14,
}

SPEED_LABELS = {
    "fast":    "1–3 jours",
    "normal":  "5–8 jours",
    "patient": "2–3 semaines",
}

PLATFORM_FEES = {
    "ebay":     {"rate": 0.1325, "fixed": 0.30, "label": "13.25% + 0.30$"},
    "facebook": {"rate": 0.00,   "fixed": 0.00, "label": "0% (local)"},
    "whatnot":  {"rate": 0.08,   "fixed": 0.00, "label": "8% + ~3% traitement"},
}

WHATNOT_KEYWORDS = [
    "pokemon", "trading card", "sneaker", "jordan", "nike", "vintage",
    "collectible", "comic", "figure", "toy", "retro", "vinyl", "watch"
]

async def fetch_ebay_sold(query: str) -> list[dict]:
    if not SERPAPI_KEY:
        raise ValueError("SERPAPI_KEY manquante dans .env")

    params = {
        "engine":      "ebay",
        "ebay_domain": "ebay.com",
        "_nkw":        query,
        "LH_Sold":     "1",
        "LH_Complete": "1",
        "api_key":     SERPAPI_KEY,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(SERPAPI_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    items = data.get("organic_results", [])
    results = []

    for item in items:
        price_raw = (
            item.get("price", {}).get("raw") or
            item.get("extracted_price") or
            item.get("price_str", "")
        )
        if isinstance(price_raw, (int, float)):
            price = float(price_raw)
        else:
            cleaned = str(price_raw).replace("$", "").replace(",", "").replace(" ", "").strip()
            try:
                price = float(cleaned.split("–")[0].split("-")[0])
            except (ValueError, IndexError):
                continue

        if price <= 0:
            continue

        results.append({
            "title":     item.get("title", "")[:80],
            "price":     price,
            "condition": item.get("condition", ""),
            "link":      item.get("link", ""),
        })

    return results


def compute_price_range(prices: list[float]):
    if not prices:
        return None
    prices = sorted(prices)
    n = len(prices)
    cut = max(1, int(n * 0.05)) if n >= 10 else 0
    trimmed = prices[cut: n - cut] if cut else prices
    return {
        "low":    round(trimmed[0], 2),
        "median": round(statistics.median(trimmed), 2),
        "high":   round(trimmed[-1], 2),
        "count":  len(prices),
    }


def is_whatnot_relevant(query: str) -> bool:
    return any(kw in query.lower() for kw in WHATNOT_KEYWORDS)


def build_platform(list_price, platform, speed, recommended=False, note="", disabled=False):
    fee = PLATFORM_FEES[platform]
    fee_amount = round(list_price * fee["rate"] + fee["fixed"], 2)
    net_price  = round(list_price - fee_amount, 2)
    return {
        "platform":     platform,
        "list_price":   round(list_price, 2),
        "net_price":    net_price,
        "fee_rate":     fee["label"],
        "fee_amount":   fee_amount,
        "recommended":  recommended,
        "days_to_sell": SPEED_LABELS.get(speed, "~1 semaine"),
        "note":         note,
        "disabled":     disabled,
    }


async def fetch_pricing(query: str, condition: str, speed: str,
                        paid_price: Optional[float] = None) -> dict:

    cond_mult  = CONDITION_MULTIPLIERS.get(condition, 0.78)
    speed_mult = SPEED_MULTIPLIERS.get(speed, 1.00)

    listings = await fetch_ebay_sold(query)

    if not listings:
        raise ValueError(f"Aucune vente trouvée pour : {query}")

    prices      = [item["price"] for item in listings]
    price_range = compute_price_range(prices)

    if not price_range:
        raise ValueError("Données insuffisantes pour calculer un prix")

    base     = price_range["median"]
    adjusted = base * cond_mult * speed_mult
    whatnot_ok = is_whatnot_relevant(query)

    platforms = [
        build_platform(adjusted, "ebay", speed,
            recommended=True,
            note=f"Basé sur {price_range['count']} ventes récentes"),
        build_platform(adjusted * 0.82, "facebook", speed,
            note="Cash local, aucun frais"),
        build_platform(adjusted * (1.10 if whatnot_ok else 1.0), "whatnot", speed,
            note="Fort potentiel en live auction" if whatnot_ok else "Catégorie peu adaptée",
            disabled=not whatnot_ok),
    ]

    profit_data = None
    if paid_price and paid_price > 0:
        net    = platforms[0]["net_price"]
        profit = round(net - paid_price, 2)
        roi    = round((profit / paid_price) * 100, 1)
        profit_data = {
            "paid_price":  paid_price,
            "profit":      profit,
            "roi_pct":     roi,
            "is_positive": profit > 0,
        }

    confidence = "high" if price_range["count"] >= 10 else \
                 "medium" if price_range["count"] >= 4 else "low"

    return {
        "query":                query,
        "condition":            condition,
        "speed":                speed,
        "price_range":          price_range,
        "platforms":            platforms,
        "recommended_platform": "ebay",
        "profit":               profit_data,
        "comps":                listings[:5],
        "confidence":           confidence,
        "confidence_note":      f"{price_range['count']} ventes analysées · médiane {base}$",
    }
