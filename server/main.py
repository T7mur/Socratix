import os
from dotenv import load_dotenv

# 1) Read the secret file on Render, or your local .env on your laptop
render_file = "/etc/secrets/.env"
load_dotenv(render_file if os.path.exists(render_file) else ".env")

# Stop with a clear message if the key is missing (never print the key itself)
if not os.getenv("ELM_API_KEY") and os.getenv("ELM_MOCK") != "true":
    raise RuntimeError("ELM_API_KEY not set")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 2) Only your own website may call this server from a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# 3) Health check: shows the server is awake
@app.get("/health")
def health():
    return {"status": "ok"}
