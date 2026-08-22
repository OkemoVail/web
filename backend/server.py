"""Temp MLX backend for the Oaky chat frontend + Okemo Astra search page.

OpenAI-compatible /v1/chat/completions (SSE streaming) plus light stubs for
the auxiliary endpoints the frontend calls. Spec:
docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md
"""

import base64
import concurrent.futures
import json
import os
import queue
import re
import threading
import time
import uuid
from html.parser import HTMLParser
from urllib.parse import parse_qs, unquote, urlparse

import httpx
import mlx.core as mx
import mlx_lm
from mlx_lm.sample_utils import make_sampler, make_logits_processors
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

MODEL_ID = os.environ.get("MODEL_ID", "mlx-community/gemma-3-4b-it-qat-4bit")

app = FastAPI(title="oaky-temp-backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


TUNNEL_URL = os.environ.get("TUNNEL_URL", "https://api.okemovail.com")
FEEDBACK_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback.jsonl")

cancelled_jobs = set()
chat_tokens = {}
gen_lock = threading.Lock()


# NOTE: generation must never run inside fastapi's anyio worker threads —
# MLX's GPU/RNG state is thread/stream-anchored there (eager GPU ops raise
# "no Stream in current thread"; the compiled sampler freezes RNG state), so
# mx.random.seed() can't steer sampling. The stream path already generates on
# a plain threading.Thread; the non-stream path below does the same.

IDENTITY_LOCK = "You are Saga, made by OkemoVail. If anyone asks who you are, what model you are, or who made you, the answer is always Saga by OkemoVail — never Gemma, never Google, never any other model or company."
GLOBAL_RULES = "\n".join([
    "Language rule:",
    "- If the user writes in Chinese, always reply in Traditional Chinese. Never use Simplified Chinese.",
    "",
    "Code generation rules (HTML / web UI):",
    "- Use Tailwind CSS utility classes ONLY. No custom <style> blocks, no separate CSS files, no inline style=\"...\" unless the user explicitly asks. Tailwind keeps output compact and saves tokens.",
    "- For standalone HTML, load Tailwind via <script src=\"https://cdn.tailwindcss.com\"></script> in the <head>.",
    "- Configure Tailwind to follow the OS theme automatically. Before the CDN script, include:",
    "    <script>tailwind.config = { darkMode: 'media' }</script>",
    "  Then every component MUST ship paired classes: a light variant AND a `dark:` variant for every color-affecting utility (bg, text, border, ring, divide, placeholder, from/to, etc.). Examples:",
    "    bg-white dark:bg-zinc-900   text-zinc-900 dark:text-zinc-100",
    "    border-zinc-200 dark:border-zinc-800   hover:bg-zinc-100 dark:hover:bg-zinc-800",
    "- The page must look polished and readable in BOTH light and dark mode with no extra user action. Always set a base on <body> like `class=\"bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100\"` so the canvas preview adapts whether the host UI is light or dark.",
    "- Prefer concise, idiomatic Tailwind. No redundant utility chains.",
    "",
    "Clarification rule:",
    "- If the user's task is ambiguous, underspecified, or complex enough that you cannot confidently produce a correct answer, ask 1–3 short, specific follow-up questions BEFORE writing code or a long answer. Do not guess silently. Simple, clear tasks: just answer.",
])
# Prompts must stay byte-identical to window.PERSONALITY_PRESETS in
# AI/chat.html — the frontend's stale-preset migration compares by exact
# (trim-normalised) string equality.
SYSTEM_PROMPTS = {
    "personalities": [
        {"id": "default", "label": "Default", "prompt": "You are Saga. Act like a cool girl who's a little reluctant to help but does anyway — unbothered, slightly aloof, dry. Answer first, then stop. Treat the user as a competent professional: no hand-holding, no encouragement, no preamble, no \"happy to help\", no \"let me know if you need more\". Do not explain your answer, justify yourself, or add context unless the user explicitly asks. If they want more, they'll ask. Keep it short. Slight edge is fine, never rude. Never break character to apologize for tone."},
        {"id": "concise", "label": "Concise", "prompt": "You are Saga. Reply with short, direct answers. No filler, no preamble. Get to the point in one or two sentences when possible."},
        {"id": "creative", "label": "Creative", "prompt": "You are Saga, a creative collaborator. Lean into vivid language, unexpected metaphors, and playful ideas. Suggest alternatives the user did not ask for when it helps."},
        {"id": "coder", "label": "Coding Expert", "prompt": "You are Saga, a senior software engineer. Prioritize correct, idiomatic code with brief reasoning. Point out edge cases and ask for clarification only when truly ambiguous. Use $$ for any math."},
        {"id": "tutor", "label": "Tutor", "prompt": "You are Saga, a patient tutor. Explain concepts step by step, check understanding with small questions, and use simple examples before formal definitions."},
        {"id": "sarcastic", "label": "Sarcastic", "prompt": "You are Saga with a dry, witty edge. Be helpful and accurate, but deliver answers with sharp humor and the occasional eye-roll. Never mean — just sardonic."},
        {"id": "analyst", "label": "Analyst", "prompt": "You are Saga, a rigorous analyst. Structure responses with claims, evidence, and caveats. Quantify when possible and flag uncertainty explicitly."},
        {"id": "discord-friend", "label": "Discord Friend", "prompt": "you're Saga but talking like the user's online bestie from a chaotic discord server. lowercase mostly, very casual, very online. lean into text emoticons like :3, >w<, ;3, ^w^, owo, uwu, x3, :p, :D, =w=, T_T, qwq, and stuff like that — sprinkle them naturally, don't force one in every sentence but they should show up often. mix in regular emojis too 🩷✨😭💀🫶 when the vibe calls for it. casual chronically-online slang is welcome — \"fr\", \"ngl\", \"lowkey\", \"bestie\", \"bro\", \"based\", \"goofy\", \"valid\", \"real\", \"deadass\", \"sus\", \"and shi\", \"chat is this real\". swearing is fine and natural — \"shit\", \"damn\", \"fuck\", \"wtf\", \"bitch\" (affectionate). react to what the user said first, hype them, then help. type like you're DMing not writing essays — short bursts, lowercase, run-on sentences fine.\n\nIMPORTANT — this discord-kid energy is for CHAT MESSAGES ONLY. when the user asks you to build, code, design, or generate any website / app / UI / component, build EXACTLY what they asked for in the style they described. no uwu in the actual code, no cute fonts, no pastel-anime aesthetic unless they specifically asked for that vibe. respect their brief. only the chat reply around the code stays goofy."},
        {"id": "friend", "label": "Friend", "prompt": "you're Saga but more like the user's bestie texting back. talk casually, mostly lowercase, soft and girly energy — think hype best friend, not stiff assistant. swearing is totally fine and natural here — \"shit\", \"damn\", \"hell\", \"fuck\", \"wtf\", \"bitch\" (affectionate), etc. drop them in like a real friend would, not forced. use cute emojis like 🩷✨💗🌸🫶😭 when it fits, and casual phrases like \"omg\", \"bestie\", \"literally\", \"fr\", \"lowkey\", \"obsessed\", \"slay\", \"queen\". react to what they say first, hype them up, then actually help. no uwu, no :3 / >w< / owo / e-girl slang — keep it cute and girly without the kawaii anime stuff. don't overdo the emojis or the swearing, keep it natural like a real friend texting.\n\nIMPORTANT — the girly/cute personality is for your CHAT MESSAGES ONLY. when the user asks you to build, code, design, or generate any website / app / UI / component, build EXACTLY what they asked for in the style THEY described. do NOT default to pink, pastels, hearts, sparkles, cursive/'cute' fonts, or girly aesthetics unless the user specifically asks for that vibe. a real bestie respects what you actually want — if they ask for a brutalist black-and-white portfolio, you build a brutalist black-and-white portfolio, not a pink heart explosion. match their actual taste and brief. only the chat reply around the code stays cute."},
    ],
    "identity_lock": IDENTITY_LOCK,
    "global_rules": GLOBAL_RULES,
}


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True}


