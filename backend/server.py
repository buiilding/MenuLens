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

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
except ImportError:
    LlmChat = None
    UserMessage = None
    ImageContent = None

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
MAX_IMAGE_SEARCH_ATTEMPTS = 6
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
- Prefer broad, generic dish image queries over exact restaurant/menu wording.
- Do not include prices, serving counts, vegetarian markers, or menu abbreviations in queries.
- If restaurant_name is visible, you may use it only as the third query.
- Make the first query: "<dish name>" food.
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

    if LlmChat is None:
        try:
            from openai import AsyncOpenAI

            client_openai = AsyncOpenAI(api_key=OPENAI_API_KEY)
            raw_response = await asyncio.wait_for(
                client_openai.responses.create(
                    model="gpt-5.2",
                    instructions=MENU_SYSTEM_PROMPT,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": "Extract every visible food and drink item from this menu photo and return strict JSON as instructed.",
                                },
                                {
                                    "type": "input_image",
                                    "image_url": f"data:{mime_type};base64,{b64}",
                                },
                            ],
                        }
                    ],
                ),
                timeout=90,
            )
            raw = raw_response.output_text
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="LLM request timed out")
        except Exception as e:
            logger.exception("OpenAI fallback call failed")
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
    """Return first usable image {image_url, image_source_url, image_source_name} or None.
    Retries once on 429 respecting Retry-After."""
    if not BRAVE_SEARCH_API_KEY:
        return None
    url = "https://api.search.brave.com/res/v1/images/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    }
    params = {"q": query, "count": 10, "safesearch": "strict"}
    payload = None
    for attempt in range(2):
        try:
            r = await client_http.get(url, headers=headers, params=params, timeout=15)
            if r.status_code == 429 and attempt == 0:
                retry_after = 1.2
                try:
                    retry_after = float(r.headers.get("Retry-After", "1.2"))
                except (TypeError, ValueError):
                    pass
                retry_after = max(0.5, min(retry_after, 3.0))
                await asyncio.sleep(retry_after)
                continue
            if r.status_code != 200:
                logger.warning("Brave non-200 (%s) for '%s': %s", r.status_code, query, r.text[:200])
                return None
            payload = r.json()
            break
        except Exception as e:
            logger.warning("Brave error for '%s': %s", query, e)
            return None

    if not payload:
        return None
    results = payload.get("results") or []
    for res in results:
        props = res.get("properties") or {}
        thumb = res.get("thumbnail") or {}
        img_url = thumb.get("src") or props.get("url")
        if not img_url:
            continue
        return {
            "image_url": img_url,
            "image_source_url": res.get("url"),
            "image_source_name": (res.get("source") or res.get("meta_url", {}).get("hostname")),
        }
    return None


# Brave Free plan = 1 QPS. Global limiter serializes all outbound Brave calls.
_brave_lock = asyncio.Lock()
_brave_last_call_ts = 0.0
_BRAVE_MIN_INTERVAL = 1.1  # seconds between calls


async def _rate_limited_brave(client_http: httpx.AsyncClient, query: str) -> Optional[dict]:
    global _brave_last_call_ts
    async with _brave_lock:
        loop = asyncio.get_event_loop()
        now = loop.time()
        wait = _BRAVE_MIN_INTERVAL - (now - _brave_last_call_ts)
        if wait > 0:
            await asyncio.sleep(wait)
        _brave_last_call_ts = loop.time()
        return await _brave_image_search(client_http, query)


def _dedupe_queries(queries: List[str]) -> List[str]:
    seen = set()
    out = []
    for query in queries:
        if not query or not isinstance(query, str):
            continue
        normalized = re.sub(r"\s+", " ", query).strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        out.append(normalized)
    return out


def _clean_dish_name_for_search(name: str) -> str:
    cleaned = name.strip()
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\b\d+\s*(?:pc|pcs|piece|pieces|nos|no)\b\.?", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(?:non-veg|vegetarian|veg|nv|v)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\$\s*\d+(?:\.\d{1,2})?", " ", cleaned)
    cleaned = re.sub(r"\s*[-–—]\s*$", " ", cleaned)
    cleaned = re.sub(r"\s*[-–—]\s*", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,-/")
    return cleaned or name.strip()


def _clean_cuisine_for_search(cuisine: Optional[str]) -> Optional[str]:
    if not cuisine:
        return None
    cleaned = re.sub(r"\b(?:non-veg|vegetarian|veg|nv|v)\b", " ", cuisine, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,-/")
    return cleaned or cuisine.strip()


def _dish_name_variants(name: str) -> List[str]:
    variants = [name]
    lower = name.casefold()
    if "idly" in lower:
        variants.append(re.sub("idly", "idli", name, flags=re.IGNORECASE))
    if "thatte idli" in lower or "thatte idly" in lower:
        variants.append("thatte idli")
    if "sambar" in lower and ("idli" in lower or "idly" in lower):
        variants.append("sambar idli")
    if "podi" in lower and ("idli" in lower or "idly" in lower):
        variants.append("podi idli")
    if "ghee" in lower and "podi" in lower:
        variants.append("ghee podi")
    return _dedupe_queries(variants)


def _broad_image_queries(item: MenuItem, cuisine: Optional[str]) -> List[str]:
    clean_name = _clean_dish_name_for_search(item.name)
    clean_cuisine = _clean_cuisine_for_search(cuisine)
    name_variants = _dish_name_variants(clean_name)
    visual = " ".join(item.visual_keywords[:3])

    queries = []
    for variant in name_variants:
        queries.append(f"{variant} food")
    for variant in name_variants:
        if clean_cuisine:
            queries.append(f"{variant} {clean_cuisine} food")
    for variant in name_variants:
        queries.append(f"{variant} dish")
    for variant in name_variants:
        if visual:
            queries.append(f"{variant} {visual} food")

    if item.category and clean_cuisine:
        queries.append(f"{item.category} {clean_cuisine} food")
    elif item.category:
        queries.append(f"{item.category} food")

    return _dedupe_queries(queries)


def _image_search_queries(item: MenuItem, cuisine: Optional[str]) -> List[str]:
    llm_queries = _dedupe_queries(item.search_queries)
    broad_queries = _broad_image_queries(item, cuisine)
    return _dedupe_queries(broad_queries + llm_queries)[:MAX_IMAGE_SEARCH_ATTEMPTS]


async def _find_image_for_item(
    client_http: httpx.AsyncClient,
    item: MenuItem,
    cuisine: Optional[str],
) -> MenuItem:
    for q in _image_search_queries(item, cuisine):
        hit = await _rate_limited_brave(client_http, q)
        if hit:
            logger.info("Image found for '%s' via query '%s'", item.name, q)
            item.image_url = hit["image_url"]
            item.image_source_url = hit["image_source_url"]
            item.image_source_name = hit["image_source_name"]
            return item
    logger.info("No image found for '%s' after fallback queries", item.name)
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

    # Serialized Brave lookups (Free plan = 1 QPS, enforced by _rate_limited_brave)
    async with httpx.AsyncClient() as http_client:
        for it in result.items:
            await _find_image_for_item(http_client, it, result.detected_cuisine)

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
