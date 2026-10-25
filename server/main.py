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
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
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
            return t.split(":")[0]
    raise HTTPException(status_code=401, detail="Not allowed")


# 4) ELM client (key comes from the secret file, never written in code)
elm = OpenAI(base_url=os.getenv("ELM_BASE_URL"), api_key=os.getenv("ELM_API_KEY"))


# 5) Health check: shows the server is awake
@app.get("/health")
def health():
    return {"status": "ok"}


# 6) Fixed test call: proves token -> server -> ELM works
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
        print(f"ELM error for {name}: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="ELM request failed")
    print(f"ELM test call by {name}")
    return {"user": name, "reply": reply.choices[0].message.content}


# 7) NEW: teammates ask ELM their own question (dev tokens only)
class AskRequest(BaseModel):
    question: str
    system: str = "You are a helpful assistant. Answer briefly."
    small_model: bool = False


@app.post("/api/dev/ask")
def dev_ask(body: AskRequest, authorization: str = Header("")):
    name = check_dev_token(authorization)
    if len(body.question) > 4000 or len(body.system) > 2000:
        raise HTTPException(status_code=413, detail="Question or instructions too long")
    model = os.getenv("ELM_MODEL_SMALL" if body.small_model else "ELM_MODEL", "gpt-4.1-mini")
    try:
        reply = elm.chat.completions.create(
            model=model,
            max_tokens=int(os.getenv("ELM_MAX_TOKENS", "200")),
            temperature=0.3,
            messages=[
                {"role": "system", "content": body.system},
                {"role": "user", "content": body.question},
            ],
        )
    except Exception as e:
        print(f"ELM error for {name}: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="ELM request failed")
    print(f"dev ask by {name}, model {model}")  # never log the question or the token
    return {
        "user": name,
        "model": model,
        "reply": reply.choices[0].message.content,
        "tokens_used": reply.usage.total_tokens if reply.usage else None,
    }


# 8) NEW: simple web page for teammates to ask ELM without code
DEV_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Team ELM tester</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#15202B;background:#F3F5F8}
 label{display:block;font-weight:600;margin:14px 0 6px}
 input,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #C9D1DC;border-radius:8px;font:inherit;background:#fff}
 textarea{min-height:110px}
 button{margin-top:14px;min-height:44px;padding:0 18px;border:0;border-radius:8px;background:#2457D6;color:#fff;font-weight:600;cursor:pointer}
 #out{white-space:pre-wrap;background:#fff;border:1px solid #DCE2EA;border-radius:8px;padding:14px;margin-top:16px;min-height:40px}
 small{color:#4A5868}
</style></head><body>
<h1>Team ELM tester</h1>
<small>Dev tokens only. Your token is remembered in this browser only.</small>
<label for="tok">Your DEV_TOKEN</label>
<input id="tok" type="password" placeholder="josh:...">
<label for="sys">Instructions for the model (optional)</label>
<input id="sys" placeholder="You are a helpful assistant. Answer briefly.">
<label for="q">Your question</label>
<textarea id="q"></textarea>
<label><input id="small" type="checkbox" style="width:auto"> Use the small (cheaper) model</label>
<button id="ask" type="button">Ask ELM</button>
<div id="out" aria-live="polite"></div>
<script>
 const tok = document.getElementById('tok');
 try { tok.value = localStorage.getItem('devToken') || ''; } catch (e) {}
 document.getElementById('ask').onclick = async () => {
   const out = document.getElementById('out');
   const btn = document.getElementById('ask');
   try { localStorage.setItem('devToken', tok.value); } catch (e) {}
   const body = { question: document.getElementById('q').value,
                  small_model: document.getElementById('small').checked };
   const sys = document.getElementById('sys').value.trim();
   if (sys) body.system = sys;
   btn.disabled = true; out.textContent = 'Asking... (first call can take up to a minute)';
   try {
     const r = await fetch('/api/dev/ask', { method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok.value.trim() },
       body: JSON.stringify(body) });
     const data = await r.json();
     out.textContent = r.ok
       ? data.reply + '\\n\\n— ' + data.model + ', ' + data.tokens_used + ' tokens'
       : 'Error ' + r.status + ': ' + (data.detail || 'unknown');
   } catch (e) { out.textContent = 'Network error. Try again.'; }
   btn.disabled = false;
 };
</script>
</body></html>"""


@app.get("/dev", response_class=HTMLResponse)
def dev_page():
    return DEV_PAGE