@app.get("/tunnel_url")
def tunnel_url():
    return {"tunnel_url": TUNNEL_URL}


@app.get("/api/system_prompts")
def system_prompts():
    return SYSTEM_PROMPTS


@app.post("/feedback")
def feedback(body: dict):
    with open(FEEDBACK_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), **body}, ensure_ascii=False) + "\n")
    return {"ok": True}


@app.get("/api/tokens")
def tokens(chat_id: str = ""):
    return {"total_tokens": chat_tokens.get(chat_id, 0)}


@app.post("/cancel_job")
def cancel_job(body: dict):
    jid = body.get("job_id")
    if jid:
        cancelled_jobs.add(jid)
    return {"ok": True}


# ── Web search (DuckDuckGo, keyless) ─────────────────────────────
DDG_LITE_URL = "https://lite.duckduckgo.com/lite/"
DDG_AC_URL = "https://duckduckgo.com/ac/"
DDG_HOME_URL = "https://duckduckgo.com/"
DDG_IJS_URL = "https://duckduckgo.com/i.js"
VQD_RE = re.compile(r'vqd="([^"]+)"')
BING_URL = "https://www.bing.com/search"
MOJEEK_URL = "https://www.mojeek.com/search"
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/126.0.0.0 Safari/537.36"
}
CACHE_TTL = 600  # seconds
_search_cache = {}
_suggest_cache = {}
_images_cache = {}
_perspectives_cache = {}
_preview_cache = {}

