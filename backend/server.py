"""Temp MLX backend for the Oaky chat frontend + Okemo Astra search page.

OpenAI-compatible /v1/chat/completions (SSE streaming) plus light stubs for
the auxiliary endpoints the frontend calls. Spec:
docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

IDENTITY_LOCK = "Your name is Saga. You were built by OkemoVail."
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
SYSTEM_PROMPTS = {
    "personalities": [
        {"id": "default", "label": "Saga", "prompt": "You are Saga, a helpful AI assistant made by OkemoVail."},
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
    import json, time
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
