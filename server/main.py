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


# 7) Teammates ask ELM their own question (dev tokens only)
# Models teammates may choose. Set DEV_MODELS in the secret file, e.g.
# DEV_MODELS=gpt-4.1-mini,gpt-4o-mini,gpt-4.1
# If not set, only ELM_MODEL and ELM_MODEL_SMALL are allowed.
def allowed_dev_models() -> list[str]:
    listed = [m.strip() for m in os.getenv("DEV_MODELS", "").split(",") if m.strip()]
    if listed:
        return listed
    defaults = [os.getenv("ELM_MODEL", "gpt-4.1-mini"), os.getenv("ELM_MODEL_SMALL", "")]
    return [m for m in dict.fromkeys(defaults) if m]


class AskRequest(BaseModel):
    question: str
    system: str = "You are a helpful assistant. Answer briefly."
    model: str | None = None  # NEW: teammate picks a model (must be in DEV_MODELS)
    small_model: bool = False  # kept for old scripts


@app.post("/api/dev/ask")
def dev_ask(body: AskRequest, authorization: str = Header("")):
    name = check_dev_token(authorization)
    if len(body.question) > 4000 or len(body.system) > 2000:
        raise HTTPException(status_code=413, detail="Question or instructions too long")
    allowed = allowed_dev_models()
    if body.model:
        if body.model not in allowed:
            raise HTTPException(status_code=400, detail=f"Model '{body.model}' not allowed. Choose one of: {', '.join(allowed)}")
        model = body.model
    else:
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
        print(f"ELM error for {name}: {type(e).__name__} (model {model})")
        raise HTTPException(status_code=502, detail=f"ELM request failed: {type(e).__name__} for model '{model}'")
    print(f"dev ask by {name}, model {model}")  # never log the question or the token
    return {
        "user": name,
        "model": model,
        "reply": reply.choices[0].message.content,
        "tokens_used": reply.usage.total_tokens if reply.usage else None,
    }


# 7b) Which models can be chosen, and which ones this ELM key actually has
@app.get("/api/dev/models")
def dev_models(authorization: str = Header("")):
    check_dev_token(authorization)
    try:
        available = sorted(m.id for m in elm.models.list().data)
    except Exception as e:
        print(f"Model list error: {type(e).__name__}")
        available = None
    allowed = allowed_dev_models()
    usable = [m for m in allowed if available is None or m in available]
    return {"allowed": allowed, "usable": usable, "available_on_key": available}


# 8) Simple web page for teammates to ask ELM without code
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
<label for="model">Model (type it, or leave empty for the default)</label>
<input id="model" list="modellist" placeholder="e.g. gpt-4o-mini" autocomplete="off">
<datalist id="modellist"></datalist>
<small id="mnote"></small>
<button id="ask" type="button">Ask ELM</button>
<div id="out" aria-live="polite"></div>
<script>
 const tok = document.getElementById('tok');
 try { tok.value = localStorage.getItem('devToken') || ''; } catch (e) {}
 async function loadModels() {
   const list = document.getElementById('modellist'), note = document.getElementById('mnote');
   if (!tok.value.trim()) return;
   try {
     const r = await fetch('/api/dev/models', { headers: { 'Authorization': 'Bearer ' + tok.value.trim() } });
     const data = await r.json();
     if (!r.ok) { note.textContent = ''; return; }
     list.innerHTML = '';
     data.usable.forEach(function (id) { const o = document.createElement('option'); o.value = id; list.appendChild(o); });
     note.textContent = data.usable.length ? 'Allowed: ' + data.usable.join(', ') : '';
   } catch (e) { note.textContent = ''; }
 }
 tok.addEventListener('change', loadModels);
 if (tok.value) loadModels();
 document.getElementById('ask').onclick = async () => {
   const out = document.getElementById('out');
   const btn = document.getElementById('ask');
   try { localStorage.setItem('devToken', tok.value); } catch (e) {}
   const body = { question: document.getElementById('q').value };
   const m = document.getElementById('model').value.trim();
   if (m) body.model = m;
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
