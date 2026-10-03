"""Recipe import: recipe-scrapers -> JSON-LD fallback -> error. Plus pasted-text heuristic parser."""
import hashlib
import html as htmllib
import json
import re
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

import httpx
from bs4 import BeautifulSoup

from ..db import data_dir
from ..errors import ApiError
from .ingredients import parse_ingredient, normalize_name, classify_section

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
      "Version/17.4 Safari/605.1.15")
TRACKING = re.compile(r"^(utm_.*|fbclid|gclid|igshid|igsh|mc_.*|ref|ref_|source|si|fb_.*|_hsenc|_hsmi|share|pin_.*|cmp|ocid|spm|ssp|tag)$", re.I)

CATEGORY_WORDS = {
    "dessert": "dessert cake cookie brownie pie cobbler pudding ice cream cupcake fudge tart muffin cheesecake candy truffle crumble".split(),
    "breakfast": "breakfast pancake waffle omelet omelette oatmeal granola french toast frittata scone brunch bagel smoothie bowl hash".split(),
    "drink": "cocktail smoothie lemonade drink punch latte mocktail margarita sangria".split(),
    "snack": "snack dip hummus appetizer popcorn bites guacamole salsa energy balls trail mix".split(),
    "lunch": "sandwich wrap salad lunch panini quesadilla".split(),
}
TAG_WORDS = {
    "italian": "pasta spaghetti lasagna risotto parmesan marinara italian pesto gnocchi",
    "mexican": "taco burrito enchilada salsa tortilla mexican fajita quesadilla cilantro jalapeno",
    "asian": "soy sauce stir fry stir-fry ginger sesame teriyaki asian wok noodle",
    "indian": "curry masala tikka garam indian paneer naan",
    "thai": "thai coconut milk fish sauce lemongrass",
    "chinese": "chinese hoisin bok choy",
    "japanese": "japanese miso sushi ramen teriyaki",
    "greek": "greek feta tzatziki gyro",
    "american": "burger bbq barbecue mac and cheese meatloaf",
    "chicken": "chicken", "beef": "beef steak brisket", "pork": "pork bacon sausage ham", "seafood": "salmon shrimp fish tuna cod crab",
    "vegetarian": "vegetarian", "vegan": "vegan", "gluten-free": "gluten-free gluten free",
    "quick": "15-minute 20-minute 30-minute quick easy", "slow-cooker": "slow cooker crockpot crock-pot", "instant-pot": "instant pot pressure cooker",
}


def clean_url(url: str) -> str:
    url = (url or "").strip()
    m = re.search(r"https?://\S+", url)
    if m:
        url = m.group(0)
    elif url:
        url = "https://" + url
    p = urlparse(url)
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(q), ""))


def _int(v):
    try:
        return int(round(float(v))) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _minutes_iso(s):
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return int(s)
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?", str(s).strip())
    if not m or not any(m.groups()):
        return _int(s) if re.fullmatch(r"\d+", str(s).strip()) else None
    d, h, mi = (int(x or 0) for x in m.groups())
    return d * 1440 + h * 60 + mi


def _yield_int(v):
    if isinstance(v, list):
        v = v[0] if v else None
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else None


def infer_category(title, hint=None):
    text = f"{title} {hint or ''}".lower()
    # title keywords outrank scraper hint
    for cat in ("drink", "dessert", "breakfast", "snack", "lunch"):
        if any(re.search(rf"\b{re.escape(w)}", text) for w in CATEGORY_WORDS[cat]):
            return cat
    if re.search(r"\b(main|dinner|entree|supper)\b", text):
        return "dinner"
    return "dinner"


def infer_tags(title, ingredient_names, extra=()):
    text = " " + (title + " " + " ".join(ingredient_names)).lower() + " "
    tags = [t for t, words in TAG_WORDS.items() if _has(text, words)]
    for e in extra:
        e = (e or "").strip().lower()
        if e and 2 < len(e) < 20 and len(e.split()) <= 2 and "recipe" not in e and e not in tags and len(tags) < 6:
            tags.append(e)
    return tags[:8]


def _has(text, words):
    # words are space-separated single tokens, except a few known phrases
    phrases = [p for p in ("soy sauce", "stir fry", "coconut milk", "fish sauce", "bok choy", "mac and cheese", "gluten free",
                           "slow cooker", "instant pot", "pressure cooker", "garam masala") if p in words]
    rest = words
    for p in phrases:
        rest = rest.replace(p, "")
    return any(p in text for p in phrases) or any(f" {w}" in text for w in rest.split())