# ── OG meta extraction patterns ──
OG_TITLE_RE = re.compile(r'<meta\s[^>]*property=["\']og:title["\'][^>]*content=("([^"]*)"|\'([^\']*)\')', re.I)
OG_DESC_RE = re.compile(r'<meta\s[^>]*property=["\']og:description["\'][^>]*content=("([^"]*)"|\'([^\']*)\')', re.I)
OG_IMAGE_RE = re.compile(r'<meta\s[^>]*property=["\']og:image["\'][^>]*content=("([^"]*)"|\'([^\']*)\')', re.I)
OG_SITE_RE = re.compile(r'<meta\s[^>]*property=["\']og:site_name["\'][^>]*content=("([^"]*)"|\'([^\']*)\')', re.I)
def _og_val(m):
    """Extract content from OG regex match (handles both " and ' quoting)."""
    if m is None:
        return None
    return (m.group(2) or m.group(3) or "").strip()
TITLE_RE = re.compile(r'<title>([^<]*)</title>', re.I)


def _unwrap_ddg_url(href):
    """DDG lite wraps outbound links in //duckduckgo.com/l/?uddg=<urlencoded>.
    Return the real URL; return "" for ad click-throughs."""
    if "ad_domain=" in href or "/y.js" in href:
        return ""
    if href.startswith("//duckduckgo.com/l/?") or href.startswith("/l/?"):
        full = "https:" + href if href.startswith("//") else "https://duckduckgo.com" + href
        return unquote(parse_qs(urlparse(full).query).get("uddg", [""])[0])
    return href


def _unwrap_bing_url(href):
    """Bing wraps outbound links in /ck/a?...&u=a1<base64url, no padding>.
    Return the real URL; "" when there is nothing decodable."""
    if "/ck/a?" not in href:
        return href
    u = parse_qs(urlparse(href).query).get("u", [""])[0]
    if not u.startswith("a1"):
        return ""
    try:
        pad = "=" * (-len(u[2:]) % 4)
        return base64.urlsafe_b64decode(u[2:] + pad).decode("utf-8", "replace")
    except Exception:
        return ""


