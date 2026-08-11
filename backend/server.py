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


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True}