def build_ingredients(raws):
    out = []
    for raw in raws:
        raw = re.sub(r"\s+", " ", htmllib.unescape(str(raw))).strip()
        if not raw:
            continue
        p = parse_ingredient(raw)
        p["section"] = classify_section(p["name"], p["unit"])
        out.append(p)
    return out


def _split_steps(v):
    steps = []
    if isinstance(v, str):
        v = [s for s in re.split(r"\n+", v)]
    for s in v or []:
        if isinstance(s, dict):
            if "itemListElement" in s:
                steps += _split_steps(s["itemListElement"])
                continue
            s = s.get("text") or s.get("name") or ""
        s = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", str(s)))).strip()
        if s:
            steps.append(s)
    return steps


def finalize(d: dict, url=None) -> dict:
    ings = build_ingredients(d.get("ingredients") or [])
    title = (d.get("title") or "").strip()
    if not title or not ings:
        raise ApiError(422, "Couldn't find a title and ingredients on that page. Try pasting the recipe text instead.", "scrape_failed")
    kw = d.get("keywords") or []
    return {
        "title": htmllib.unescape(title), "source_url": url, "image_url": d.get("image"),
        "description": re.sub(r"\s+", " ", htmllib.unescape(d.get("description") or "")).strip()[:600],
        "servings": _yield_int(d.get("yields")), "prep_min": _minutes_iso(d.get("prep")),
        "cook_min": _minutes_iso(d.get("cook")), "total_min": _minutes_iso(d.get("total")),
        "category": infer_category(title, d.get("category")),
        "tags": infer_tags(title, [i["name"] for i in ings], list(kw)[:3]),
        "ingredients": ings, "steps": d.get("steps") or [],
        "_image_src": d.get("image"),
    }


# ------------------------------------------------------------------ fetching
def _http_get(url: str, timeout: int, extra_headers: dict = None):
    """GET that looks like a real Chrome browser (many recipe sites block plain scripts); falls back to httpx."""
    try:
        from curl_cffi import requests as cr
        return cr.get(url, impersonate="chrome", timeout=timeout, headers=extra_headers or None, allow_redirects=True)
    except Exception:
        pass
    headers = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9"}
    headers.update(extra_headers or {})
    with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as c:
        return c.get(url)


def fetch_html(url: str) -> str:
    try:
        r = _http_get(url, 25)
    except Exception as e:
        raise ApiError(502, f"Couldn't reach that site ({type(e).__name__}). Check the link, or paste the recipe text instead.", "fetch_failed")
    if r.status_code in (401, 403, 405, 429, 503):
        raise ApiError(502, f"That site blocks automatic downloads (HTTP {r.status_code}). Open the recipe in your browser, "
                            "copy the ingredients and steps, and use 'Paste text' instead.", "fetch_blocked")
    if r.status_code >= 400:
        raise ApiError(502, f"That link didn't load (HTTP {r.status_code}). Check the link or paste the recipe text instead.", "fetch_failed")
    return r.text


# ------------------------------------------------------------------ strategies
def _via_scrapers(html, url):
    from recipe_scrapers import scrape_html
    s = scrape_html(html, org_url=url, supported_only=False)
    g = lambda f: _try(getattr(s, f))
    steps = g("instructions_list") or _split_steps(g("instructions") or "")
    return {"title": g("title"), "ingredients": g("ingredients") or [], "steps": steps,
            "image": g("image"), "description": g("description"), "yields": g("yields"),
            "prep": g("prep_time"), "cook": g("cook_time"), "total": g("total_time"),
            "category": g("category"), "keywords": _kw(g("keywords"))}


def _kw(v):
    if isinstance(v, str):
        return [x.strip() for x in v.split(",") if x.strip()]
    return list(v or [])


def _try(fn):
    try:
        return fn()
    except Exception:
        return None


def _jsonld_nodes(soup):
    for tag in soup.find_all("script", type=re.compile("ld\\+json", re.I)):
        try:
            data = json.loads(tag.string or tag.get_text() or "")
        except Exception:
            try:
                data = json.loads(re.sub(r"[\x00-\x1f]", " ", tag.get_text()))
            except Exception:
                continue
        stack = [data]
        while stack:
            n = stack.pop()
            if isinstance(n, list):
                stack += n
            elif isinstance(n, dict):
                stack += list(n.get("@graph", [])) if "@graph" in n else []
                t = n.get("@type")
                t = t if isinstance(t, list) else [t]
                if "Recipe" in t:
                    yield n
                else:
                    for v in n.values():
                        if isinstance(v, (dict, list)):
                            stack.append(v)


