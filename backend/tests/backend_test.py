"""
Backend integration tests for MenuLens (Menu → Dish Cards) API.
Covers: health, analyze-menu happy path, mime validation, size validation,
graceful non-menu handling, response contract & secret leakage checks.
"""

import io
import os
import json
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://menu-lens-3.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

FIXTURES = "/app/tests/fixtures"
MENU_IMG = f"{FIXTURES}/menu.jpg"
LANDSCAPE_IMG = f"{FIXTURES}/landscape.jpg"
BIG_IMG = f"{FIXTURES}/big.jpg"
GIF_FILE = f"{FIXTURES}/animated.gif"


# -------------------- Fixtures --------------------
@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def analyze_result(http):
    """Call the LLM once and share across contract tests to save time & tokens."""
    with open(MENU_IMG, "rb") as f:
        files = {"image": ("menu.jpg", f.read(), "image/jpeg")}
    r = http.post(f"{API}/analyze-menu", files=files, timeout=180)
    return r


# -------------------- Health --------------------
class TestHealth:
    def test_health_ok(self, http):
        r = http.get(f"{API}/health", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("openai_configured") is True
        assert data.get("brave_configured") is True

    def test_root(self, http):
        r = http.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert "message" in r.json()


# -------------------- Analyze menu: happy path --------------------
class TestAnalyzeMenuHappy:
    def test_status_200(self, analyze_result):
        assert analyze_result.status_code == 200, f"body={analyze_result.text[:500]}"

    def test_response_shape(self, analyze_result):
        data = analyze_result.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        # keys allowed (may be null) but present
        for k in ("restaurant_name", "detected_cuisine", "items"):
            assert k in data

    def test_items_populated(self, analyze_result):
        data = analyze_result.json()
        assert len(data["items"]) > 0, "GPT should extract at least one item"

    def test_items_capped_at_25(self, analyze_result):
        data = analyze_result.json()
        assert len(data["items"]) <= 25

    def test_item_contract(self, analyze_result):
        data = analyze_result.json()
        required = ["name", "description", "category", "price",
                    "search_queries", "visual_keywords", "confidence",
                    "image_url", "image_source_url", "image_source_name"]
        for item in data["items"]:
            for k in required:
                assert k in item, f"missing key {k} in {item}"
            assert isinstance(item["name"], str) and item["name"].strip()
            assert 0.0 <= float(item["confidence"]) <= 1.0
            assert isinstance(item["search_queries"], list)
            assert len(item["search_queries"]) <= 3
            assert isinstance(item["visual_keywords"], list)

    def test_brave_images_populated(self, analyze_result):
        data = analyze_result.json()
        with_img = [i for i in data["items"] if i.get("image_url")]
        total = len(data["items"])
        # After rate-limit fix: expect >=80% of items to have image_url populated.
        assert total > 0
        ratio = len(with_img) / total
        assert ratio >= 0.8, (
            f"Only {len(with_img)}/{total} items have images (ratio={ratio:.0%}), expected >=80%"
        )

    def test_no_secret_leak(self, analyze_result):
        body_text = analyze_result.text
        # Neither API key nor obvious prefixes should be in the response body.
        assert "BRAVE_SEARCH_API_KEY" not in body_text
        assert "OPENAI_API_KEY" not in body_text


# -------------------- Analyze menu: validation --------------------
class TestAnalyzeMenuValidation:
    def test_unsupported_mime_gif(self, http):
        with open(GIF_FILE, "rb") as f:
            files = {"image": ("animated.gif", f.read(), "image/gif")}
        r = http.post(f"{API}/analyze-menu", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "Unsupported" in r.text or "unsupported" in r.text.lower()

    def test_unsupported_mime_text(self, http):
        files = {"image": ("hello.txt", b"hello world not an image", "text/plain")}
        r = http.post(f"{API}/analyze-menu", files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_oversized_image(self, http):
        with open(BIG_IMG, "rb") as f:
            data = f.read()
        assert len(data) / (1024 * 1024) > 10, "fixture must be >10MB"
        files = {"image": ("big.jpg", data, "image/jpeg")}
        r = http.post(f"{API}/analyze-menu", files=files, timeout=60)
        assert r.status_code == 400, r.text
        assert "large" in r.text.lower() or "too" in r.text.lower()

    def test_non_menu_image_graceful(self, http):
        """A plain landscape should NOT 500 — either 422 (no items) or 200 with few items."""
        with open(LANDSCAPE_IMG, "rb") as f:
            files = {"image": ("landscape.jpg", f.read(), "image/jpeg")}
        r = http.post(f"{API}/analyze-menu", files=files, timeout=180)
        assert r.status_code in (200, 422), f"expected 200/422 got {r.status_code}: {r.text[:400]}"
        if r.status_code == 200:
            data = r.json()
            # If any items came back, ensure list is bounded and contract holds
            assert isinstance(data.get("items"), list)
            assert len(data["items"]) <= 25
