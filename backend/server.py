from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import base64
import logging
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB (kept from template — not actually used for persistence per user request)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
BRAVE_SEARCH_API_KEY = os.environ.get('BRAVE_SEARCH_API_KEY', '')

# Config limits
MAX_ITEMS = 25
MAX_QUERIES_PER_ITEM = 3
MAX_UPLOAD_MB = 10
ACCEPTED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

app = FastAPI(title="Menu → Dish Cards")
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


MENU_SYSTEM_PROMPT = """You are a restaurant menu extraction system.

Given an image of a restaurant menu, extract visible food and drink items into strict JSON.

Return only JSON with this shape:
{
  "restaurant_name": string | null,
  "detected_cuisine": string | null,
  "items": [
    {
      "name": string,
      "description": string | null,
      "category": string | null,
      "price": string | null,
      "search_queries": string[],
      "visual_keywords": string[],
      "confidence": number
    }
  ]
}

Rules:
- Return JSON only. No markdown. No prose. No code fences.
- Extract only items visible in the image.
- Do not invent prices.
- Do not invent restaurant name unless visible.
- Include at most 25 items.
- confidence must be between 0 and 1.
- search_queries must contain 3 concise image-search-friendly queries.
- Prefer queries that produce useful dish images.
- If restaurant_name is visible, make the first query: "<restaurant_name>" "<dish name>".
- Otherwise make the first query: "<dish name>" food.
- Use detected cuisine in one query when possible.
- Use visual keywords for ambiguous dishes.
"""


