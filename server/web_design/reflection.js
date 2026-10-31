// Socratix — Reflection (/reflection): today's tasks, a review per task, one follow-up question,
// and a no-hints independence check that feeds Knowledge Gap and tomorrow's plan.
// Built from demo_features_spec.md §3. Replaces the evening check-in (C3). Sample data only.
window.ReflectionModule = (SX, PL) => {
  "use strict";
  const { D, esc, icon, toast, sleep } = SX;
  const R = D.reflection;

  const DIFF = ["Easy", "OK", "Hard", "Very hard"];
  const TOOK = [["less", "Less"], ["as_planned", "As planned"], ["more", "More"], ["much_more", "Much more"]];
  const REASONS = ["Harder than expected", "Didn't understand the concept", "Took longer than planned", "Other tasks took the time", "Something unplanned came up", "Didn't get started", "Other"];
  const NEXT = ["Move to tomorrow", "Split it smaller", "Drop it"];
  const CERT = ["Guessing", "Fairly sure", "Sure"];

  // per plan date
  const byDate = {};
  const practisedToday = new Set();   // concepts from exercises solved today (Practice)
  const gapLog = [];                  // what the Knowledge Gap mock received
  const S = () => { const W = PL.plan(); return byDate[W.date] || (byDate[W.date] = { tasks: {}, saved: false, result: null, depth: null, followup: null, check: { state: "idle" }, suggestions: [] }); };

  // ---------- simulated server: depth rule, R1, item bank checks ----------
  function conceptsFor(t) { return (t.verdict && t.verdict.concept_ids && t.verdict.concept_ids.length ? t.verdict.concept_ids : PL.conceptsOf(t.text)); }
  function depthOf(W, st) {
    const notDone = W.tasks.filter((t) => t.status !== "done");
    const texts = W.tasks.map((t) => (st.tasks[t.id] || {}).understood || "").join(" ").toLowerCase();
    const cause = notDone.some((t) => ((st.tasks[t.id] || {}).reasons || []).length) || /\b(because|since|so that|needs?|when|if)\b/.test(texts);
    const next = notDone.some((t) => (st.tasks[t.id] || {}).next) || /\b(next time|tomorrow|i will|i'll|should|start with)\b/.test(texts);
    return cause && next ? 3 : cause ? 2 : 1;
  }
  // R1: one follow-up question (mocked). Fallback: a fixed question per the most common reason.
  function r1(W, st) {
    const done = W.tasks.filter((t) => t.status === "done");
    const said = done.map((t) => ({ t, u: ((st.tasks[t.id] || {}).understood || "").trim() })).find((x) => x.u);
    if (!PL.elmDown() && said) {
      const c = conceptsFor(said.t)[0] || "";
      const q = /recursion/i.test(c + said.u) ? "What happened in today's exercise when the base case was missing?"
        : /loop|list/i.test(c + said.u) ? "Which input would have shown the problem fastest?"
        : /determinant|matrix/i.test(c + said.u) ? "How could you check that answer without redoing the whole calculation?"
        : "Where else could you use that idea this week?";
      return { question: `You said "${said.u.replace(/[.\s]+$/, "")}". ${q}`, depth: depthOf(W, st), concept_ids: conceptsFor(said.t) };
    }
    const reasons = W.tasks.flatMap((t) => (st.tasks[t.id] || {}).reasons || []);
    const top = reasons.sort((a, b) => reasons.filter((x) => x === b).length - reasons.filter((x) => x === a).length)[0];
    const task = W.tasks.find((t) => ((st.tasks[t.id] || {}).reasons || []).includes(top)) || W.tasks.find((t) => ["Hard", "Very hard"].includes((st.tasks[t.id] || {}).difficulty)) || W.tasks[0];
    const tpl = (top && R.reasonsPrompt[top]) || R.reasonsPrompt.Other;
    return { question: tpl.replace("{task}", task ? task.text : "it"), depth: depthOf(W, st), concept_ids: [] };
  }
  function pickItems(W) {
    const today = new Set([...W.tasks.flatMap(conceptsFor), ...practisedToday]);
    let concepts = [...today].filter((c) => R.bank.some((i) => i.concept === c));
    let items = [];
    if (!concepts.length) { concepts = R.dueReview; items = concepts.map((c) => R.bank.find((i) => i.concept === c)).filter(Boolean).slice(0, 3); return { items, review: true }; }
    let round = 0;
    while (items.length < 5 && round < 3) { concepts.forEach((c) => { const pool = R.bank.filter((i) => i.concept === c && !items.includes(i)); if (pool[0] && items.length < 5) items.push(pool[0]); }); round++; if (items.length >= 3 && round >= 1 && items.length >= concepts.length) break; }
    if (items.length < 3) R.dueReview.forEach((c) => { const it = R.bank.find((i) => i.concept === c && !items.includes(i)); if (it && items.length < 3) items.push(it); });
    return { items: items.slice(0, 5), review: false };
  }
  const num = (v) => { const x = String(v).replace(/−/g, "-").trim(); return x === "" || isNaN(+x) ? null : +x; };
  function correct(item, ans) {
    if (ans == null || ans === "") return false;
    if (item.type === "predict") return String(ans).trim() === item.answer;
    if (item.type === "choice") return +ans === item.answer;
    if (item.type === "fix") return new RegExp(item.check, "i").test(String(ans).trim());
    if (item.type === "expression" || item.type === "matrix") return num(ans) === item.answer;
    if (item.type === "truth") return Array.isArray(ans) && item.answer.every((v, k) => ans[k] === v);
    return false;
  }
  function results(check, W, st) {
    const by = {};
    check.items.forEach((it) => { const a = check.answers[it.id] || {}; (by[it.concept] = by[it.concept] || []).push({ ok: correct(it, a.value), cert: a.cert }); });
    return Object.entries(by).map(([concept, rs]) => {
      const right = rs.filter((r) => r.ok).length, guessing = rs.some((r) => r.ok && r.cert === "Guessing");
      const status = right === 0 ? "Not yet" : right === rs.length && !guessing ? "Solid" : "Shaky";
      const rated = W.tasks.filter((t) => conceptsFor(t).includes(concept)).map((t) => (st.tasks[t.id] || {}).difficulty).filter(Boolean)[0] || null;
      let cmp;
      if (!rated) cmp = `No rating today. ${right} of ${rs.length} right.`;
      else if ((rated === "Easy" || rated === "OK") && status !== "Solid") cmp = `You rated "${concept}" ${rated}, but missed ${rs.length - right} of ${rs.length}. Worth another look.`;
      else if ((rated === "Hard" || rated === "Very hard") && status === "Solid") cmp = `You found it ${rated}, and you got all ${rs.length} right. Your understanding is better than it felt.`;
      else cmp = `You rated "${concept}" ${rated}, and the check agrees.`;
      const matched = rated ? ((rated === "Easy" || rated === "OK") === (status === "Solid")) : null;
      return { concept, status, right, n: rs.length, rated, cmp, matched };
    });
  }

  // ---------- render ----------
  function render() {
    const W = PL.plan(), st = S();
    const head = `<div class="page-head"><div><h1>Reflection</h1><p>Look back on today: how each task went, what you understood, and a short check of what stuck.</p><p class="path-line">${PL.pathLine()} · private to you</p></div></div>`;
    if (!W.submitted && SX.touring) { // the tour only reads: show an example from the demo account, inert
      const ex = { tasks: D.planning.tasks.map((t, k) => ({ ...t, status: k === 2 ? "planned" : "done", verdict: null })) };
      return `<div class="reflection" data-reflection>${head}<p class="tiny faint">Example from the demo account</p><div inert>${sectionA(ex, st)}${sectionD(ex, { check: { state: "idle" } })}</div></div>`;
    }
    if (!W.submitted) return `<div class="reflection" data-reflection>${head}<section class="panel"><div class="empty">${icon("notebook-pen")}<h2>Submit today's plan first</h2><p class="small">Reflection opens once today's plan is saved. It works best in the evening.</p><a class="btn btn-primary" href="#/plan/today/${PL.competent() ? 2 : 1}">Plan your day</a></div></section>${PL.proto()}${log()}</div>`;
    return `<div class="reflection" data-reflection>${head}
      ${sectionA(W, st)}
      ${st.saved ? savedSummary(st) : sectionB(W, st)}
      ${st.saved ? sectionC(W, st) : ""}
      ${st.saved || !W.tasks.length ? sectionD(W, st) : ""}
      ${PL.proto()}${log()}</div>`;
  }
  function log() {
    return `<details class="panel proto"><summary class="small muted">Prototype only: events sent to Knowledge Gap (${gapLog.length})</summary>${gapLog.length ? `<pre class="hc-code" style="margin-top:10px;white-space:pre-wrap">${esc(gapLog.map((e) => JSON.stringify(e)).join("\n"))}</pre>` : `<p class="tiny faint" style="margin-top:8px">Nothing yet. Finish an independence check to see the activity_completed events.</p>`}</details>`;
  }
  const statusIc = (t) => (t.status === "done" ? ["✓", "Done", "s-own"] : t.status === "moved" ? ["→", "Moved", "s-prog"] : ["○", "Not done", "s-new"]);
  function sectionA(W) {
    return `<section class="panel" aria-labelledby="ra-h" data-tour="reflection-tasks"><div class="panel-head"><h2 id="ra-h">Today's tasks</h2><span class="sub">${W.tasks.filter((t) => t.status !== "planned").length} of ${W.tasks.length} handled</span></div>
      <div class="panel-body checklist">${W.tasks.map((t) => { const [g, w, c] = statusIc(t); const ty = (t.verdict && t.verdict.type) || PL.typeOf(t.text);
        return `<div class="crow ra-row"><span class="sbadge ${c}"><span aria-hidden="true">${g}</span>${w}</span><span class="mono small ct-time">${t.status === "moved" ? t.movedTo : t.time}</span><span class="ct-text"><span class="ct-name">${esc(t.text)}</span><span class="chips">${conceptsFor(t).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</span></span><span class="ptag neutral">${PL.typeName(ty)}</span></div>`; }).join("")}</div></section>`;
  }
  const chipset = (key, opts, val, multi) => `<div class="tchips" role="group">${opts.map((o) => { const [k, l] = Array.isArray(o) ? o : [o, o]; const on = multi ? (val || []).includes(k) : val === k; return `<button type="button" class="tchip" data-rf="chip" data-v="${key}::${esc(k)}" aria-pressed="${on}">${esc(l)}</button>`; }).join("")}</div>`;
  function ready(W, st) {
    return W.tasks.every((t) => { const a = st.tasks[t.id] || {}; return t.status === "done" ? a.difficulty && a.took : (a.reasons || []).length && a.next; });
  }
  function sectionB(W, st) {
    const ok = ready(W, st);
    return `<section class="panel" aria-labelledby="rb-h"><div class="panel-head"><h2 id="rb-h">Review each task</h2>${W.tasks.some((t) => t.status === "done") ? `<button class="btn btn-sm" type="button" data-rf="all-planned">All as planned</button>` : ""}</div>
      <div class="panel-body stack" style="gap:14px">
      ${W.tasks.map((t) => { const a = st.tasks[t.id] || {};
        if (t.status === "done") return `<article class="rv-card" aria-label="${esc(t.text)}"><div class="rv-h"><span class="sbadge s-own"><span aria-hidden="true">✓</span>Done</span><b>${esc(t.text)}</b><span class="mono tiny faint">planned ${t.mins} min</span></div>
          <div class="rv-f"><span class="rv-l">How hard was it?</span>${chipset(`${t.id}|difficulty`, DIFF, a.difficulty)}</div>
          <div class="rv-f"><span class="rv-l">Time it took</span>${chipset(`${t.id}|took`, TOOK, a.took)}</div>
          <div class="rv-f"><label class="rv-l" for="u-${t.id}">What did you understand from it? <span class="faint" style="font-weight:400">(optional)</span></label>${a.skipU ? `<span class="small faint">Skipped. <button class="linkish" type="button" data-rf="unskip" data-v="${t.id}">Undo</button></span>` : `<div class="row nowrap"><input class="input" id="u-${t.id}" maxlength="300" data-rf-in="${t.id}" data-f="understood" value="${esc(a.understood || "")}" placeholder="e.g. Recursion needs a base case before the recursive call."><button class="btn btn-sm btn-ghost" type="button" data-rf="skipU" data-v="${t.id}">Skip</button></div>`}</div></article>`;
        return `<article class="rv-card" aria-label="${esc(t.text)}"><div class="rv-h">${(() => { const [g, w, c] = statusIc(t); return `<span class="sbadge ${c}"><span aria-hidden="true">${g}</span>${w}</span>`; })()}<b>${esc(t.text)}</b></div>
          <div class="rv-f"><span class="rv-l">What got in the way? <span class="faint" style="font-weight:400">(choose any)</span></span>${chipset(`${t.id}|reasons`, REASONS, a.reasons, true)}</div>
          <div class="rv-f"><label class="rv-l" for="m-${t.id}">Tell us a bit more <span class="faint" style="font-weight:400">(optional)</span></label><input class="input" id="m-${t.id}" data-rf-in="${t.id}" data-f="more" value="${esc(a.more || "")}"></div>
          <div class="rv-f"><span class="rv-l">What next?</span>${chipset(`${t.id}|next`, NEXT, a.next)}</div></article>`; }).join("")}
      </div>
      <div class="panel-foot"><button class="btn btn-primary" type="button" data-rf="save" ${ok && !st.saving ? "" : "disabled"} aria-describedby="rf-why">${st.saving ? "Saving…" : "Save review"}</button><span class="tiny faint" id="rf-why">${ok ? "Saving closes today's plan." : "Choose the required options on every task."}</span></div></section>`;
  }
  function savedSummary(st) {
    const r = st.result, W = PL.plan();
    const main = W.dayKind === "rest" ? "Saved." : r.onTarget ? `On target. ${r.count} of 5 plans toward the competent path.` : `Saved. This plan is not on target yet, which is fine; you are still at ${r.count} of 5.`;
    const change = r.change === "unlock" ? "You've planned well 4 times out of your last 5. From tomorrow you'll get lighter feedback and no morning questions. You can still ask for full feedback any time."
      : r.change === "stepback" ? "Let's bring back the detailed feedback for a while. It'll fade again as your plans land." : null;
    return `<section class="panel result enter" role="status" aria-live="polite"><div class="panel-body stack-sm">
      <div class="row between"><b>${main}</b><span class="ptag neutral">Depth ${st.depth} · ${["", "Describes", "Explains", "Plans"][st.depth]}</span></div>
      ${W.dayKind === "rest" ? "" : `<p class="small">Completion today: ${r.handled} of ${r.total} tasks handled (${Math.round(r.completion * 100)}%).</p>`}
      ${r.tip ? `<p class="small">${icon("lightbulb")} ${esc(r.tip)}</p>` : ""}
      ${change ? `<p class="small path-change">${icon("sparkles")} ${change}</p>` : ""}
    </div></section>`;
  }
  function followupShown(W, st) {
    const deep = R.depthHistory.slice(-5).length >= 5 && R.depthHistory.slice(-5).every((d) => d === 3);
    if (!deep) return true;
    return W.tasks.some((t) => t.status !== "done" || ["Hard", "Very hard"].includes((st.tasks[t.id] || {}).difficulty));
  }
  function sectionC(W, st) {
    if (!st.followup || !followupShown(W, st)) return "";
    const f = st.followup;
    return `<section class="panel followup enter" aria-labelledby="rc-h"><div class="panel-body stack-sm">
      <div class="label-up" id="rc-h">One question to think about</div>
      <p class="fq">${esc(f.question)}</p>
      ${f.done ? `<p class="small faint">${f.answer ? `Your answer: “${esc(f.answer)}”` : "Kept as a question for later."}</p>` : `<textarea class="textarea" rows="2" data-rf-in="followup" aria-label="Your answer (optional)" placeholder="Your answer (optional)">${esc(f.answer || "")}</textarea><div><button class="btn btn-sm" type="button" data-rf="fu-done">Done</button></div>`}
    </div></section>`;
  }
  function sectionD(W, st) {
    const C = st.check;
    if (C.state === "skipped") return `<section class="panel" data-tour="independence-check"><div class="panel-body"><p class="small faint">Check skipped today. That's fine, nothing changes.</p></div></section>`;
    if (C.state === "idle") return `<section class="panel check-card" aria-labelledby="rd-h" data-tour="independence-check"><div class="panel-body stack-sm">
      <div class="row between"><h2 id="rd-h">Check what stuck (about 5 minutes)</h2><span class="nohint">${icon("eye-off")}No hints</span></div>
      <p class="small muted">No hints. It shows what you really understood today, updates your gaps and tomorrow's plan.</p>
      <div class="row"><button class="btn btn-primary" type="button" data-rf="check-start">${icon("play")}Start check</button><button class="btn btn-ghost" type="button" data-rf="check-skip">Skip today</button></div></div></section>`;
    if (C.state === "running") return runner(C);
    return checkResults(C, st);
  }
  function runner(C) {
    const it = C.items[C.idx], a = C.answers[it.id] || {};
    const input = it.type === "choice" ? `<div class="mc" role="radiogroup" aria-label="Answer">${it.options.map((o, k) => `<button type="button" role="radio" class="mc-opt" data-rf="ans" data-v="${k}" aria-checked="${a.value === k || a.value === String(k)}">${esc(o)}</button>`).join("")}</div>`
      : it.type === "truth" ? `<table class="data tt"><thead><tr><th>Row</th><th>p → q</th></tr></thead><tbody>${it.rows.map((r, k) => `<tr><td class="mono">${r}</td><td>${["T", "F"].map((v) => `<button type="button" class="tchip sm" data-rf="tt" data-v="${k}:${v}" aria-pressed="${(a.value || [])[k] === v}">${v}</button>`).join("")}</td></tr>`).join("")}</tbody></table>`
      : `<input class="input mono" id="ck-in" data-rf-in="ans" value="${esc(a.value ?? "")}" autocomplete="off" spellcheck="false" placeholder="${it.type === "fix" ? "Type the corrected line" : it.type === "predict" ? "What it prints" : "A number"}" aria-label="Your answer">`;
    const done = !!(a.cert && (a.value !== undefined && a.value !== "" && (!Array.isArray(a.value) || a.value.filter(Boolean).length === it.rows.length)));
    return `<section class="panel check-run" aria-labelledby="ck-h" data-tour="independence-check"><div class="panel-body stack-sm">
      <div class="row between"><span class="label-up" id="ck-h">Question ${C.idx + 1} of ${C.items.length} · ${esc(it.concept)}</span><span class="timer mono small" data-timer aria-hidden="true">2:00</span></div>
      <div class="ck-progress"><span style="width:${(C.idx / C.items.length) * 100}%"></span></div>
      <p class="fq">${esc(it.prompt)}</p>
      ${it.code ? `<pre class="hc-code">${it.type === "fix" || /def |print/.test(it.code) ? SX.hlPy(it.code) : esc(it.code)}</pre>` : ""}
      ${input}
      <div class="rv-f"><span class="rv-l">How sure are you?</span>${`<div class="tchips" role="group">${CERT.map((c) => `<button type="button" class="tchip" data-rf="cert" data-v="${c}" aria-pressed="${a.cert === c}">${c}</button>`).join("")}</div>`}</div>
      <div class="row between"><span class="tiny faint">No hints here. The timer is a guide, not a limit.</span><button class="btn btn-primary" type="button" data-rf="ck-next" ${done ? "" : "disabled"}>${C.idx + 1 === C.items.length ? "Finish" : "Next"} ${icon("arrow-right")}</button></div>
    </div></section>`;
  }
  function checkResults(C, st) {
    const tag = { Solid: "ok", Shaky: "sug", "Not yet": "neutral" };
    return `<section class="panel enter" aria-labelledby="cr-h" data-tour="independence-check"><div class="panel-head"><h2 id="cr-h">What stuck</h2><span class="sub">${C.review ? "spaced review" : "today's concepts"} · no hints</span></div>
      <div class="panel-body stack" style="gap:16px">
        <div class="cr-list">${C.res.map((r, k) => `<div class="cr-row" style="--i:${k}"><div class="row between"><b>${esc(r.concept)}</b><span class="ptag ${tag[r.status]}">${r.status}</span></div><p class="small">${esc(r.cmp)}</p></div>`).join("")}</div>
        ${st.suggestions.length ? `<div><h3 style="margin-bottom:8px">Tomorrow's plan</h3>${st.suggestions.map((s) => `<div class="fc-row"><div><b>${esc(s.text)}</b> <span class="mono small faint">· ${s.mins} min</span><div class="tiny faint">${esc(s.concept)} · ${s.status}</div></div><div class="row">${s.state === "added" ? `<span class="ptag ok">${icon("check")}Added to tomorrow</span>` : s.state === "skipped" ? `<span class="ptag neutral">Skipped</span>` : `<button class="btn btn-sm btn-primary" type="button" data-rf="sg-add" data-v="${s.id}">Add to tomorrow</button><button class="btn btn-sm btn-ghost" type="button" data-rf="sg-skip" data-v="${s.id}">Skip</button>`}</div></div>`).join("")}</div>` : `<p class="small muted">Everything was solid. Nothing to add to tomorrow.</p>`}
      </div></section>`;
  }

  // ---------- behaviour ----------
  let timer = null;
  function bind(root) {
    const box = root.querySelector("[data-reflection]"); if (!box) return;
    const gen = SX.gen(), alive = () => SX.stillOn(gen);
    const rr = () => { const a = document.activeElement, sel = a && a.dataset && a.dataset.rf ? `[data-rf="${a.dataset.rf}"][data-v="${a.dataset.v || ""}"]` : a && a.id ? "#" + a.id : null; SX.render(); if (sel) document.querySelector(sel)?.focus({ preventScroll: true }); };
    const W = PL.plan(), st = S();

    clearInterval(timer);
    const tEl = box.querySelector("[data-timer]");
    if (tEl && st.check.state === "running") {
      const C = st.check; C.qStart = C.qStart || Date.now();
      const tick = () => { if (!document.body.contains(tEl)) return clearInterval(timer); const left = Math.max(0, 120 - Math.floor((Date.now() - C.qStart) / 1000)); tEl.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Take your time"; };
      tick(); timer = setInterval(tick, 1000);
    }

    box.addEventListener("input", (e) => {
      const t = e.target, d = t.dataset;
      if (d.rfIn === "followup") { st.followup.answer = t.value; return; }
      if (d.rfIn === "ans") { const C = st.check, it = C.items[C.idx]; (C.answers[it.id] = C.answers[it.id] || {}).value = t.value; const n = box.querySelector('[data-rf="ck-next"]'); const a = C.answers[it.id]; if (n) n.disabled = !(a.cert && t.value.trim()); return; }
      if (d.rfIn) { (st.tasks[d.rfIn] = st.tasks[d.rfIn] || {})[d.f] = t.value; }
    });
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.rfIn === "ans") { const n = box.querySelector('[data-rf="ck-next"]'); if (n && !n.disabled) n.click(); } });

    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-rf]"); if (!b || b.disabled) return;
      const a = b.dataset.rf, v = b.dataset.v;
      if (a === "chip") {
        const [key, val] = v.split("::"), [tid, field] = key.split("|"), x = (st.tasks[tid] = st.tasks[tid] || {});
        if (field === "reasons") { const s = new Set(x.reasons || []); s.has(val) ? s.delete(val) : s.add(val); x.reasons = [...s]; } else x[field] = x[field] === val ? null : val;
        return rr();
      }
      if (a === "all-planned") { W.tasks.filter((t) => t.status === "done").forEach((t) => ((st.tasks[t.id] = st.tasks[t.id] || {}).took = "as_planned")); return rr(); }
      if (a === "skipU") { st.tasks[v].skipU = true; st.tasks[v].understood = ""; return rr(); }
      if (a === "unskip") { st.tasks[v].skipU = false; return rr(); }
      if (a === "save") {
        st.saving = true; rr(); await sleep(500); if (!alive()) { st.saving = false; return; }
        const took = {}; W.tasks.forEach((t) => { if ((st.tasks[t.id] || {}).took) took[t.id] = st.tasks[t.id].took; });
        st.result = PL.closePlan(took); st.depth = depthOf(W, st); st.saved = true; st.saving = false;
        R.depthHistory.push(st.depth); R.depthTrend.push(st.depth);
        // "What next?" on unfinished tasks
        W.tasks.filter((t) => t.status !== "done" && (st.tasks[t.id] || {}).next === "Move to tomorrow").forEach((t) => PL.addTomorrowSuggestion({ text: t.text, mins: t.mins, concept: conceptsFor(t)[0] || "Today's plan", why: "moved from today" }));
        W.tasks.filter((t) => t.status !== "done" && (st.tasks[t.id] || {}).next === "Split it smaller").forEach((t) => PL.addTomorrowSuggestion({ text: `${t.text}: first half`, mins: Math.max(20, Math.round(t.mins / 2)), concept: conceptsFor(t)[0] || "Today's plan", why: "split from today" }));
        SX.emit && SX.emit("plan_closed", { plan_date: W.date, tasks: W.tasks.map((t) => ({ task_id: t.id, status: t.status, difficulty: (st.tasks[t.id] || {}).difficulty || null, reasons: (st.tasks[t.id] || {}).reasons || [], understood: !!(st.tasks[t.id] || {}).understood })) });
        SX.emit && SX.emit("reflection_submitted", { plan_id: W.date, depth: st.depth });
        st.followup = { ...r1(W, st), answer: "", done: false };
        return rr();
      }
      if (a === "fu-done") { st.followup.done = true; return rr(); }
      if (a === "check-skip") { st.check = { state: "skipped" }; toast("Skipped. Nothing changes."); return rr(); }
      if (a === "check-start") { const p = pickItems(W); st.check = { state: "running", items: p.items, review: p.review, idx: 0, answers: {}, qStart: Date.now() }; rr(); box.ownerDocument.querySelector("#ck-in, .mc-opt, .tt .tchip")?.focus(); return; }
      if (a === "ans") { const C = st.check, it = C.items[C.idx]; (C.answers[it.id] = C.answers[it.id] || {}).value = +v; return rr(); }
      if (a === "tt") { const C = st.check, it = C.items[C.idx], [k, val] = v.split(":"); const x = (C.answers[it.id] = C.answers[it.id] || {}); x.value = x.value || it.rows.map(() => ""); x.value[+k] = val; return rr(); }
      if (a === "cert") { const C = st.check, it = C.items[C.idx]; (C.answers[it.id] = C.answers[it.id] || {}).cert = v; return rr(); }
      if (a === "ck-next") {
        const C = st.check, it = C.items[C.idx], ans = C.answers[it.id];
        ans.ms = Date.now() - (C.qStart || Date.now());
        // Knowledge Gap receives one activity_completed per item
        const ev = { activity_type: "independence_check", concept_ids: [it.concept], item_id: it.id, correct: correct(it, ans.value), certainty: ans.cert, max_hint_level: 0, plan_task_id: null };
        SX.emit && SX.emit("activity_completed", ev);
        if (C.idx + 1 < C.items.length) { C.idx++; C.qStart = Date.now(); rr(); box.ownerDocument.querySelector("#ck-in, .mc-opt, .tt .tchip")?.focus(); return; }
        C.state = "done"; C.res = results(C, W, st);
        C.res.forEach((r) => { if (r.matched !== null) { R.calibration.total++; if (r.matched) R.calibration.matched++; } });
        st.suggestions = C.res.filter((r) => r.status !== "Solid").map((r, k) => { const q = C.items.findIndex((i) => i.concept === r.concept && !correct(i, (C.answers[i.id] || {}).value)); return { id: "rs" + k, concept: r.concept, status: r.status, text: `Revise ${r.concept.toLowerCase()}: redo question ${q >= 0 ? q + 1 : 1}`, mins: 20, state: "open" }; });
        return rr();
      }
      if (a === "sg-add") { const s = st.suggestions.find((x) => x.id === v); s.state = "added"; PL.addTomorrowSuggestion({ text: `${s.text}, ${s.mins} min`, mins: s.mins, concept: s.concept, why: `${s.status} in last night's check` }); toast("Added to tomorrow's plan."); return rr(); }
      if (a === "sg-skip") { st.suggestions.find((x) => x.id === v).state = "skipped"; return rr(); }
    });
  }

  // Knowledge Gap (mock provider): consumes independence-check events and updates concept status
  SX.on && SX.on("activity_completed", (ev) => {
    if (ev.activity_type === "exercise" && ev.concept) practisedToday.add(ev.concept);
    if (ev.activity_type !== "independence_check") return;
    gapLog.push(ev);
    const sched = D.practice.schedule;
    ev.concept_ids.forEach((c) => {
      let row = sched.find((s) => s.concept === c);
      if (!row) { row = { concept: c, subject: "", status: "not_started" }; sched.push(row); }
      if (!ev.correct) row.status = "worth_practising";
      else if (row.status === "worth_practising" || row.status === "due_now" || row.status === "not_started") { row.status = "next_in_N_days"; row.days = 7; }
    });
  });

  return { render, bind, _state: byDate, _gapLog: gapLog };
};