def _via_jsonld(html, url):
    soup = BeautifulSoup(html, "html.parser")
    for n in _jsonld_nodes(soup):
        img = n.get("image")
        if isinstance(img, list):
            img = img[0] if img else None
        if isinstance(img, dict):
            img = img.get("url")
        kw = n.get("keywords")
        return {"title": n.get("name"), "ingredients": n.get("recipeIngredient") or n.get("ingredients") or [],
                "steps": _split_steps(n.get("recipeInstructions")), "image": img, "description": n.get("description"),
                "yields": n.get("recipeYield"), "prep": n.get("prepTime"), "cook": n.get("cookTime"), "total": n.get("totalTime"),
                "category": " ".join(n.get("recipeCategory") if isinstance(n.get("recipeCategory"), list) else [n.get("recipeCategory") or ""]),
                "keywords": _kw(kw)}
    return None


def scrape_url(url: str, html: str = None) -> dict:
    return parse_html(html or fetch_html(url), url)


def parse_html(html: str, url: str) -> dict:
    last = None
    for strat in (_via_scrapers, _via_jsonld):
        try:
            d = strat(html, url)
            if d and d.get("title") and d.get("ingredients"):
                if not d.get("steps") and strat is _via_scrapers:
                    alt = _try(lambda: _via_jsonld(html, url))
                    if alt and alt.get("steps"):
                        d["steps"] = alt["steps"]
                return finalize(d, url)
        except ApiError as e:
            last = e
        except Exception as e:
            last = e
    raise ApiError(422, "Couldn't read a recipe from that page (it may need a login or not contain a recipe). "
                        "Try pasting the recipe text instead.", "scrape_failed")


# ------------------------------------------------------------------ pasted text
_ING_H = re.compile(r"^\W*(ingredients?)\W*$", re.I)
_STEP_H = re.compile(r"^\W*(instructions?|directions?|method|steps?|preparation)\W*$", re.I)
_QTY = re.compile(r"^\W*(\d|[½⅓⅔¼¾⅛])")


def parse_text(text: str) -> dict:
    lines = [l.strip() for l in text.replace("\r", "").split("\n")]
    lines = [l for l in lines if l]
    if len(lines) < 3:
        raise ApiError(422, "That text is too short to be a recipe. Include the title, ingredients and steps.", "parse_failed")
    ing, steps, mode, title = [], [], None, None
    pre = []
    servings = None
    for l in lines:
        if _ING_H.match(l):
            mode = "i"; continue
        if _STEP_H.match(l):
            mode = "s"; continue
        m = re.match(r"^(?:serves|servings|yields?|makes)\W*(\d+)", l, re.I)
        if m:
            servings = int(m.group(1)); continue
        if mode == "i":
            ing.append(l)
        elif mode == "s":
            steps.append(re.sub(r"^\W{0,2}(step\s*)?\d+[\.\):]?\s*", "", l, flags=re.I))
        else:
            pre.append(l)
    if not ing:  # no headings: quantity-led lines are ingredients, long lines are steps
        for l in pre[1:]:
            (ing if _QTY.match(l) and len(l) < 90 else steps).append(l)
    title = pre[0] if pre else lines[0]
    if not ing:
        raise ApiError(422, "Couldn't find an ingredients list in that text. Add an 'Ingredients' heading above the ingredients.", "parse_failed")
    return finalize({"title": title[:150], "ingredients": ing, "steps": steps, "yields": servings,
                     "description": " ".join(pre[1:3]) if len(pre) > 1 and len(" ".join(pre[1:3])) < 300 and mode else ""}, None)


# ------------------------------------------------------------------ image
def download_image(src: str, base_url: str = None):
    if not src:
        return None
    try:
        r = _http_get(src, 15, {"Referer": base_url} if base_url else None)
        ct = r.headers.get("content-type", "")
        if r.status_code != 200 or not ct.startswith("image/") or len(r.content) > 10_000_000 or len(r.content) < 500:
            return None
        ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif"}.get(ct.split(";")[0], ".jpg")
        name = hashlib.sha1(r.content).hexdigest()[:16] + ext
        (data_dir() / "images" / name).write_bytes(r.content)
        return f"/media/{name}"
    except Exception:
        return None