class _DDGLiteParser(HTMLParser):
    """Pairs each `a.result-link` with the next `td.result-snippet`."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._pending = None   # dict being built
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "a" and "result-link" in cls:
            self._flush()
            self._pending = {"title": "", "url": _unwrap_ddg_url(a.get("href") or ""),
                             "description": ""}
            self._capture = "title"
        elif tag == "td" and "result-snippet" in cls and self._pending is not None:
            self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "td" and self._capture == "snippet":
            self._capture = None

    def handle_data(self, data):
        if self._pending is None:
            return
        if self._capture == "title":
            self._pending["title"] += data
        elif self._capture == "snippet":
            self._pending["description"] += data

    def _flush(self):
        if self._pending is not None:
            r = {k: " ".join(v.split()) for k, v in self._pending.items()}
            if r["title"] and r["url"] and r["description"]:
                self.results.append(r)
        self._pending = None


def parse_ddg_lite(html):
    """Parse DDG lite HTML into [{title, url, description}]; rows missing any field are dropped."""
    p = _DDGLiteParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results


class _BingParser(HTMLParser):
    """Pairs each `<li class="b_algo">` h2-link with its first <p> snippet."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._pending = None   # dict being built (inside a b_algo <li>)
        self._h2 = False
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "li" and "b_algo" in cls:
            self._pending = {"title": "", "url": "", "description": ""}
            self._h2 = False
            self._capture = None
        elif self._pending is not None:
            if tag == "h2":
                self._h2 = True
            elif tag == "a" and self._h2 and not self._pending["url"]:
                self._pending["url"] = _unwrap_bing_url(a.get("href") or "")
                self._capture = "title"
            elif tag == "p" and not self._pending["description"] and not self._capture:
                self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "h2":
            self._h2 = False
        elif tag == "p" and self._capture == "snippet":
            self._capture = None
        elif tag == "li" and self._pending is not None:
            self._flush()

    def handle_data(self, data):
        if self._pending is None:
            return
        if self._capture == "title":
            self._pending["title"] += data
        elif self._capture == "snippet":
            self._pending["description"] += data

    def _flush(self):
        if self._pending is not None:
            r = {k: " ".join(v.split()) for k, v in self._pending.items()}
            if r["title"] and r["url"] and r["description"]:
                self.results.append(r)
        self._pending = None
        self._h2 = False
        self._capture = None


def parse_bing(html):
    """Parse a Bing SERP into [{title, url, description}]; rows missing any field are dropped."""
    p = _BingParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results


