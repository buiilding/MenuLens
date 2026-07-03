# MenuLens — Product Requirements Doc

## Problem Statement
Build a simple MVP web app that turns a restaurant menu photo into visual dish cards.
User uploads/captures a menu image → multimodal LLM extracts structured JSON menu items and search queries → Brave Search API image search → app displays one image per meal.

## Architecture
- **Backend**: FastAPI (Python), MongoDB template (not used for persistence — one-shot flow).
- **Frontend**: React 19 + Tailwind + Sonner toasts + lucide-react icons.
- **LLM**: OpenAI GPT-5.2 via `emergentintegrations.llm.chat.LlmChat` with `ImageContent` (base64).
- **Image Search**: Brave Search API (`/res/v1/images/search`), called server-side only.
- **Design**: Organic & Earthy (parchment #FDFBF7 background, terracotta #C84B31 accent, Playfair Display + Manrope).

## User Persona
Diner at a restaurant table wanting to preview unfamiliar dishes before ordering.

## Core Requirements
- Single-page utility app; upload screen is the first screen.
- POST `/api/analyze-menu` (multipart image) → strict-JSON dish list w/ image URLs.
- Backend enforces: max 25 items, max 3 queries per item, first-hit-wins, Brave key server-side only.
- Mobile-responsive; camera capture input via `capture="environment"`.
- Loading phases: analyzing → searching; graceful placeholders when no image found.

## Implemented (Feb 2026)
- Backend `/api/analyze-menu` endpoint w/ GPT-5.2 extraction, defensive JSON parsing, concurrent Brave lookups (semaphore=6), item/query caps, timeout handling.
- Backend `/api/health` for smoke-test.
- Warm/appetizing UI: upload zone (drag-drop + camera), skeleton warm-pulse loading, dish-cards grouped by category, ConfidencePill, external Source link, error/empty states, header reset.
- API keys stored server-side only in `/app/backend/.env`.

## Backlog (P1/P2)
- P1: Persistence — save previous scans to Mongo & let users revisit (currently deferred).
- P1: Copy-to-clipboard for dish name / share menu card.
- P2: Candidate reranking of Brave results (explicitly out of MVP scope).
- P2: Multi-page menu support (concat multiple photos into one scan).
- P2: Dietary tags (vegetarian/gluten-free) inferred by the LLM.

## Next Action Items
- Run testing_agent_v3 to validate `/api/analyze-menu` end-to-end and the UI flow.
- Fix any critical failures reported.
