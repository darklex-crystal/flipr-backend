"""
identifier.py — Identification de produit via OpenAI GPT-4o Vision
"""

import os
import json
import httpx

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """Tu es un expert en identification de produits électroniques, 
vêtements, objets de collection et biens de consommation courants.

Quand on te donne une image, réponds UNIQUEMENT avec un objet JSON valide, sans markdown :
{
  "product_name": "Nom complet du produit (marque + modèle)",
  "category": "electronics | clothing | collectibles | appliances | sports | other",
  "brand": "Marque",
  "model": "Modèle précis si visible",
  "confidence": 0.0 à 1.0,
  "notes": "Détails utiles pour la revente (couleur, capacité, génération...)"
}

Si tu ne peux pas identifier le produit avec confiance > 0.5, retourne confidence < 0.5 
et indique dans notes ce qui manque pour identifier précisément."""


async def identify_product(image_base64: str, media_type: str = "image/jpeg") -> dict:
    """
    Envoie une image à GPT-4o et retourne les infos produit structurées.
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY manquante dans .env")

    payload = {
        "model": "gpt-4o",
        "max_tokens": 400,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_base64}",
                            "detail": "high"
                        }
                    },
                    {
                        "type": "text",
                        "text": "Identifie ce produit pour la revente."
                    }
                ]
            }
        ]
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(OPENAI_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    raw_text = data["choices"][0]["message"]["content"].strip()

    # Nettoyage au cas où le modèle ajoute des backticks malgré le prompt
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        # Fallback : retourner le texte brut dans product_name
        result = {
            "product_name": raw_text[:120],
            "category": "other",
            "brand": "",
            "model": "",
            "confidence": 0.4,
            "notes": "Identification imprécise — vérifier manuellement"
        }

    return result