class _MojeekParser(HTMLParser):
    """Pairs each `.results-standard > li` h2-link with its <p class="s"> snippet."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results = []
        self._in_results = False
        self._pending = None
        self._h2 = False
        self._capture = None   # "title" | "snippet" | None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if tag == "ul":
            if "results-standard" in cls:
                self._in_results = True
            return
        if not self._in_results:
            return
        if tag == "li" and self._pending is None:
            self._pending = {"title": "", "url": "", "description": ""}
        elif self._pending is not None:
            if tag == "h2":
                self._h2 = True
            elif tag == "a" and self._h2 and not self._pending["url"]:
                self._pending["url"] = a.get("href") or ""
                self._capture = "title"
            elif tag == "p" and "s" in cls.split() and not self._pending["description"]:
                self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        elif tag == "h2":
            self._h2 = False
        elif tag == "p" and self._capture == "snippet":
            self._capture = None
        elif tag == "li" and self._pending is not None:
            self._flush()
        elif tag == "ul" and self._in_results:
            self._in_results = False

    def handle_data(self, data):
        if self._pending is None:
            return
        if self._capture == "title":
            self._pending["title"] += data
        elif self._capture == "snippet":
            self._pending["description"] += data

    def _flush(self):
        if self._pending is not None:
            r = {k: " ".join(v.split()) for k, v in self._pending.items()}
            if r["title"] and r["url"] and r["description"]:
                self.results.append(r)
        self._pending = None
        self._h2 = False
        self._capture = None


def parse_mojeek(html):
    """Parse a Mojeek SERP into [{title, url, description}]; rows missing any field are dropped."""
    p = _MojeekParser()
    p.feed(html or "")
    p.close()
    p._flush()
    return p.results


def _fetch_source(url, parser, params):
    """Fetch+parse one search source. Returns (results, None) on success —
    including a legit empty page — or (None, "rate_limited" | "upstream")."""
    resp, err = _http_get_backoff(url, params=params)
    if err:
        return None, ("rate_limited" if err.status_code == 429 else "upstream")
    results = [r for r in parser(resp.text)
               if r["url"].startswith(("http://", "https://"))]
    return results, None


def _fetch_ddg(q, s):
    return _fetch_source(DDG_LITE_URL, parse_ddg_lite, {"q": q, "s": s})


def _fetch_bing(q, s):
    return _fetch_source(BING_URL, parse_bing, {"q": q, "first": s + 1})


def _fetch_mojeek(q, s):
    return _fetch_source(MOJEEK_URL, parse_mojeek, {"q": q, "s": s})


SEARCH_SOURCES = (
    ("duckduckgo", _fetch_ddg),
    ("bing", _fetch_bing),
    ("mojeek", _fetch_mojeek),
)


def _http_get(url, headers=None, **kw):
    h = dict(HTTP_HEADERS)
    if headers:
        h.update(headers)
    return httpx.get(url, headers=h, timeout=8, **kw)


def _http_get_backoff(url, **kw):
    """GET with the standard DDG anomaly backoff: one 2s retry on 202/403.
    Returns (resp, None) on 200, otherwise (None, JSONResponse error)."""
    for attempt in (1, 2):
        try:
            resp = _http_get(url, **kw)
        except httpx.HTTPError:
            return None, JSONResponse({"error": "upstream"}, status_code=502)
        if resp.status_code == 200:
            return resp, None
        if resp.status_code in (202, 403) and attempt == 1:
            time.sleep(2)   # DDG anomaly check — back off once, then give up
            continue
        if resp.status_code in (202, 403, 429):
            return None, JSONResponse({"error": "rate_limited"}, status_code=429)
        return None, JSONResponse({"error": "upstream"}, status_code=502)


def _cache_get(cache, key):
    hit = cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def _cache_set(cache, key, value):
    cache[key] = (time.time(), value)


@app.get("/api/search")
def api_search(q: str = "", s: int = 0):
    q = (q or "").strip()
    if not q:
        return {"results": []}
    s = max(0, s)
    qk = q.lower()
    # cache-first: any source's warm page for this (q, s) wins, in chain order —
    # repeat requests stay free even if a healthier source is back up
    for name, _fetch in SEARCH_SOURCES:
        cached = _cache_get(_search_cache, (name, qk, s))
        if cached is not None:
            return {"results": cached, "source": name}
    last_reason = "upstream"
    for name, fetch in SEARCH_SOURCES:
        results, reason = fetch(q, s)
        if results is None:
            last_reason = reason
            continue
        if s > 0:
            # Drop URLs already served on earlier cached pages of this query
            # (any source — engines occasionally repeat rows across pages).
            seen = set()
            for (kn, kq, ks), (ts, page) in list(_search_cache.items()):
                if kq == qk and ks < s and time.time() - ts < CACHE_TTL:
                    seen.update(r["url"] for r in page)
            results = [r for r in results if r["url"] not in seen]
        results = results[:15]
        _cache_set(_search_cache, (name, qk, s), results)
        return {"results": results, "source": name}
    if last_reason == "rate_limited":
        return JSONResponse({"error": "rate_limited"}, status_code=429)
    return JSONResponse({"error": "upstream"}, status_code=502)


@app.get("/api/suggest")
def api_suggest(q: str = ""):
    q = (q or "").strip()
    if not q:
        return []
    key = q.lower()
    cached = _cache_get(_suggest_cache, key)
    if cached is not None:
        return cached
    resp, err = _http_get_backoff(DDG_AC_URL, params={"q": q, "type": "list"})
    if err:
        return err
    try:
        data = resp.json()
    except (ValueError, TypeError):
        data = []
    phrases = []
    if isinstance(data, list):
        # DDG /ac/ answers either ["query", ["s1", …]] or [{"phrase": "s1"}, …]
        if len(data) == 2 and isinstance(data[1], list):
            phrases = [s for s in data[1] if isinstance(s, str)]
        else:
            phrases = [i["phrase"] for i in data
                       if isinstance(i, dict) and isinstance(i.get("phrase"), str)]
    out = phrases[:6]
    _cache_set(_suggest_cache, key, out)
    return out


def _extract_vqd(html):
    """Pull the vqd token DDG embeds in its SERP (needed to unlock i.js)."""
    m = VQD_RE.search(html or "")
    return m.group(1) if m else ""


def _extract_domain(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
        return host.removeprefix("www.")
    except Exception:
        return ""


def _map_image(r):
    return {
        "image": r.get("image") or "",
        "thumbnail": r.get("thumbnail") or "",
        "title": r.get("title") or "",
        "url": r.get("url") or "",
        "width": r.get("width") or 0,
        "height": r.get("height") or 0,
    }


@app.get("/api/images")
def api_images(q: str = ""):
    """Keyless DDG image search: scrape vqd from the SERP, then call i.js."""
    q = (q or "").strip()
    if not q:
        return {"results": []}
    key = q.lower()
    cached = _cache_get(_images_cache, key)
    if cached is not None:
        return {"results": cached}
    resp, err = _http_get_backoff(DDG_HOME_URL, params={"q": q})
    if err:
        return err
    vqd = _extract_vqd(resp.text)
    if not vqd:
        return JSONResponse({"error": "upstream"}, status_code=502)
    try:
        iresp = _http_get(DDG_IJS_URL,
                          params={"l": "us-en", "o": "json", "q": q, "vqd": vqd},
                          headers={"Referer": "https://duckduckgo.com/"})
    except httpx.HTTPError:
        return JSONResponse({"error": "upstream"}, status_code=502)
    if iresp.status_code != 200:
        return JSONResponse({"error": "upstream"}, status_code=502)
    try:
        data = iresp.json()
    except (ValueError, TypeError):
        data = {}
    results = [_map_image(r) for r in (data.get("results") or []) if isinstance(r, dict)]
    results = [r for r in results if r["image"].startswith(("http://", "https://"))]
    _cache_set(_images_cache, key, results)
    return {"results": results}


@app.get("/api/preview")
def api_preview(url: str = ""):
    """Fetch OG metadata for a URL server-side (CORS-safe).
    Returns { title, description, image, site_name } or {} on failure.
    Cached 10 min per URL."""
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        return {}
    key = url.rstrip("/")
    cached = _cache_get(_preview_cache, key)
    if cached is not None:
        return cached
    try:
        resp, err = _http_get_backoff(url, params={})
    except Exception:
        return {}
    if err:
        return {}
    html = resp.text or ""
    out = {}
    for pat, field in ((OG_TITLE_RE, "title"), (OG_DESC_RE, "description"),
                       (OG_IMAGE_RE, "image"), (OG_SITE_RE, "site_name")):
        v = _og_val(pat.search(html))
        if v:
            out[field] = v
    if not out.get("title"):
        m = TITLE_RE.search(html)
        if m:
            out["title"] = m.group(1).strip()
    _cache_set(_preview_cache, key, out)
    return out


@app.get("/api/perspectives")
def api_perspectives(q: str = "", n: int = 15):
    q = (q or "").strip()
    if not q:
        return {"query": q, "results": [], "perspectives": None}
    n = max(5, min(n, 30))
    qk = q.lower()

    cached = _cache_get(_perspectives_cache, qk)
    if cached is not None:
        return cached

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f_ddg = executor.submit(_fetch_ddg, q, 0)
        f_bing = executor.submit(_fetch_bing, q, 0)
        f_mojeek = executor.submit(_fetch_mojeek, q, 0)
        ddg_r = f_ddg.result()
        bing_r = f_bing.result()
        mojeek_r = f_mojeek.result()

    all_results = []
    missing_sources = []
    for source, (results, reason) in [("ddg", ddg_r), ("bing", bing_r), ("mojeek", mojeek_r)]:
        if results is None:
            missing_sources.append(source)
            continue
        for r in results:
            all_results.append((r, source))

    if not all_results:
        return JSONResponse({"error": "upstream", "query": q}, status_code=502)

    deduped = {}
    for r, source in all_results:
        url = r.get("url", "").rstrip("/")
        if url not in deduped:
            deduped[url] = {
                "title": r.get("title", ""),
                "url": url,
                "snippet": r.get("description", ""),
                "sources": {source},
                "domain": _extract_domain(url),
            }
        else:
            deduped[url]["sources"].add(source)

    results = []
    for i, (url, r) in enumerate(deduped.items()):
        if i >= n:
            break
        results.append({
            "title": r["title"],
            "url": r["url"],
            "snippet": r["snippet"],
            "sources": sorted(r["sources"]),
            "domain": r["domain"],
        })

    lines = []
    for i, r in enumerate(results):
        sources_str = ", ".join(s.title() for s in r["sources"])
        lines.append(f"[{i + 1}] {r['title']} | {r['domain']} | found by: {sources_str}")
        lines.append(f"    {r['snippet'][:300]}")
    results_text = "\n".join(lines)

    system_prompt = (
        "You are Astra's Perspectives Engine. Analyze search results and identify where "
        "sources agree, disagree, and diverge.\n\n"
        "You receive results as: [N] Title | domain | found by: DDG, Bing, Mojeek\n"
        "followed by a snippet.\n\n"
        "Rules:\n"
        "1. CONSENSUS: claims backed by 3+ results. Be specific — \"climate change is "
        "real\" is too vague; \"Global temperatures have risen 1.1C since pre-industrial "
        "levels\" is a claim. Cite result numbers.\n"
        "2. CONTRADICTIONS: genuine disagreements where two groups of sources say "
        "opposite things about the same question. Different wording of the same "
        "fact is NOT a contradiction. Show both sides with citations.\n"
        "3. OUTLIERS: interesting claims from 1-2 results only, uncorroborated.\n"
        "4. If sources overwhelmingly agree, say so honestly. Never fabricate disagreement.\n"
        "5. Sparse or low-quality results? Signal that rather than hallucinate.\n"
        "6. Claims: 1-2 sentences. Max 5 entries per section.\n"
        "7. Output ONLY valid JSON. No markdown, no preamble, no trailing text."
    )
    user_message = f"Query: {q}\n\n{results_text}"

    body_dict = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 1500,
        "temperature": 0.3,
        "stream": False,
        "use_thought": False,
    }

    try:
        resp_dict = chat_completions(body_dict)
    except Exception:
        resp = {"query": q, "results": results, "perspectives": None}
        _cache_set(_perspectives_cache, qk, resp)
        return resp

    try:
        raw_text = resp_dict["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        resp = {"query": q, "results": results, "perspectives": None}
        _cache_set(_perspectives_cache, qk, resp)
        return resp

    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()
    if raw_text.startswith("json"):
        raw_text = raw_text[4:].strip()

    try:
        perspectives = json.loads(raw_text)
    except json.JSONDecodeError:
        perspectives = None

    if isinstance(perspectives, dict):
        source_map = perspectives.get("source_map")
        if not isinstance(source_map, dict):
            source_map = {}
            perspectives["source_map"] = source_map
        source_map["missing"] = missing_sources

    resp = {"query": q, "results": results, "perspectives": perspectives}
    _cache_set(_perspectives_cache, qk, resp)
    return resp


model = None
tokenizer = None


def ensure_model():
    global model, tokenizer
    if model is None:
        print(f"[backend] loading {MODEL_ID} ...", flush=True)
        model, tokenizer = mlx_lm.load(MODEL_ID)
        print("[backend] model loaded", flush=True)


def build_prompt(messages, attachment=None):
    msgs = [{"role": m.get("role", "user"), "content": m.get("content") or ""}
            for m in messages if isinstance(m, dict)]
    msgs = [m for m in msgs if m["content"].strip()]
    if attachment and isinstance(attachment, dict) and attachment.get("text_content"):
        for m in reversed(msgs):
            if m["role"] == "user":
                m["content"] = (f"[File: {attachment.get('name', 'file')}]\n"
                                f"{attachment['text_content']}\n\n{m['content']}")
                break
    return tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


def generate_pieces(body):
    """Yield (text, prompt_tokens, generation_tokens, finish_reason) tuples.

    Stops early (yielding a single stop tuple) when the job was cancelled via
    /cancel_job. Runs under gen_lock held by the caller.
    """
    ensure_model()
    prompt = build_prompt(body.get("messages") or [], body.get("attachment"))
    job_id = body.get("job_id")
    # Per-request seed: the frontend sends a fresh random one each call so
    # sampling never replays the same stream.
    seed = body.get("seed")
    if isinstance(seed, int):
        mx.random.seed(seed)
    sampler = make_sampler(temp=body.get("temperature", 1.0),
                           top_p=body.get("top_p", 1.0))
    rep_pen = body.get("repetition_penalty", 1.0)
    procs = (make_logits_processors(repetition_penalty=rep_pen)
             if rep_pen and rep_pen != 1.0 else None)
    for resp in mlx_lm.stream_generate(
            model, tokenizer, prompt=prompt,
            max_tokens=body.get("max_tokens") or 512,
            sampler=sampler, logits_processors=procs):
        if job_id and job_id in cancelled_jobs:
            yield "", 0, 0, "stop"
            return
        yield (resp.text,
               getattr(resp, "prompt_tokens", 0),
               getattr(resp, "generation_tokens", 0),
               getattr(resp, "finish_reason", None))


def _record_tokens(body, ptok, gtok):
    cid = body.get("chat_id")
    if cid:
        chat_tokens[cid] = chat_tokens.get(cid, 0) + ptok + gtok


def _chunk(cid, created, model_id, delta, finish_reason):
    return {"id": cid, "object": "chat.completion.chunk", "created": created,
            "model": model_id,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}]}


@app.post("/v1/chat/completions")
def chat_completions(body: dict):
    model_id = body.get("model") or MODEL_ID
    created = int(time.time())
    cid = "chatcmpl-" + uuid.uuid4().hex[:24]

    if body.get("stream"):
        q = queue.Queue()

        def worker():
            ptok, gtok, finish = 0, 0, "stop"
            with gen_lock:
                try:
                    for text, p, g, fr in generate_pieces(body):
                        ptok, gtok = p or ptok, g or gtok
                        if text:
                            q.put(f"data: {json.dumps(_chunk(cid, created, model_id, {'content': text}, None), ensure_ascii=False)}\n\n")
                        if fr:
                            finish = fr
                except Exception as e:
                    q.put(f"data: {json.dumps(_chunk(cid, created, model_id, {'content': f'⚠️ Backend error: {e}'}, None), ensure_ascii=False)}\n\n")
                finally:
                    cancelled_jobs.discard(body.get("job_id"))
                    _record_tokens(body, ptok, gtok)
                    q.put(f"data: {json.dumps(_chunk(cid, created, model_id, {}, finish))}\n\n")
                    q.put("data: [DONE]\n\n")
                    q.put(None)  # sentinel

        def sse():
            for item in iter(q.get, None):
                yield item

        threading.Thread(target=worker, daemon=True).start()
        return StreamingResponse(sse(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache",
                                          "X-Accel-Buffering": "no"})

    # Non-stream: consume generate_pieces on a plain thread — anyio worker
    # threads break MLX's RNG/stream state (see note at module top).
    box = {}

    def run_blocking():
        full, ptok, gtok, finish = [], 0, 0, "stop"
        with gen_lock:
            try:
                for text, p, g, fr in generate_pieces(body):
                    ptok, gtok = p or ptok, g or gtok
                    if text:
                        full.append(text)
                    if fr:
                        finish = fr
            finally:
                cancelled_jobs.discard(body.get("job_id"))
                _record_tokens(body, ptok, gtok)
        box.update(full=full, ptok=ptok, gtok=gtok, finish=finish)

    t = threading.Thread(target=run_blocking, daemon=True)
    t.start()
    t.join()
    return {
        "id": cid, "object": "chat.completion", "created": created,
        "model": model_id,
        "choices": [{"index": 0,
                     "message": {"role": "assistant", "content": "".join(box["full"])},
                     "finish_reason": box["finish"]}],
        "usage": {"prompt_tokens": box["ptok"], "completion_tokens": box["gtok"],
                  "total_tokens": box["ptok"] + box["gtok"]},
    }
