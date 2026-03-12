"""
FLIPR — Backend API
FastAPI server: product identification + eBay pricing
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv

from identifier import identify_product
from pricer import fetch_pricing

load_dotenv()

app = FastAPI(title="FLIPR API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restreindre en production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Schemas ----------

class PriceRequest(BaseModel):
    query: str                          # Texte libre OU résultat de l'identification image
    condition: str                      # poor / fair / good / likenew / new
    speed: str                          # fast / normal / patient
    paid_price: Optional[float] = None  # Ce que l'utilisateur a payé

class IdentifyRequest(BaseModel):
    image_base64: str                   # Image encodée en base64
    media_type: str = "image/jpeg"      # image/jpeg ou image/png

# ---------- Routes ----------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/identify")
async def identify(req: IdentifyRequest):
    """
    Étape 1 (optionnelle) : identifier un produit depuis une photo.
    Retourne un nom de produit normalisé à passer à /price.
    """
    try:
        result = await identify_product(req.image_base64, req.media_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/price")
async def price(req: PriceRequest):
    """
    Étape principale : retourne le prix recommandé par plateforme.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query vide")

    try:
        result = await fetch_pricing(
            query=req.query.strip(),
            condition=req.condition,
            speed=req.speed,
            paid_price=req.paid_price,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
