"""Temp MLX backend for the Oaky chat frontend + Okemo Astra search page.

OpenAI-compatible /v1/chat/completions (SSE streaming) plus light stubs for
the auxiliary endpoints the frontend calls. Spec:
docs/superpowers/specs/2026-08-11-temp-mlx-backend-design.md
"""

import json
import os
import queue
import threading
import time
import uuid

import mlx_lm
from mlx_lm.sample_utils import make_sampler, make_logits_processors
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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
    return {
        "id": cid, "object": "chat.completion", "created": created,
        "model": model_id,
        "choices": [{"index": 0,
                     "message": {"role": "assistant", "content": "".join(full)},
                     "finish_reason": finish}],
        "usage": {"prompt_tokens": ptok, "completion_tokens": gtok,
                  "total_tokens": ptok + gtok},
    }