class MenuItem(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[str] = None
    search_queries: List[str] = []
    visual_keywords: List[str] = []
    confidence: float = 0.0
    image_url: Optional[str] = None
    image_source_url: Optional[str] = None
    image_source_name: Optional[str] = None


class MenuResponse(BaseModel):
    restaurant_name: Optional[str] = None
    detected_cuisine: Optional[str] = None
    items: List[MenuItem] = []


def _extract_json_block(text: str) -> str:
    """Grab the first {...} JSON blob from LLM output; strips code fences."""
    text = text.strip()
    # Strip common markdown fences if present
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if fence_match:
        return fence_match.group(1)
    # Otherwise find the first { and matching last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]
    return text


async def _call_llm(image_bytes: bytes, mime_type: str) -> dict:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    b64 = base64.b64encode(image_bytes).decode('utf-8')
    image_content = ImageContent(image_base64=b64)

    chat = LlmChat(
        api_key=OPENAI_API_KEY,
        session_id=f"menu-{os.urandom(6).hex()}",
        system_message=MENU_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.2")

    user_msg = UserMessage(
        text="Extract every visible food and drink item from this menu photo and return strict JSON as instructed.",
        file_contents=[image_content],
    )

    try:
        raw = await asyncio.wait_for(chat.send_message(user_msg), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out")
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"LLM failure: {str(e)[:200]}")

    if not raw or not isinstance(raw, str):
        raise HTTPException(status_code=502, detail="Empty LLM response")

    json_blob = _extract_json_block(raw)
    try:
        data = json.loads(json_blob)
    except json.JSONDecodeError:
        logger.error("Failed to parse LLM JSON. Raw: %s", raw[:500])
        raise HTTPException(status_code=502, detail="LLM returned invalid JSON")

    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="LLM JSON not an object")
    return data


async def _brave_image_search(client_http: httpx.AsyncClient, query: str) -> Optional[dict]:
    """Return first usable image {image_url, image_source_url, image_source_name} or None."""
    if not BRAVE_SEARCH_API_KEY:
        return None
    url = "https://api.search.brave.com/res/v1/images/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    }
    params = {"q": query, "count": 5, "safesearch": "strict"}
    try:
        r = await client_http.get(url, headers=headers, params=params, timeout=15)
        if r.status_code != 200:
            logger.warning("Brave non-200 (%s) for '%s': %s", r.status_code, query, r.text[:200])
            return None
        payload = r.json()
    except Exception as e:
        logger.warning("Brave error for '%s': %s", query, e)
        return None

    results = payload.get("results") or []
    for res in results:
        props = res.get("properties") or {}
        thumb = res.get("thumbnail") or {}
        img_url = props.get("url") or thumb.get("src")
        if not img_url:
            continue
        return {
            "image_url": img_url,
            "image_source_url": res.get("url"),
            "image_source_name": (res.get("source") or res.get("meta_url", {}).get("hostname")),
        }
    return None


async def _find_image_for_item(client_http: httpx.AsyncClient, item: MenuItem) -> MenuItem:
    for q in item.search_queries[:MAX_QUERIES_PER_ITEM]:
        if not q or not isinstance(q, str):
            continue
        hit = await _brave_image_search(client_http, q)
        if hit:
            item.image_url = hit["image_url"]
            item.image_source_url = hit["image_source_url"]
            item.image_source_name = hit["image_source_name"]
            return item
    return item


def _normalize_llm_data(data: dict) -> MenuResponse:
    restaurant_name = data.get("restaurant_name") or None
    detected_cuisine = data.get("detected_cuisine") or None
    raw_items = data.get("items") or []
    if not isinstance(raw_items, list):
        raw_items = []

    items: List[MenuItem] = []
    for raw in raw_items[:MAX_ITEMS]:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name")
        if not name or not isinstance(name, str):
            continue
        sq = raw.get("search_queries") or []
        if not isinstance(sq, list):
            sq = []
        sq = [s for s in sq if isinstance(s, str) and s.strip()][:MAX_QUERIES_PER_ITEM]

        # Fallback query if LLM didn't provide any
        if not sq:
            base = f'"{name}" food'
            if detected_cuisine:
                sq = [base, f'"{name}" {detected_cuisine} dish', f'"{name}" plated']
            else:
                sq = [base, f'"{name}" dish', f'"{name}" plated']

        vk = raw.get("visual_keywords") or []
        if not isinstance(vk, list):
            vk = []
        vk = [v for v in vk if isinstance(v, str)]

        try:
            conf = float(raw.get("confidence") or 0.0)
        except (TypeError, ValueError):
            conf = 0.0
        conf = max(0.0, min(1.0, conf))

        items.append(MenuItem(
            name=name.strip(),
            description=(raw.get("description") or None),
            category=(raw.get("category") or None),
            price=(raw.get("price") or None),
            search_queries=sq,
            visual_keywords=vk,
            confidence=conf,
        ))

    return MenuResponse(
        restaurant_name=restaurant_name,
        detected_cuisine=detected_cuisine,
        items=items,
    )


@api_router.get("/")
async def root():
    return {"message": "Menu → Dish Cards API"}


@api_router.get("/health")
async def health():
    return {
        "ok": True,
        "openai_configured": bool(OPENAI_API_KEY),
        "brave_configured": bool(BRAVE_SEARCH_API_KEY),
    }


@api_router.post("/analyze-menu", response_model=MenuResponse)
async def analyze_menu(image: UploadFile = File(...)):
    # Validate mime
    if image.content_type not in ACCEPTED_MIME:
        raise HTTPException(status_code=400,
                            detail=f"Unsupported image type '{image.content_type}'. Use JPEG, PNG, or WEBP.")

    contents = await image.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_UPLOAD_MB:
        raise HTTPException(status_code=400, detail=f"Image too large ({size_mb:.1f} MB). Max {MAX_UPLOAD_MB} MB.")
    if len(contents) < 100:
        raise HTTPException(status_code=400, detail="Image file is empty or corrupted.")

    logger.info("Analyzing menu image: %s (%.1f KB, %s)", image.filename, len(contents) / 1024, image.content_type)

    llm_data = await _call_llm(contents, image.content_type)
    result = _normalize_llm_data(llm_data)

    if not result.items:
        raise HTTPException(status_code=422, detail="No menu items detected in the image.")

    # Concurrent Brave lookups (bounded)
    async with httpx.AsyncClient() as http_client:
        sem = asyncio.Semaphore(6)

        async def bounded(it: MenuItem):
            async with sem:
                return await _find_image_for_item(http_client, it)

        result.items = await asyncio.gather(*(bounded(it) for it in result.items))

    return result


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
