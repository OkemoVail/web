# Unlock All Personality Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the temp backend's `/api/system_prompts` serve all 9 personality presets so the chat's Personality modal shows every chip (the boot-time sync in `chat-actions.js` replaces the frontend's local list with the server's — the stub's single personality read as a paywall).

**Architecture:** One constant change in `backend/server.py` (`SYSTEM_PROMPTS["personalities"]` becomes the full 9-entry list, prompts copied verbatim from `AI/chat.html`'s `PERSONALITY_PRESETS`), one extended test, then restart + live verify. Spec: `docs/superpowers/specs/2026-08-11-unlock-personalities-design.md`.

**Tech Stack:** Python 3 / FastAPI (existing `backend/` app; venv at `backend/.venv`, tests via `cd backend && .venv/bin/python -m pytest tests/ -v`).

**Commit style:** conventional, lowercase, scoped. Commits user-approved.

---

### Task 1: Serve all 9 personalities from `/api/system_prompts`

**Files:**
- Modify: `backend/server.py` (the `SYSTEM_PROMPTS` dict, currently ~line 50)
- Test: `backend/tests/test_server.py`

- [ ] **Step 1: Write the failing test — replace `test_system_prompts_shape` in `backend/tests/test_server.py` with:**

```python
def test_system_prompts_shape():
    r = client.get("/api/system_prompts")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["personalities"], list)
    assert data["personalities"][0]["id"] == "default"
    assert "identity_lock" in data
    assert "global_rules" in data


def test_system_prompts_all_nine_personalities():
    r = client.get("/api/system_prompts")
    assert r.status_code == 200
    ps = r.json()["personalities"]
    assert [p["id"] for p in ps] == [
        "default", "concise", "creative", "coder", "tutor",
        "sarcastic", "analyst", "discord-friend", "friend",
    ]
    for p in ps:
        assert p["label"].strip(), f"{p['id']} has empty label"
        assert p["prompt"].strip(), f"{p['id']} has empty prompt"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_server.py::test_system_prompts_all_nine_personalities -v`
Expected: FAIL — list has 1 entry, not 9.

- [ ] **Step 3: Replace the `SYSTEM_PROMPTS` dict in `backend/server.py`**

Find the current `SYSTEM_PROMPTS = { ... }` block (single-entry `personalities` list) and replace ONLY the `personalities` list, keeping `identity_lock` and `global_rules` keys exactly as they are:

```python
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
```

These prompts are verbatim from `AI/chat.html` lines 4761–4769 (`window.PERSONALITY_PRESETS`), order included — the frontend's stale-preset migration compares prompts by trimmed string equality, so they must match byte-for-byte (JS `\"` → Python `\"`, JS `\n\n` → Python `\n\n`; both are valid escapes in both languages).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/ -v`
Expected: PASS — `13 passed`.

- [ ] **Step 5: Verify verbatim fidelity against the frontend source**

Extract both sides and diff them programmatically:

Run:
```bash
cd /Users/ar12c/Desktop/web && backend/.venv/bin/python - <<'EOF'
import json, re, sys
sys.path.insert(0, 'backend')
import server

html = open('AI/chat.html', encoding='utf-8').read()
block = html[html.index('window.PERSONALITY_PRESETS = [') : html.index('];', html.index('window.PERSONALITY_PRESETS = ['))]
js_prompts = dict(re.findall(r"id: '([^']+)'.*?prompt: \"((?:[^\"\\]|\\.)*)\"", block, re.S))
for pid, jp in js_prompts.items():
    js_prompts[pid] = jp.encode().decode('unicode_escape')

ok = True
for p in server.SYSTEM_PROMPTS['personalities']:
    want = js_prompts.get(p['id'])
    if want is None:
        print(f"MISMATCH: {p['id']} not in frontend"); ok = False
    elif p['prompt'] != want:
        print(f"MISMATCH: {p['id']} prompt differs"); ok = False
print('VERBATIM OK' if ok and len(js_prompts) == 9 else 'FIDELITY FAILURE')
sys.exit(0 if ok else 1)
EOF
```
Expected: `VERBATIM OK`

- [ ] **Step 6: Restart the running server and verify live**

The backend is currently running (started earlier today via nohup, log `/tmp/oaky-backend.log`). Find and restart it:

```bash
pkill -f "uvicorn server:app" ; sleep 1
cd /Users/ar12c/Desktop/web/backend && nohup ./run.sh > /tmp/oaky-backend.log 2>&1 &
```

Poll `curl -s -m 5 http://localhost:8001/health` until `{"ok":true}`, then:

```bash
curl -s http://localhost:8001/api/system_prompts | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['personalities']), [p['id'] for p in d['personalities']])"
```
Expected: `9 ['default', 'concise', 'creative', 'coder', 'tutor', 'sarcastic', 'analyst', 'discord-friend', 'friend']`

Also confirm the tunnel path serves it: `curl -s -m 15 https://api.okemovail.com/api/system_prompts | head -c 120`

- [ ] **Step 7: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat(backend): serve all nine personality presets from /api/system_prompts"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** §1 full list incl. order + no icons (Step 3), §2 test (Step 1), §3 restart + live verify (Step 6), verbatim requirement (Steps 3 + 5). Frontend untouched. 13 tests after this (12 existing + 1 new; `test_system_prompts_shape` replaced with the same body plus the new test).
- **Type/name consistency:** `{id, label, prompt}` keys match what `chat-actions.js` maps over (`p.id, p.label || p.id, p.prompt`); ids match the frontend `iconMap` keys exactly.
- **Placeholder scan:** none — the full dict is inline.
