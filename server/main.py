import os
import secrets
from dotenv import load_dotenv

# 1) Read the secret file on Render, or your local .env on your laptop
render_file = "/etc/secrets/.env"
load_dotenv(render_file if os.path.exists(render_file) else ".env")

if not os.getenv("ELM_API_KEY") and os.getenv("ELM_MOCK") != "true":
    raise RuntimeError("ELM_API_KEY not set")

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

app = FastAPI()

# 2) Only your own website may call this server from a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# 3) Teammates' tokens, e.g. "josh:abc123" -> name "josh"
DEV_TOKENS = [t.strip() for t in os.getenv("DEV_TOKENS", "").split(",") if t.strip()]

def check_dev_token(authorization: str) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    for t in DEV_TOKENS:
        if secrets.compare_digest(t, token):
            return t.split(":")[0]  # return only the name
    raise HTTPException(status_code=401, detail="Not allowed")

# 4) ELM client (the key is read from the secret file, never written in code)
elm = OpenAI(
    base_url=os.getenv("ELM_BASE_URL"),
    api_key=os.getenv("ELM_API_KEY"),
)

# 5) Health check: anyone can see the server is awake
@app.get("/health")
def health():
    return {"status": "ok"}

# 6) Test route: proves the whole chain works (token -> server -> ELM)
@app.post("/api/test-elm")
def test_elm(authorization: str = Header("")):
    name = check_dev_token(authorization)
    try:
        reply = elm.chat.completions.create(
            model=os.getenv("ELM_MODEL", "gpt-4.1-mini"),
            max_tokens=int(os.getenv("ELM_MAX_TOKENS", "200")),
            messages=[{"role": "user", "content": "Say hello in five words."}],
        )
    except Exception as e:
        print(f"ELM error for {name}: {type(e).__name__}")  # no key, no details
        raise HTTPException(status_code=502, detail="ELM request failed")
    print(f"ELM test call by {name}")  # log the name only, never the token
    return {"user": name, "reply": reply.choices[0].message.content}
