# MenuLens

![MenuLens](https://img.shields.io/badge/MenuLens-AI%20Visual%20Menu-C84B31)
![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)
![OpenAI](https://img.shields.io/badge/AI-GPT--5.2-111111)
![Tencent EdgeOne](https://img.shields.io/badge/Deploy-Tencent%20Cloud%20EdgeOne-1473E6)

MenuLens turns a restaurant menu photo into visual dish cards.

Instead of staring at unfamiliar dish names and guessing what to order, a diner can snap a menu, let AI extract every visible item, and instantly see useful dish previews with names, categories, prices, confidence scores, and image sources.

It is built for the real moment at the table: fast, mobile-first, low friction, and useful even when the image match is approximate. The goal is not perfect food photography. The goal is to help people understand the menu before they order.

## Live Deployment

The frontend is deployed on Tencent Cloud EdgeOne.

This repository contains both the static React frontend and the FastAPI backend. The deployed frontend can be served independently, while full menu analysis requires a public backend URL configured through `REACT_APP_BACKEND_URL`.

## Why It Matters

Menus are often hard to parse:

- Dishes may be unfamiliar, abbreviated, or written in another cuisine tradition.
- Descriptions are inconsistent or missing.
- Tourists, picky eaters, people with dietary needs, and visual decision-makers all benefit from seeing what a dish generally looks like.
- Restaurant discovery apps usually show venue photos, not item-by-item previews for the menu in front of you.

MenuLens solves that gap with a single upload flow.

## Core Experience

1. Upload or capture a restaurant menu photo.
2. A multimodal LLM reads the image and extracts structured menu data.
3. The backend generates broad image-search queries for each dish.
4. Brave Image Search returns a representative image and source link.
5. The frontend renders a clean visual menu grouped by category.

## Judging Criteria

### Completeness

MenuLens is a full vertical slice, not a mockup.

- Mobile-friendly upload screen with drag-and-drop and camera capture.
- File validation for JPEG, PNG, and WEBP.
- FastAPI endpoint for multipart menu image analysis.
- LLM extraction into strict JSON.
- Defensive JSON parsing and response normalization.
- Dish cards with image, category, price, confidence, and source link.
- Loading, error, empty, and reset states.
- Backend health endpoint for deployment checks.
- Frontend production build verified with `npm run build`.
- Deployed frontend through Tencent Cloud EdgeOne.

### Innovation

MenuLens combines vision AI, structured extraction, and web image retrieval into a diner-first interface.

- It turns an ordinary menu photo into a scannable visual decision tool.
- It uses the LLM not only to extract dish names, but also to generate image-search-friendly context.
- It includes backend fallback query expansion so exact menu wording does not block image discovery.
- It accepts approximate image matches intentionally, because the real user need is recognition and expectation-setting, not catalog-perfect precision.
- It moves from text-first menus to visual-first ordering without requiring restaurants to create new content.

### Real-Life Problem Solving

This app targets a common, concrete restaurant problem: people do not know what many menu items look like.

Useful scenarios:

- A diner sees "thatte idli", "podi dosa", or "kothu parotta" and wants a quick visual.
- A traveler is reading a menu from an unfamiliar cuisine.
- A group wants to quickly compare options before ordering.
- Someone wants to avoid surprises around portion style, texture, or preparation.
- A restaurant can use it as a lightweight visual menu layer without manually photographing every dish.

### Sponsored Product Usage

MenuLens uses Tencent Cloud EdgeOne for frontend deployment.

EdgeOne is a strong fit for this project because the first user interaction should load quickly from the edge, especially on mobile at a restaurant table. The static React frontend is built from the `frontend` directory and deployed as an optimized production bundle.

Deployment settings:

```text
Production branch: main
Preset framework: React
Root directory: frontend
Build output directory: build
Build command: npm run build
Install command: npm install --legacy-peer-deps
```

For frontend-only deployment, no secret API keys are required in EdgeOne. A complete production deployment should point the frontend to a hosted backend with:

```text
REACT_APP_BACKEND_URL=https://your-backend-domain
```

## Architecture

```text
Menu Photo
   |
   v
React Frontend
   |
   | POST /api/analyze-menu
   v
FastAPI Backend
   |
   | image + prompt
   v
OpenAI GPT-5.2
   |
   | structured menu JSON
   v
Query Normalizer and Fallback Search Builder
   |
   | dish image queries
   v
Brave Image Search
   |
   | image URL + source URL
   v
Visual Dish Cards
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Tailwind CSS, CRACO, lucide-react, Sonner |
| Backend | FastAPI, Pydantic, HTTPX, Motor template wiring |
| AI | OpenAI GPT-5.2 vision extraction |
| Image Search | Brave Search API |
| Deployment | Tencent Cloud EdgeOne frontend deployment |

## Repository Layout

```text
.
|-- backend/
|   |-- server.py
|   |-- requirements.txt
|   `-- tests/
|-- frontend/
|   |-- src/
|   |-- public/
|   |-- package.json
|   `-- package-lock.json
|-- memory/
|   `-- PRD.md
`-- README.md
```

## Local Development

### Backend

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install openai

export OPENAI_API_KEY="your-openai-key"
export BRAVE_SEARCH_API_KEY="your-brave-key"
export MONGO_URL="mongodb://localhost:27017"
export DB_NAME="menulens"
export CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"

uvicorn backend.server:app --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
REACT_APP_BACKEND_URL=http://127.0.0.1:8000 npm start
```

Open:

```text
http://localhost:3000
```

## API

### `GET /api/health`

Returns backend status and whether OpenAI and Brave keys are configured.

### `POST /api/analyze-menu`

Multipart form upload:

```text
image: JPEG, PNG, or WEBP menu photo
```

Response shape:

```json
{
  "restaurant_name": "Example Restaurant",
  "detected_cuisine": "South Indian",
  "items": [
    {
      "name": "Sambar Idli",
      "description": "Steamed rice cakes served with lentil stew.",
      "category": "Quick Bites",
      "price": "$7.95",
      "search_queries": ["Sambar Idli food"],
      "visual_keywords": ["steamed rice cake", "lentil stew"],
      "confidence": 0.9,
      "image_url": "https://...",
      "image_source_url": "https://...",
      "image_source_name": "example.com"
    }
  ]
}
```

## Image Search Reliability

The app intentionally uses broad fallback search behavior.

Menu text often includes details that hurt image search:

- Serving counts: `- 2 Pcs`
- Vegetarian markers: `(V)`
- Restaurant-specific formatting
- Alternate spellings: `idly` vs `idli`
- Overly precise names: `Ghee Podi Thatte Idly - 1 Pc`

The backend cleans and expands those into more useful queries such as:

```text
ghee podi thatte idli food
thatte idli food
podi idli food
south indian food
```

That design choice supports the actual product goal: show enough visual context for the diner to understand the dish.

## Security Notes

- OpenAI and Brave keys belong only on the backend.
- Do not put secret keys into frontend deployment environment variables.
- The frontend should only receive `REACT_APP_BACKEND_URL`.
- The backend stores no menu scans by default.

## What Is Next

- Host the backend publicly and connect the EdgeOne frontend to it.
- Add saved scan history.
- Add shareable dish cards.
- Add multi-photo menu support.
- Add dietary labels and allergen hints.
- Add image result reranking for higher visual relevance.

## One-Line Pitch

MenuLens is an AI-powered visual menu translator: snap a menu, see the food, order with confidence.
