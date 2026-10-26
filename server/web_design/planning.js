// Socratix — Planning: Today, Plan landing, Setup, Backward planning, the 4-step daily wizard,
// evening check-in, Progress and the planning parts of Settings.
// Built from planning_ui.md v2; rules from planning_execution_plan.md §7. Sample data only.
// SERVER below simulates the API (rules + mocked ELM calls E1–E5) so the prototype is clickable.
// Copy rule: suggestions, never verdicts — the UI never says fail / wrong / weak / bad / demoted.
window.PlanningModule = (SX) => {
  "use strict";
  const { D, esc, icon, toast, sleep } = SX;
  const F = D.planning;
  const CFG = F.config;

  // ---------- dates and times ----------
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const wd = (s) => toDate(s).getUTCDay();
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (s) => { const d = toDate(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  const fmtLong = (s) => { const d = toDate(s); return `${WDL[d.getUTCDay()]} ${d.getUTCDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()]}`; };
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); return m ? +m[1] * 60 + +m[2] : null; };
  const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const mondayOf = (s) => addDays(s, -((wd(s) + 6) % 7));

  // ---------- device-only storage (labels, draft) ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep in memory only */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const busyLabels = LS.get("socratix-busy-labels", null) || { ...F.setup.busyLabelsSeed };

  // ================= simulated SERVER (rules §7 + mock ELM) =================
  const db = {
    student: { ...F.student, recent: [...F.student.recent] },
    setup: JSON.parse(JSON.stringify(F.setup)),
    hasSetup: true,
    milestones: F.milestones.map((m) => ({ ...m })),
    history: F.history.map((h) => ({ ...h })),
    ratings: JSON.parse(JSON.stringify(F.ratings)),
    askLeft: CFG.ASK_PER_DAY - F.askUsed,
    oneOffBusy: {},           // date -> [{start,end}] (times only)
  };
  delete db.setup.busyLabelsSeed;

  const SERVER = (() => {
    // 7.1 free minutes = day window minus the union of class and busy blocks on that date
    function blocksFor(date, extra = []) {
      const d = wd(date), out = [];
      db.setup.classes.filter((c) => c.day === d).forEach((c) => out.push({ start: toMin(c.start), end: toMin(c.end), label: c.name, kind: "class" }));
      db.setup.busy.filter((b) => b.days.includes(d)).forEach((b) => out.push({ start: toMin(b.start), end: toMin(b.end), label: "busy", id: b.id, kind: "busy" }));
      [...(db.oneOffBusy[date] || []), ...extra].forEach((b) => out.push({ start: toMin(b.start), end: toMin(b.end), label: "busy", kind: "busy" }));
      return out.filter((b) => b.start != null && b.end > b.start).sort((a, b) => a.start - b.start);
    }
    function freeMinutes(date, extra) {
      const ws = toMin(db.setup.window.start), we = toMin(db.setup.window.end);
      const merged = [];
      blocksFor(date, extra).map((b) => [Math.max(ws, b.start), Math.min(we, b.end)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
        .forEach(([a, b]) => { const l = merged[merged.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else merged.push([a, b]); });
      return Math.max(0, we - ws - merged.reduce((s, [a, b]) => s + b - a, 0));
    }
    function slots(date, extra) {
      const ws = toMin(db.setup.window.start), we = toMin(db.setup.window.end);
      const bl = blocksFor(date, extra).map((b) => ({ ...b, start: Math.max(ws, b.start), end: Math.min(we, b.end) })).filter((b) => b.end > b.start);
      const out = []; let t = ws;
      bl.forEach((b) => { if (b.start > t) out.push({ start: t, end: b.start, free: true }); out.push({ start: b.start, end: b.end, free: false, label: b.kind === "class" ? b.label : "busy" }); t = Math.max(t, b.end); });
      if (t < we) out.push({ start: t, end: we, free: true });
      return out;
    }

    // 7.5 specificity pre-check
    const FINISH = /\b(finish|finished|complete|completed|submit|submitted|write|written|solve|solved|answer|redo|prove|implement|fix|test|done|read|draft|summari[sz]e|practi[sc]e|watch)\b/i;
    const TARGET = /(\d|\bq\d+\s*[–-]\s*\d+|\b(tutorial|lab|lecture|chapter|exercise|question|section|sheet|paper|coursework|cw)\s*\d+)/i;
    const DURATION = /\b(for\s+)?\d+\s?(min|mins|minutes|m|h|hr|hrs|hours)\b/i;
    const VAGUE = /^(study|work on|look at|do|revise)\b/i;
    function classify(text) {
      const t = String(text || "").trim(), words = t.split(/\s+/).filter(Boolean);
      if (words.length <= 2 && !TARGET.test(t)) return "fail";
      if (VAGUE.test(t) && words.length <= 2) return "fail";
      if ((FINISH.test(t) && TARGET.test(t)) || (/\w/.test(t) && DURATION.test(t))) return "pass";
      return "borderline";
    }
    const typeOf = (t) => /lab|code|coding|implement|program|python|haskell|exercise|debug|cw|coursework/i.test(t) ? "coding"
      : /past paper|proof|matrix|algebra|maths?|calculus|la1|problem sheet/i.test(t) ? "maths"
      : /read|chapter|notes|lecture|slides/i.test(t) ? "reading"
      : /write|essay|report|draft/i.test(t) ? "writing"
      : /email|book|form|admin|register|print/i.test(t) ? "admin" : "other";
    const TYPE_NAME = { coding: "Coding", reading: "Reading", writing: "Writing", maths: "Maths", admin: "Admin", other: "Other" };

    function dueSoon(date, days = 7) { return db.milestones.filter((m) => diffDays(date, m.date) >= 0 && diffDays(date, m.date) <= days).sort((a, b) => a.date.localeCompare(b.date)); }

    // E3 plan review (mocked). Returns null when ELM is down, so the UI falls back.
    function e3(tasks, ctx) {
      if (ctx.elmDown) return null;
      const soon = dueSoon(ctx.date);
      const verdicts = {};
      tasks.forEach((t) => {
        const cls = classify(t.text), type = typeOf(t.text);
        const big = /\ball questions\b|\bwhole\b|\bentire\b|\ball of\b|\bfull\b|\beverything\b/i.test(t.text) || (/past paper/i.test(t.text) && !/q\d|question \d|\d\s*[–-]\s*\d/i.test(t.text) && t.mins < 120);
        const ms = soon.find((m) => m.name.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !/done|submitted/.test(w)).some((w) => t.text.toLowerCase().includes(w)));
        let v;
        if (big) v = { finishable: "yes", scopeOk: false, issue: "scope_too_big", note: /past paper/i.test(t.text) ? "A full past paper usually takes 2–3 hours. Split it, or plan only part today?" : `This looks bigger than ${t.mins} min. Split it, or plan only part today?` };
        else if (cls !== "pass") v = { finishable: "no", scopeOk: true, issue: "not_finishable", note: `How will you know you are done? Example: "${rewriteOf(t)}"` };
        else v = { finishable: "yes", scopeOk: true, issue: null, note: `Clear finish line, fits the slot.${ms ? ` Linked to milestone "${ms.name} (${WD[wd(ms.date)]})".` : ""}` };
        verdicts[t.id] = { ...v, type, milestoneId: ms ? ms.id : null, source: "elm" };
      });
      const words = (ctx.priority || "").toLowerCase().replace(/\bcs\b/g, "inf").split(/\W+/).filter((w) => w.length > 2 && !/^(the|and|for|today|top|my|get|some)$/.test(w));
      const syn = { coursework: ["cw", "lab", "coursework"], inf: ["inf", "inf2", "inf1a"], maths: ["la1", "past paper", "algebra"], revision: ["revise", "past paper"] };
      const covers = (t) => words.some((w) => t.text.toLowerCase().includes(w) || (syn[w] || []).some((s) => t.text.toLowerCase().includes(s)));
      const cov = ctx.allTasks.find(covers);
      return { verdicts, priorityCovered: words.length ? !!cov : null, coveredBy: cov ? cov.id : null };
    }
    function rewriteOf(t) {
      if (/lecture\s*5/i.test(t.text)) return "Revise lecture 5: redo the 3 worked examples, 45 min";
      return `${t.text.replace(/[.\s]+$/, "")}: finish one named part, ${t.mins} min`;
    }
    // Rules-only verdict (after MAX_REVIEWS or for a quick local re-check)
    function ruleVerdict(t) {
      const cls = classify(t.text);
      return cls === "pass" ? { finishable: "yes", scopeOk: true, issue: null, note: "Has a clear finish line.", type: typeOf(t.text), source: "rules" }
        : { finishable: "no", scopeOk: true, issue: "not_finishable", note: "Add a finish line or a time, e.g. \"for 45 min\".", type: typeOf(t.text), source: "rules" };
    }

    // 7.2–7.4 rule points + per-task hints
    function rules(tasks, date, extra) {
      const ws = toMin(db.setup.window.start), we = toMin(db.setup.window.end);
      const bl = blocksFor(date, extra);
      const hints = {}, clashes = [];
      tasks.forEach((t) => {
        const s = toMin(t.time), e = s + (+t.mins || 0), h = [];
        if (+t.mins > CFG.MAX_TASK_MIN) h.push("Split tasks over 90 minutes.");
        if (s == null || s < ws || e > we) h.push("Outside your day window.");
        const b = s != null && bl.find((x) => s < x.end && e > x.start);
        if (b) { h.push(b.kind === "class" ? `Overlaps with ${fromMin(b.start)} ${b.label.replace(/^\w+\s/, "").toLowerCase() === "lecture" ? "lecture" : b.label}.` : `Overlaps with your ${fromMin(b.start)} busy time.`); clashes.push({ task: t, with: b.kind === "class" ? `your ${fromMin(b.start)} ${/lecture/i.test(b.label) ? "lecture" : b.label}` : `your ${fromMin(b.start)} busy time` }); }
        const o = s != null && tasks.find((u) => u !== t && toMin(u.time) != null && s < toMin(u.time) + (+u.mins || 0) && e > toMin(u.time) && tasks.indexOf(u) < tasks.indexOf(t));
        if (o) { h.push(`Overlaps with "${o.text || "another task"}".`); clashes.push({ task: t, with: `"${o.text}"` }); }
        hints[t.id] = h;
      });
      const structure = tasks.length > 0 && tasks.every((t) => t.text.trim() && toMin(t.time) != null && toMin(t.time) >= ws && toMin(t.time) + (+t.mins || 0) <= we && +t.mins >= 5 && +t.mins <= CFG.MAX_TASK_MIN);
      const free = freeMinutes(date, extra), planned = tasks.reduce((s, t) => s + (+t.mins || 0), 0);
      const bufferPct = free ? Math.round(((free - planned) / free) * 100) : 0;
      const buffer = planned <= free && free > 0 && (free - planned) / free >= CFG.BUFFER_MIN;
      return { hints, clashes, structure, buffer, bufferPct, free, planned, noClash: clashes.length === 0 };
    }

    // 7.6 quality (1–5), capped at 3 while the top priority isn't covered
    function quality(W, R) {
      const passed = (t, k) => t.overridden || t.accepted || (t.verdict && (k === "f" ? t.verdict.finishable === "yes" : t.verdict.scopeOk));
      const p4 = W.tasks.every((t) => passed(t, "f")), p5 = W.tasks.every((t) => passed(t, "s"));
      let q = (R.structure ? 1 : 0) + (R.buffer ? 1 : 0) + (R.noClash ? 1 : 0) + (p4 ? 1 : 0) + (p5 ? 1 : 0);
      if (W.priorityCovered === false && !W.priorityOverride) q = Math.min(q, 3);
      return q;
    }

    // 7.7 milestones
    function milestoneRules(list, deadline) {
      const out = { buffer: true, order: true, cramming: [], weeks: [] };
      const ms = list.filter((m) => m.date);
      if (deadline && ms.length) { const last = ms.map((m) => m.date).sort().pop(); out.buffer = diffDays(last, deadline.date) >= CFG.MILESTONE_BUFFER_DAYS; }
      for (let i = 1; i < ms.length; i++) if (ms[i].date <= ms[i - 1].date) out.order = false;
      // cramming across every deadline's milestones (the edited list replaces this deadline's saved ones)
      const all = [...db.milestones.filter((m) => !deadline || m.deadline !== deadline.id), ...ms.map((m) => ({ ...m, deadline: deadline && deadline.id }))];
      const today = F.today, perWeek = {};
      Object.values(all.reduce((g, m) => ((g[m.deadline] = g[m.deadline] || []).push(m), g), {})).forEach((group) => {
        group.sort((a, b) => a.date.localeCompare(b.date));
        let prev = null;
        group.forEach((m) => {
          if (m.date < today) { prev = m.date; return; }
          const start = prev && prev >= today ? addDays(prev, 1) : today;
          const n = Math.max(1, diffDays(start, m.date) + 1), per = (+m.hours || 0) / n;
          for (let k = 0; k < n; k++) { const day = addDays(start, k), w = mondayOf(day); perWeek[w] = (perWeek[w] || 0) + per; }
          prev = m.date;
        });
      });
      const weeksOfThis = new Set(ms.filter((m) => m.date >= today).map((m) => mondayOf(m.date)));
      Object.keys(perWeek).sort().forEach((w) => {
        let free = 0; for (let k = 0; k < 7; k++) { const day = addDays(w, k); if (day >= today) free += freeMinutes(day) / 60; }
        const row = { week: w, planned: Math.round(perWeek[w]), free: Math.round(free), mine: weeksOfThis.has(w) };
        out.weeks.push(row); if (row.planned > row.free) out.cramming.push(row);
      });
      return out;
    }

    // E1 extract (mocked with a small parser): "cw2 for inf2 moved to thursday 2pm"
    function e1(text, ctx) {
      if (ctx.elmDown) return { found: false };
      const found = [];
      String(text).split(/\n|;|(?<=[.!?])\s+/).forEach((line) => {
        const l = line.toLowerCase();
        const course = (l.match(/\b(inf\s?2|inf\s?1a|inf\s?1|la\s?1|inf\d\w*)\b/) || [])[1];
        let item = null; const m1 = l.match(/\b(cw|coursework)\s*(\d+)/), m2 = l.match(/\b(lab|tutorial sheet|tutorial|sheet|assignment|quiz|midterm|exam)\s*(\d*)/);
        if (m1) item = `Coursework ${m1[2]}`; else if (m2) item = (m2[1][0].toUpperCase() + m2[1].slice(1)) + (m2[2] ? ` ${m2[2]}` : "");
        let date = null;
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dn = days.findIndex((d) => new RegExp(`\\b${d.slice(0, 3)}(${d.slice(3)})?\\b`).test(l));
        if (/\btomorrow\b/.test(l)) date = addDays(ctx.date, 1);
        else if (dn >= 0) { let k = (dn - wd(ctx.date) + 7) % 7; if (k === 0) k = 7; date = addDays(ctx.date, k); }
        const dm = l.match(/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/) || l.match(/\b(\d{1,2})\/(\d{1,2})\b/);
        if (dm) { const mon = isNaN(dm[2]) ? MON.findIndex((x) => x.toLowerCase() === dm[2]) : +dm[2] - 1; date = `2026-${String(mon + 1).padStart(2, "0")}-${String(+dm[1]).padStart(2, "0")}`; }
        let time = "23:59"; const tm = l.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || l.match(/\b(\d{1,2}):(\d{2})\b/);
        if (tm) { let h = +tm[1]; if (tm[3] === "pm" && h < 12) h += 12; if (tm[3] === "am" && h === 12) h = 0; time = `${String(h).padStart(2, "0")}:${tm[2] || "00"}`; } else if (/\bnoon\b/.test(l)) time = "12:00";
        if (course && item && date) found.push({ course: course.replace(/\s/g, "").toUpperCase(), item, date, time });
      });
      return found.length ? { found: true, items: found } : { found: false };
    }

    // E4 suggestion (competent path only; none when gaps are unavailable)
    const e4 = (ctx) => (ctx.elmDown || db.student.path !== "competent" ? null : { ...F.e4 });
    // E5 ask (mocked answers; capped per day)
    function e5(q, ctx) {
      if (db.askLeft <= 0) return { capped: true };
      db.askLeft--;
      if (ctx.elmDown) return { answer: "I can't answer right now. Try the template: [finish] + [what, with a number or name]." };
      const l = q.toLowerCase();
      const a = /long|time|minutes|how much/.test(l) ? "Look at your free slots: you have about 10 free hours today. Keep each task under 90 minutes and leave some time unplanned."
        : /order|first|start/.test(l) ? "Start with the task linked to your nearest milestone (Lab 3 submitted, Fri). It has the clearest finish line."
        : /specific|vague|clear/.test(l) ? "Name what will exist when you stop, e.g. \"Q1–4 answered\" or \"3 worked examples redone\"."
        : "Keep the plan small enough to finish. A task is clear when you can tell, at the end, whether it's done.";
      return { answer: a };
    }

    // 7.6 completion / on target / path switch — only at check-in
    function checkin(W, took, overall) {
      const original = W.tasks.filter((t) => !t.added);
      const handled = original.filter((t) => t.status === "done" || t.status === "moved").length;
      const completion = original.length ? handled / original.length : 0;
      const onTarget = W.offDay ? null : W.quality >= CFG.QUALITY_MIN && completion >= CFG.COMPLETION_MIN;
      const before = db.student.path;
      W.tasks.filter((t) => t.status === "done" && took[t.id]).forEach((t) => { const ty = (t.verdict && t.verdict.type) || SERVER.typeOf(t.text); (db.ratings[ty] = db.ratings[ty] || []).push(took[t.id]); });
      let change = null;
      if (onTarget !== null) {
        db.student.recent.push(onTarget); db.student.recent = db.student.recent.slice(-CFG.N_PLANS);
        const n = db.student.recent.filter(Boolean).length;
        if (before === "beginner" && n >= CFG.BEST_OF) { db.student.path = "competent"; change = "unlock"; }
        else if (before === "competent" && db.student.recent.slice(-CFG.STEP_BACK_AFTER).every((x) => x === false)) { db.student.path = "beginner"; change = "stepback"; }
      }
      db.history.push({ date: W.date, completion: W.offDay ? null : Math.round(completion * 100) });
      db.history = db.history.slice(-14);
      return { completion, handled, total: original.length, onTarget, change, count: db.student.recent.filter(Boolean).length, tip: tip() };
    }
    function tip() {
      const t = Object.entries(db.ratings).find(([, r]) => r.length >= 3 && r.filter((x) => x === "more" || x === "much_more").length / r.length >= 0.5);
      return t ? `Your ${t[0]} tasks tend to take longer than planned; try adding 25%.` : null;
    }
    function tendencies() {
      return Object.entries(db.ratings).filter(([, r]) => r.length >= 3).map(([type, r]) => {
        const over = r.filter((x) => x === "more" || x === "much_more").length / r.length, under = r.filter((x) => x === "less").length / r.length;
        return `${TYPE_NAME[type]} tasks ${over >= 0.5 ? "usually take longer than planned" : under >= 0.5 ? "usually take less time than planned" : "are on target"}.`;
      });
    }

    return { blocksFor, freeMinutes, slots, classify, typeOf, TYPE_NAME, dueSoon, e1, e3, e4, e5, rewriteOf, ruleVerdict, rules, quality, milestoneRules, checkin, tendencies };
  })();

  // ================= client state =================
  const st = {
    now: "09:30",
    sim: { elm: false, waking: false, net: false, push: false, fresh: false },
    weeklyDismissed: false,
    setupTab: "fill", preview: null, readMsg: null, editDeadline: null,
    msDeadline: "d1", msEdit: null, msTags: {},
    toastAct: null, suggestion: { skipped: false, editing: false },
    showRecovery: false, notif: "default",
    checkin: null,
  };
  const newWizard = (date, withFixture) => ({
    date, step: 1, started: false,
    q1: "", extracted: null, extractEdit: false, extractSaved: false,
    busyText: "", busy: [], priority: "",
    tasks: withFixture ? F.tasks.map((t) => ({ ...t, verdict: null, overridden: false, accepted: false, changedSinceReview: false, status: "planned", movedTo: null })) : [blankTask()],
    showWhere: false, template: false, ask: { open: false, q: "", answer: null },
    evaluated: false, evaluating: false, reviewsUsed: 0, rulesOnly: false,
    priorityCovered: null, coveredBy: null, priorityOverride: false, rewrite: null, fullFeedback: false,
    quality: null, submitted: false, offDay: false, linkAsked: false, links: {}, closed: false,
  });
  let seq = 10;
  function blankTask() { return { id: "t" + seq++, text: "", time: "", mins: 30, where: "", verdict: null, overridden: false, accepted: false, changedSinceReview: true, status: "planned", movedTo: null }; }
  let W = (() => { const d = LS.get("socratix-plan-draft", null); return d && d.date === F.today && !d.submitted ? d : newWizard(F.today, true); })();
  const saveDraft = () => { if (!W.submitted) LS.set("socratix-plan-draft", W); };

  const competent = () => db.student.path === "competent";
  const onTargetCount = () => db.student.recent.filter(Boolean).length;
  const pathLine = () => (competent() ? "Competent path" : `Beginner path · ${onTargetCount()} of ${CFG.N_PLANS} plans`);
  const afterSix = () => toMin(st.now) >= 18 * 60;
  const extraBusy = () => W.busy;
  const deadlineById = (id) => db.setup.deadlines.find((d) => d.id === id);

  // simulated request: latency, cold start banner (> 3 s), network errors
  async function api(fn) {
    let wakeTimer;
    if (st.sim.waking) wakeTimer = setTimeout(() => { const b = document.querySelector("[data-waking]"); if (b) b.hidden = false; }, 3000);
    await sleep(st.sim.waking ? 3600 : 450);
    clearTimeout(wakeTimer); const b = document.querySelector("[data-waking]"); if (b) b.hidden = true;
    if (st.sim.net) throw new Error("network");
    return fn();
  }
  function netToast(retry) {
    const el = document.getElementById("toast");
    el.innerHTML = `<span>Couldn't reach the server. Check your connection and try again.</span>${retry ? ` <button type="button" class="toast-act" data-retry>Retry</button>` : ""}`;
    el.classList.add("show");
    clearTimeout(netToast.t); netToast.t = setTimeout(() => el.classList.remove("show"), 5000);
    const r = el.querySelector("[data-retry]"); if (r) r.onclick = () => { el.classList.remove("show"); retry(); };
  }

  // ---------- shared bits ----------
  const tag = (kind, text) => `<span class="ptag ${kind}">${text}</span>`;
  const head = (title, desc = "") => `<div class="page-head"><div><h1>${title}</h1><p class="path-line">${pathLine()}</p>${desc ? `<p class="small muted">${desc}</p>` : ""}</div></div>`;
  const waking = `<div class="banner" data-waking hidden role="status"><span class="spin" aria-hidden="true"></span>Waking up the server… (can take up to a minute)</div>`;
  const setupFirst = () => `<section class="panel"><div class="empty">${icon("calendar-cog")}<h2>Set up your week first</h2><p class="small">Add your deadlines, day window and timetable, so plans can use your real free time.</p><a class="btn btn-primary" href="#/plan/setup">Set up my week</a></div></section>`;

  function proto() {
    const b = (k, l) => `<button class="btn btn-sm" type="button" data-pl="sim" data-v="${k}" aria-pressed="${!!st.sim[k]}">${l}</button>`;
    return `<details class="panel proto"><summary class="small muted">Prototype only: path, time and states</summary>
      <div class="row" style="margin-top:10px">
        <div class="seg seg-sm" role="group" aria-label="Path">${["beginner", "competent"].map((p) => `<button type="button" data-pl="path" data-v="${p}" aria-pressed="${db.student.path === p}">${p === "beginner" ? "Path 1 · beginner" : "Path 2 · competent"}</button>`).join("")}</div>
        <div class="seg seg-sm" role="group" aria-label="Time now">${["09:30", "14:30", "18:30"].map((t) => `<button type="button" data-pl="clock" data-v="${t}" aria-pressed="${st.now === t}">${t}</button>`).join("")}</div>
        ${b("elm", "ELM down")}${b("waking", "Server waking")}${b("net", "Network error")}${b("push", "Push not delivered")}${b("fresh", "No setup yet")}
        <button class="btn btn-sm" type="button" data-pl="next-day">Simulate next day</button>
        <button class="btn btn-sm" type="button" data-pl="reset">Reset planning demo</button>
      </div></details>`;
  }

  // ================= §12 Today =================
  function today(parts) {
    if (st.sim.fresh) return `${waking}${todayHead()}${setupFirst()}${proto()}`;
    const done = W.tasks.filter((t) => t.status === "done").length, next = W.tasks.find((t) => t.status === "planned");
    let primary;
    if (W.submitted && afterSix() && !W.closed) primary = `<div class="tcard-main"><div><div class="label-up">This evening</div><h2>How did today go?</h2><p class="small muted">${done} of ${W.tasks.length} done. Rate your time in about 10 seconds.</p></div><a class="btn btn-primary" href="#/?checkin=1">${icon("moon-star")}Check in (10 seconds)</a></div>`;
    else if (W.submitted && W.closed) primary = `<div class="tcard-main"><div><div class="label-up">Today</div><h2>Plan closed</h2><p class="small muted">${W.offDay ? "Off day: not counted." : `${done} of ${W.tasks.length} done.`} Tomorrow's plan opens from 18:00.</p></div><a class="btn" href="#/progress">${icon("chart-column")}See progress</a></div>`;
    else if (W.submitted) primary = `<div class="tcard-main"><div><div class="label-up">Next task</div><h2>${next ? esc(next.text) : "All tasks handled"}</h2><p class="small muted mono">${next ? `${next.time} · ${next.mins} min · ` : ""}${done} of ${W.tasks.length} done</p></div><a class="btn btn-primary" href="#/plan/today/4">${icon("list-checks")}Open plan</a></div>`;
    else primary = `<div class="tcard-main"><div><div class="label-up">Today</div><h2>Plan your day</h2><p class="small muted">${competent() ? "Write your tasks and get light feedback. About 2 minutes." : "Four short steps: check-in, tasks, feedback, plan. About 3 minutes."}</p></div><a class="btn btn-primary" href="#/plan/today/${W.started ? W.step : 1}">${icon("pencil-line")}${W.started ? `Continue (step ${W.step})` : "Plan your day"}</a></div>`;
    const e4 = SERVER.e4({ elmDown: st.sim.elm });
    const showSug = competent() && e4 && !st.suggestion.skipped && !W.tasks.some((t) => t.link);
    return `${waking}${todayHead()}
      <div class="today-grid">
        <div class="stack" style="gap:16px">
          ${st.sim.push ? `<section class="panel tcard welcome-card"><div class="tcard-main"><div><div class="label-up">Good to see you</div><h2>Your reminder didn't arrive</h2><p class="small muted">No problem. ${W.submitted ? "Your plan is ready below." : "Plan your day here instead."}</p></div><a class="btn btn-primary" href="${W.submitted ? "#/plan/today/4" : "#/plan/today/1"}">${W.submitted ? "Open plan" : "Plan your day"}</a></div></section>` : ""}
          <section class="panel tcard primary-card" aria-label="Today's plan">${primary}</section>
          ${W.submitted ? `<section class="panel" aria-labelledby="cl-h"><div class="panel-head"><h2 id="cl-h">Checklist</h2><span class="sub">${done} of ${W.tasks.length} done</span></div><div class="panel-body checklist compact">${W.tasks.map((t) => checkRow(t, true)).join("")}</div></section>` : ""}
          ${showSug ? `<section class="panel suggest-card" aria-labelledby="sg-h"><div class="panel-body stack-sm">
            <div class="label-up" id="sg-h">Suggested for you</div>
            ${st.suggestion.editing ? `<div class="sg-edit"><label class="field"><span class="label">Task</span><input class="input" data-pl-in="sg-text" value="${esc(e4.text)}"></label><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-pl-in="sg-time" value="${e4.time}"></label><label class="field"><span class="label">Minutes</span><input class="input mono" type="number" min="5" max="90" data-pl-in="sg-mins" value="${e4.mins}"></label></div>`
              : `<p><b>Suggested:</b> ${esc(e4.text)} · <span class="mono">${e4.mins} min · ${e4.time}</span></p><p class="tiny faint">From your practice: ${esc(e4.concept)} is worth practising.</p>`}
            <div class="row"><button class="btn btn-primary btn-sm" type="button" data-pl="sg-add">${icon("plus")}Add</button>${st.suggestion.editing ? "" : `<button class="btn btn-sm" type="button" data-pl="sg-edit">Edit</button>`}<button class="btn btn-ghost btn-sm" type="button" data-pl="sg-skip">Skip</button></div>
          </div></section>` : ""}
        </div>
        <section class="panel" aria-labelledby="dw-h"><div class="panel-head"><h2 id="dw-h">Due this week</h2><a class="btn btn-ghost btn-sm" href="#/plan/milestones">Milestones</a></div>
          <div class="panel-body">${dueList(W.date)}</div></section>
      </div>
      ${parts.query.checkin === "1" ? eveningSheet() : ""}
      ${proto()}`;
  }
  function todayHead() {
    const h = toMin(st.now) / 60, g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return `<div class="page-head"><div><h1>${g}</h1><p class="path-line">${fmtLong(W.date)} · ${pathLine()}</p></div></div>`;
  }
  function dueList(date) {
    const ms = SERVER.dueSoon(date);
    return ms.length ? `<ul class="due-list">${ms.map((m) => { const dl = deadlineById(m.deadline); return `<li><span class="due-day mono">${WD[wd(m.date)]}</span><span><b>${esc(m.name)}</b><span class="tiny faint">${dl ? `${esc(dl.course)} · ${esc(dl.item)}` : ""}</span></span></li>`; }).join("")}</ul>` : `<p class="small faint">No milestones due in the next 7 days.</p>`;
  }

  // ================= §4 Plan landing =================
  function landing() {
    if (st.sim.fresh) return `${waking}${head("Plan")}${setupFirst()}${proto()}`;
    const btn = W.submitted ? `<a class="btn btn-primary" href="#/plan/today/4">${icon("list-checks")}View plan</a>`
      : W.started ? `<a class="btn btn-primary" href="#/plan/today/${W.step}">${icon("arrow-right")}Continue (step ${W.step})</a>`
      : `<a class="btn btn-primary" href="#/plan/today/1">${icon("pencil-line")}Plan today</a>`;
    const tomorrow = afterSix() ? `<button class="btn" type="button" data-pl="plan-tomorrow">${icon("calendar-plus")}Plan tomorrow</button>` : "";
    const upcoming = [...db.setup.deadlines].filter((d) => d.date >= F.today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 3);
    const thisWeek = db.milestones.filter((m) => m.date >= mondayOf(F.today) && m.date <= addDays(mondayOf(F.today), 6) && m.date >= F.today).length;
    const showWeekly = wd(F.today) === 1 && !st.weeklyDismissed;
    return `${waking}${head("Plan")}
      ${showWeekly ? `<div class="banner info" role="status">${icon("calendar-sync")}<span>Anything new this week? Update your deadlines.</span><a class="btn btn-sm" href="#/plan/setup" data-pl="weekly-go">Update deadlines</a><button class="icon-btn" type="button" data-pl="weekly-x" aria-label="Dismiss">${icon("x")}</button></div>` : ""}
      <div class="plan-cards">
        <section class="panel" aria-labelledby="pc1"><div class="panel-head"><h2 id="pc1">Today's plan</h2><span class="sub">${fmtDate(W.date)}</span></div>
          <div class="panel-body stack-sm"><p class="small muted">${W.submitted ? `Saved with quality ${W.quality}/5. ${W.tasks.filter((t) => t.status === "done").length} of ${W.tasks.length} done.` : W.started ? `In progress: step ${W.step} of 4.` : "Not planned yet."}</p><div class="row">${btn}${tomorrow}</div></div></section>
        <section class="panel" aria-labelledby="pc2"><div class="panel-head"><h2 id="pc2">Deadlines & milestones</h2></div>
          <div class="panel-body stack-sm">
            <ul class="dl-list">${upcoming.map((d) => `<li><span>${esc(d.course)} · ${esc(d.item)}</span><span class="mono small">${fmtDate(d.date)}</span></li>`).join("")}</ul>
            <a class="btn btn-sm" href="#/plan/milestones">${icon("flag")}${thisWeek} milestone${thisWeek === 1 ? "" : "s"} due this week</a></div></section>
        <section class="panel" aria-labelledby="pc3"><div class="panel-head"><h2 id="pc3">Setup</h2></div>
          <div class="panel-body stack-sm"><dl class="kv"><dt>Day window</dt><dd class="mono">${db.setup.window.start}–${db.setup.window.end}</dd><dt>Timetable</dt><dd>${db.setup.classes.length} classes a week</dd><dt>Last updated</dt><dd>${esc(db.setup.updated)}</dd></dl>
            <div><a class="btn btn-sm" href="#/plan/setup">${icon("settings-2")}Update</a></div></div></section>
      </div>${proto()}`;
  }

  // ================= §5 Setup =================
  function setup() {
    const S = db.setup;
    const dlRows = [...S.deadlines].sort((a, b) => a.date.localeCompare(b.date)).map((d) => st.editDeadline === d.id
      ? `<li class="dl-edit">${deadlineFields(d, "ed")}<div class="row"><button class="btn btn-sm btn-primary" type="button" data-pl="dl-save" data-v="${d.id}">Save</button><button class="btn btn-sm btn-ghost" type="button" data-pl="dl-cancel">Cancel</button></div></li>`
      : `<li><span><b>${esc(d.course)}</b> · ${esc(d.item)}</span><span class="mono small">${fmtDate(d.date)} · ${d.time}</span><span class="row"><button class="btn btn-sm btn-ghost" type="button" data-pl="dl-edit" data-v="${d.id}">Edit</button><button class="btn btn-sm btn-ghost" type="button" data-pl="dl-del" data-v="${d.id}">Delete</button></span></li>`).join("");
    const days = [1, 2, 3, 4, 5];
    return `${waking}${head("Setup", "Deadlines, day window, timetable and busy time. Each part saves on its own.")}
      <div class="setup-grid">
      <section class="panel" aria-labelledby="s1"><div class="panel-head"><h2 id="s1">Deadlines</h2></div><div class="panel-body stack-sm" style="gap:14px">
        <div class="tabs" role="tablist" aria-label="How to add deadlines">${[["fill", "Fill in"], ["paste", "Paste text"]].map(([k, l]) => `<button role="tab" type="button" data-pl="setup-tab" data-v="${k}" aria-selected="${st.setupTab === k}">${l}</button>`).join("")}</div>
        ${st.readMsg ? `<p class="note" role="status">${icon("info")}<span>${st.readMsg}</span></p>` : ""}
        ${st.setupTab === "fill" ? `<div class="dl-form">${deadlineFields({ course: "", item: "", date: "", time: "" }, "new")}<button class="btn btn-primary" type="button" data-pl="dl-add">${icon("plus")}Add</button></div>`
          : `<div class="field"><label for="paste">Paste anything: an email, a course page, your own notes</label><textarea class="textarea" id="paste" rows="4" data-pl-in="paste" placeholder="e.g. cw2 for inf2 moved to thursday 2pm">${esc(st.pasteText || "")}</textarea></div>
             <div><button class="btn btn-primary" type="button" data-pl="read" ${st.reading ? "disabled" : ""}>${st.reading ? "Reading…" : `${icon("scan-text")}Read it`}</button></div>
             ${st.preview ? `<div class="preview" aria-label="Found deadlines"><div class="label-up">Found · nothing is saved yet</div>
               ${st.preview.map((p, k) => `<div class="pv-row ${p.keep ? "" : "removed"}">${deadlineFields(p, "pv" + k)}<button class="btn btn-sm" type="button" data-pl="pv-toggle" data-v="${k}" aria-pressed="${p.keep}">${p.keep ? "Remove" : "Keep"}</button></div>`).join("")}
               <div class="row"><button class="btn btn-primary btn-sm" type="button" data-pl="save-all" ${st.preview.some((p) => p.keep) ? "" : "disabled"}>${icon("check")}Save all</button><span class="tiny faint">${st.preview.filter((p) => p.keep).length} to save</span></div></div>` : ""}`}
        <ul class="dl-list saved">${dlRows}</ul>
      </div></section>

      <section class="panel" aria-labelledby="s2"><div class="panel-head"><h2 id="s2">Day window</h2></div><div class="panel-body stack-sm">${windowControl("setup")}</div></section>

      <section class="panel span2" aria-labelledby="s3"><div class="panel-head"><h2 id="s3">Timetable</h2><span class="sub">Outlook sync is coming later.</span></div><div class="panel-body stack-sm" style="gap:14px">
        <div class="tt-grid">${days.map((d) => `<div class="tt-day"><div class="tt-h">${WD[d]}</div>${S.classes.filter((c) => c.day === d).sort((a, b) => a.start.localeCompare(b.start)).map((c) => `<div class="tt-class"><span class="mono tiny">${c.start}–${c.end}</span><span class="small">${esc(c.name)}</span><button class="icon-btn" type="button" data-pl="cls-del" data-v="${c.id}" aria-label="Remove ${esc(c.name)} on ${WDL[d]}">${icon("x")}</button></div>`).join("") || `<span class="tiny faint">No classes</span>`}</div>`).join("")}</div>
        ${st.addClass ? `<div class="cls-form"><label class="field"><span class="label">Day</span><select class="select" data-pl-in="cls-day">${days.map((d) => `<option value="${d}">${WDL[d]}</option>`).join("")}</select></label><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-pl-in="cls-start" value="10:00"></label><label class="field"><span class="label">End</span><input class="input mono" type="time" data-pl-in="cls-end" value="11:00"></label><label class="field"><span class="label">Name</span><input class="input" data-pl-in="cls-name" placeholder="e.g. INF2 lecture"></label><button class="btn btn-primary btn-sm" type="button" data-pl="cls-add">Add</button></div>` : ""}
        <div class="row"><button class="btn btn-sm" type="button" data-pl="cls-open">${icon("plus")}Add class</button>
          <label class="btn btn-sm file-btn">${icon("upload")}Upload .ics <span class="ptag neutral">Demo</span><input type="file" accept=".ics,text/calendar" data-pl-in="ics" class="sr-only"></label>
          <span style="flex:1"></span><button class="btn btn-sm btn-primary" type="button" data-pl="save-tt">Save timetable</button></div>
      </div></section>

      <section class="panel span2" aria-labelledby="s4"><div class="panel-head"><h2 id="s4">Personal commitments</h2></div><div class="panel-body stack-sm" style="gap:12px">
        <p class="tiny faint">${icon("shield")} Only "Busy" is stored on our server. The label stays on this device.</p>
        <div class="busy-rows">${S.busy.map((b) => `<div class="busy-row" data-busy="${b.id}">
          <div class="day-picks" role="group" aria-label="Days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="dpick" data-pl="busy-day" data-v="${b.id}:${d}" aria-pressed="${b.days.includes(d)}">${WD[d].slice(0, 2)}</button>`).join("")}</div>
          <input class="input mono" type="time" aria-label="Start" data-pl-busy="${b.id}" data-f="start" value="${b.start}">
          <input class="input mono" type="time" aria-label="End" data-pl-busy="${b.id}" data-f="end" value="${b.end}">
          <input class="input" aria-label="Label (stays on this device)" data-pl-busy="${b.id}" data-f="label" value="${esc(busyLabels[b.id] || "")}" placeholder="Label (only on this device)">
          <button class="icon-btn" type="button" data-pl="busy-del" data-v="${b.id}" aria-label="Remove">${icon("trash-2")}</button></div>`).join("")}</div>
        <div class="row"><button class="btn btn-sm" type="button" data-pl="busy-add">${icon("plus")}Add busy time</button><span style="flex:1"></span><button class="btn btn-sm btn-primary" type="button" data-pl="save-busy">Save busy times</button></div>
      </div></section>
      </div>${proto()}`;
  }
  const deadlineFields = (d, key) => `<div class="dl-fields">
    <label class="field"><span class="label">Course</span><input class="input" data-dl="${key}" data-f="course" value="${esc(d.course)}" placeholder="INF2"></label>
    <label class="field"><span class="label">Item</span><input class="input" data-dl="${key}" data-f="item" value="${esc(d.item)}" placeholder="Coursework 2"></label>
    <label class="field"><span class="label">Date</span><input class="input mono" type="date" data-dl="${key}" data-f="date" value="${d.date}"></label>
    <label class="field"><span class="label">Time</span><input class="input mono" type="time" data-dl="${key}" data-f="time" value="${d.time}"></label></div>`;
  function windowControl(where) {
    const w = db.setup.window, bad = toMin(w.end) <= toMin(w.start);
    return `<div class="win-row"><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-pl-in="win-start" value="${w.start}"></label>
      <label class="field"><span class="label">End</span><input class="input mono" type="time" data-pl-in="win-end" value="${w.end}"></label></div>
      <p class="tiny ${bad ? "warn-t" : "faint"}" data-win-msg>${bad ? "End needs to be after start." : "Tasks are planned inside this window."}</p>
      <div><button class="btn btn-sm btn-primary" type="button" data-pl="save-win" data-v="${where}" ${bad ? "disabled" : ""}>Save day window</button></div>`;
  }

  // ================= §6 Backward planning =================
  function milestonesPage() {
    if (st.sim.fresh) return `${waking}${head("Milestones")}${setupFirst()}${proto()}`;
    const dl = deadlineById(st.msDeadline) || db.setup.deadlines[0];
    if (!st.msEdit || st.msEdit.deadline !== dl.id) st.msEdit = { deadline: dl.id, rows: db.milestones.filter((m) => m.deadline === dl.id).map((m) => ({ ...m })) };
    const rows = st.msEdit.rows;
    const qs = st.sim.elm ? F.e2Generic : F.e2[dl.id] || F.e2Generic;
    return `${waking}${head("Milestones", "Work backwards from each deadline. You write the milestones; nothing is filled in for you.")}
      <div class="chips-row" role="group" aria-label="Deadline">${db.setup.deadlines.map((d) => `<button type="button" class="qchip" data-pl="ms-dl" data-v="${d.id}" aria-pressed="${d.id === dl.id}">${esc(d.course)} · ${esc(d.item)} <span class="mono">${fmtDate(d.date)}</span></button>`).join("")}</div>
      <div class="ms-layout">
        <section class="panel" aria-labelledby="ms-h"><div class="panel-head"><h2 id="ms-h">${esc(dl.course)} · ${esc(dl.item)}</h2><span class="sub mono">due ${fmtDate(dl.date)}, ${dl.time}</span></div>
          <div class="panel-body stack-sm" style="gap:14px">
            <div class="table-wrap"><table class="data ms-table"><thead><tr><th>Name</th><th>Target date</th><th>Est. hours</th><th>Check</th><th><span class="sr-only">Actions</span></th></tr></thead>
              <tbody>${rows.map((m, k) => msRow(m, k)).join("") || `<tr><td colspan="5" class="small faint">No milestones yet. Add the first one below.</td></tr>`}</tbody></table></div>
            <div class="row"><button class="btn btn-sm" type="button" data-pl="ms-add">${icon("plus")}Add milestone</button><span style="flex:1"></span><button class="btn btn-primary btn-sm" type="button" data-pl="ms-save">${icon("check")}Save milestones</button></div>
          </div></section>
        <div class="stack" style="gap:16px">
          <section class="think" aria-labelledby="th-h"><div class="label-up" id="th-h">Think about</div><ol>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></section>
          <div data-ms-rules>${msRules(dl)}</div>
        </div>
      </div>${proto()}`;
  }
  function msRow(m, k) {
    const overdue = m.date && m.date < F.today;
    const cls = SERVER.classify(m.name), over = st.msTags[m.id];
    const t = over ? tag("neutral", "Your call") : cls === "pass" ? tag("ok", "Looks good") : tag("sug", "Suggestion");
    return `<tr data-ms="${k}">
      <td><input class="input" aria-label="Milestone name" data-ms-in="${k}" data-f="name" value="${esc(m.name)}" placeholder="e.g. Lab 3 submitted">${!over && cls !== "pass" ? `<div class="tiny faint ms-note">Say what "done" means: a number, a name or a result. <button class="linkish" type="button" data-pl="ms-own" data-v="${m.id}">This is specific to me</button></div>` : ""}</td>
      <td><input class="input mono" type="date" aria-label="Target date" data-ms-in="${k}" data-f="date" value="${m.date}">${overdue ? `<div class="row" style="margin-top:4px">${tag("neutral", "Overdue")}<button class="linkish" type="button" data-pl="ms-redate" data-v="${k}">Re-date</button></div>` : ""}</td>
      <td><input class="input mono hrs" type="number" min="0" step="0.5" aria-label="Estimated hours" data-ms-in="${k}" data-f="hours" value="${m.hours}"></td>
      <td data-ms-tag="${k}">${t}</td>
      <td><button class="icon-btn" type="button" data-pl="ms-del" data-v="${k}" aria-label="Delete milestone">${icon("trash-2")}</button></td></tr>`;
  }
  function msRules(dl) {
    const R = SERVER.milestoneRules(st.msEdit.rows, dl);
    const max = Math.max(1, ...R.weeks.map((w) => Math.max(w.planned, w.free)));
    const panels = [];
    if (!R.buffer) panels.push(`<div class="rule-panel">${tag("warn", "Buffer")}<span>Leave at least 2 days before the deadline.</span></div>`);
    if (!R.order) panels.push(`<div class="rule-panel">${tag("warn", "Order")}<span>Milestones are out of order.</span><button class="btn btn-sm" type="button" data-pl="ms-sort">Sort by date</button></div>`);
    R.cramming.forEach((c) => panels.push(`<div class="rule-panel">${tag("warn", "Cramming")}<span>Week of ${fmtDate(c.week).slice(4)}: ${c.planned} h planned, ${c.free} h free. Spread it out?</span></div>`));
    return `${panels.join("") || `<div class="rule-panel ok">${tag("ok", "Looks good")}<span>Dates leave room before the deadline and every week fits your free time.</span></div>`}
      <section class="panel weeks" aria-labelledby="wk-h"><div class="panel-head"><h3 id="wk-h">Hours per week</h3><span class="sub">planned vs free</span></div>
        <div class="panel-body"><ul class="wk-bars">${R.weeks.map((w) => `<li title="Week of ${fmtDate(w.week).slice(4)}: ${w.planned} h planned, ${w.free} h free">
          <span class="wk-l mono small">${fmtDate(w.week).slice(4)}</span>
          <span class="wk-track"><span class="wk-fill ${w.planned > w.free ? "over" : ""}" style="width:${(w.planned / max) * 100}%"></span><span class="wk-cap" style="left:${(w.free / max) * 100}%" aria-hidden="true"></span></span>
          <span class="wk-v small"><b>${w.planned} h</b> <span class="faint">/ ${w.free} h free</span>${w.planned > w.free ? ` ${tag("warn", "Over")}` : ""}</span></li>`).join("")}</ul>
          <p class="tiny faint">Bar: hours your milestones need that week (spread evenly up to each target date). Line: your free hours from the day window, timetable and busy time.</p></div></section>`;
  }

  // ================= §7–§10 daily wizard =================
  const STEPS = ["Today's check-in", "Write your tasks", "Feedback", "Today's plan"];
  function stepper(n) {
    return `<ol class="stepper" aria-label="Plan steps">${STEPS.map((s, k) => `<li ${k + 1 === n ? 'aria-current="step"' : ""} class="${k + 1 < n || (W.submitted && k < 3) ? "done" : ""} ${competent() && k === 0 ? "skipped" : ""}"><span class="sn">${k + 1 < n ? icon("check") : k + 1}</span><span class="sl-t">${s}</span></li>`).join("")}</ol>`;
  }
  function wizard(n) {
    if (st.sim.fresh) return `${waking}${head("Plan today")}${setupFirst()}${proto()}`;
    W.started = true; W.step = n; saveDraft();
    const body = n === 1 ? step1() : n === 2 ? step2() : n === 3 ? step3() : step4();
    return `${waking}${head(W.date === F.today ? "Plan today" : `Plan ${fmtDate(W.date)}`)}${stepper(n)}<div class="wiz" data-step="${n}">${body}</div>${proto()}`;
  }
  const stepLabel = (n, t, right = "") => `<div class="step-label"><span class="label-up">Step ${n} of 4 · ${t}</span>${right ? `<span class="small muted">${right}</span>` : ""}</div>`;

  function step1() {
    const ex = W.extracted;
    return `${stepLabel(1, "Today's check-in", "About 20 seconds")}
      <section class="panel"><div class="panel-body stack" style="gap:22px">
        <div class="q"><label for="q1" class="q-l"><span class="qn">1</span>Anything new due or changed?</label>
          <div class="row nowrap"><input class="input" id="q1" data-pl-in="q1" value="${esc(W.q1)}" placeholder="e.g. cw2 for inf2 moved to thursday 2pm"><button class="btn" type="button" data-pl="q1-read" ${W.reading ? "disabled" : ""}>${W.reading ? "Reading…" : "Read it"}</button></div>
          ${ex && ex.found && !W.extractEdit ? `<div class="found" role="status"><span class="label-up">Found</span><span class="mono">${esc(ex.items[0].course)} · ${esc(ex.items[0].item)} · ${fmtDate(ex.items[0].date)}, ${ex.items[0].time}</span>
            <span class="row">${W.extractSaved ? `<span class="ptag ok">${icon("check")}Saved</span>` : `<button class="btn btn-sm btn-primary" type="button" data-pl="q1-save">Save</button><button class="btn btn-sm" type="button" data-pl="q1-edit">Edit</button>`}</span></div>` : ""}
          ${(ex && !ex.found) || W.extractEdit ? `<div class="found edit">${ex && !ex.found ? `<p class="small muted">Couldn't read that. Fill it in instead.</p>` : ""}${deadlineFields(ex && ex.found ? ex.items[0] : { course: "", item: "", date: "", time: "" }, "q1")}<div><button class="btn btn-sm btn-primary" type="button" data-pl="q1-save-form">Save</button></div></div>` : ""}
          <div class="due-inline small"><span class="faint">Due this week:</span> ${SERVER.dueSoon(W.date).map((m) => `<b>${esc(m.name)}</b> <span class="faint">(${WD[wd(m.date)]})</span>`).join(" · ") || "nothing"}</div>
        </div>
        <div class="q"><label for="q2" class="q-l"><span class="qn">2</span>Any extra busy time today?</label>
          <input class="input" id="q2" data-pl-in="q2" value="${esc(W.busyText)}" placeholder="15:00–16:00 gym" aria-describedby="q2h">
          <span class="hint-text" id="q2h">Saved as "Busy". The label stays on your device.</span></div>
        <div class="q"><label for="q3" class="q-l"><span class="qn">3</span>What's your top priority today? <span class="faint" style="font-weight:400">(required)</span></label>
          <input class="input" id="q3" data-pl-in="q3" value="${esc(W.priority)}" placeholder="e.g. CS coursework" required aria-required="true"></div>
      </div></section>
      <div class="wiz-foot"><span></span><button class="btn btn-primary" type="button" data-pl="to2" ${W.priority.trim() ? "" : "disabled"} aria-describedby="to2-why">Next ${icon("arrow-right")}</button></div>
      <p class="tiny faint right" id="to2-why">${W.priority.trim() ? "" : "Add your top priority to continue."}</p>`;
  }

  function slotStrip() {
    const sl = SERVER.slots(W.date, extraBusy());
    return `<div class="slots"><span class="small">Your day: <span class="mono">${db.setup.window.start}–${db.setup.window.end}</span>. Free slots:</span>
      ${sl.map((s) => `<span class="slot ${s.free ? "free" : "busy"}">${fromMin(s.start)}–${fromMin(s.end)}${s.free ? "" : ` ${esc(s.label === "busy" ? "busy" : `${s.label} · busy`)}`}</span>`).join("")}</div>`;
  }
  function step2() {
    const R = SERVER.rules(W.tasks, W.date, extraBusy());
    return `${stepLabel(2, "Write your tasks")}
      ${slotStrip()}
      <section class="panel"><div class="panel-body stack-sm" style="gap:12px">
        <div class="table-wrap task-wrap"><table class="task-table"><thead><tr><th>What exactly</th><th>When</th><th>How long</th>${W.showWhere ? "<th>Where</th>" : ""}<th><span class="sr-only">Delete</span></th></tr></thead>
          <tbody>${W.tasks.map((t) => `<tr data-task="${t.id}">
            <td><input class="input" aria-label="What exactly" data-tk="${t.id}" data-f="text" value="${esc(t.text)}" placeholder="e.g. Finish tutorial 4, Q1–3"><div class="tk-hint tiny" data-hint="${t.id}" aria-live="polite">${hintHtml(R.hints[t.id])}</div></td>
            <td><input class="input mono" type="time" aria-label="When" data-tk="${t.id}" data-f="time" value="${t.time}"></td>
            <td><span class="mins"><input class="input mono" type="number" min="5" max="600" aria-label="How long, minutes" data-tk="${t.id}" data-f="mins" value="${t.mins}"><span class="tiny faint">min</span></span></td>
            ${W.showWhere ? `<td><input class="input" aria-label="Where" data-tk="${t.id}" data-f="where" value="${esc(t.where)}" placeholder="optional"></td>` : ""}
            <td><button class="icon-btn" type="button" data-pl="tk-del" data-v="${t.id}" aria-label="Delete task">${icon("trash-2")}</button></td></tr>`).join("")}</tbody></table></div>
        <div class="row"><button class="btn btn-sm" type="button" data-pl="tk-add">${icon("plus")}Add task</button>
          <button class="btn btn-sm btn-ghost" type="button" data-pl="where" aria-expanded="${W.showWhere}">${icon(W.showWhere ? "eye-off" : "map-pin")}${W.showWhere ? "Hide Where" : "Add Where"}</button>
          <button class="btn btn-sm btn-ghost" type="button" data-pl="template" aria-expanded="${W.template}">${icon("lightbulb")}Need help? Template</button></div>
        ${W.template ? `<div class="template"><p><b>Template:</b> [finish / complete / write] + [what, with a number or name], or [activity] + "for [minutes]".</p><p class="small muted">Ask yourself: How will I know it's done? Does it fit the time I gave it?</p></div>` : ""}
        ${askBox()}
      </div></section>
      <div class="wiz-foot">${competent() ? "<span></span>" : `<a class="btn" href="#/plan/today/1">${icon("arrow-left")}Back</a>`}<button class="btn btn-primary" type="button" data-pl="check" ${W.evaluating || !W.tasks.length ? "disabled" : ""}>${W.evaluating ? "Checking…" : W.reviewsUsed ? "Check again" : "Check my plan"}</button></div>`;
  }
  const hintHtml = (h) => (h || []).map((x) => `<span>${icon("info")}${esc(x)}</span>`).join("");
  function askBox() {
    const A = W.ask;
    return `<div class="ask">${A.open ? `<div class="field"><label for="ask">Ask about this plan</label><div class="row nowrap"><input class="input" id="ask" data-pl-in="ask" value="${esc(A.q)}" placeholder="e.g. Is this too much for one day?"><button class="btn btn-sm" type="button" data-pl="ask" ${db.askLeft <= 0 || A.loading ? "disabled" : ""}>${A.loading ? "…" : "Ask"}</button></div>
      <span class="tiny faint">${db.askLeft} of ${CFG.ASK_PER_DAY} left today</span></div>${A.answer ? `<div class="ask-a" role="status">${esc(A.answer)}</div>` : ""}`
      : `<button class="linkish" type="button" data-pl="ask-open">${icon("message-circle-question")}Ask about this plan</button>`}</div>`;
  }

  function step3() {
    if (W.evaluating) return `${stepLabel(3, "Feedback (suggestions)")}<div class="stack" aria-busy="true">${W.tasks.map(() => `<div class="panel"><div class="panel-body stack-sm"><span class="sk" style="width:45%;height:16px"></span><span class="sk" style="width:25%"></span><span class="sk" style="width:85%"></span></div></div>`).join("")}</div>`;
    if (!W.evaluated) return `${stepLabel(3, "Feedback (suggestions)")}<section class="panel"><div class="empty"><p>Check your plan first.</p><a class="btn btn-primary" href="#/plan/today/2">Back to your tasks</a></div></section>`;
    const R = SERVER.rules(W.tasks, W.date, extraBusy());
    W.quality = SERVER.quality(W, R);
    const weakest = !competent() && W.rewrite && W.tasks.find((t) => t.id === W.rewrite.taskId && !t.overridden && t.verdict && t.verdict.issue === "not_finishable");
    const shown = competent() && !W.fullFeedback ? W.tasks.filter((t) => t.verdict && (t.verdict.issue || t.verdict.finishable === "unsure") && !t.overridden && !t.accepted) : W.tasks;
    return `${stepLabel(3, "Feedback (suggestions)")}
      <div class="score-row"><div><span class="small muted">Plan quality</span><div class="score" aria-live="polite" data-score><b>${W.quality}</b>/5</div></div>
        <p class="small muted">Suggestions, not marks. You decide what to change.</p></div>
      ${W.rulesOnly ? `<p class="note">${icon("info")}<span>Further checks use the rules only.</span></p>` : ""}
      <div data-prio>${priorityPanel()}</div>
      <div class="cards">${shown.map((t) => taskCard(t, weakest && weakest.id === t.id)).join("") || `<div class="panel"><div class="empty"><p class="small">${competent() ? "No suggestions: every task looks clear." : "No tasks."}</p></div></div>`}</div>
      <div class="rules">
        <div class="rule-panel ${R.buffer ? "ok" : ""}">${tag(R.buffer ? "ok" : "warn", "Buffer")}<span>${Math.max(0, R.free - R.planned)} of ${R.free} free minutes left unplanned (${Math.max(0, R.bufferPct)}%). ${R.buffer ? "Above the 15% minimum." : "Under the 15% minimum: leave some time free."}</span></div>
        ${R.clashes.map((c) => `<div class="rule-panel">${tag("warn", "Clash")}<span>"${esc(c.task.text)}" overlaps with ${esc(c.with)}.</span></div>`).join("")}
      </div>
      ${competent() && !W.fullFeedback ? `<div><button class="btn btn-sm" type="button" data-pl="full">${icon("list-checks")}Full feedback</button> <span class="tiny faint">Once per plan.</span></div>` : ""}
      ${askBox()}
      <div class="wiz-foot"><a class="btn" href="#/plan/today/2">${icon("pencil")}Edit tasks</a><button class="btn btn-primary" type="button" data-pl="submit" ${W.submitting ? "disabled" : ""}>${W.submitting ? "Saving…" : "Submit plan"}</button></div>`;
  }
  function priorityPanel() {
    if (W.priorityCovered === null) return "";
    const by = W.tasks.find((t) => t.id === W.coveredBy);
    if (W.priorityCovered || W.priorityOverride) return `<div class="prio ok">${icon("target")}<span>${W.priorityOverride ? `You said your top priority "${esc(W.priority)}" is covered.` : `Top priority "${esc(W.priority)}" is covered by "${esc(by ? by.text : "")}".`}</span></div>`;
    return `<div class="prio warn">${icon("target")}<span>Your top priority doesn't appear in today's tasks. Add it?</span><span class="row"><button class="btn btn-sm" type="button" data-pl="prio-add">${icon("plus")}Add task</button><button class="btn btn-sm btn-ghost" type="button" data-pl="prio-own">It is covered</button></span></div>`;
  }
  function taskCard(t, worked) {
    const v = t.verdict || {};
    const unsure = v.finishable === "unsure" && !t.accepted && !t.overridden;
    const T = t.overridden ? tag("neutral", "Your call") : t.accepted ? tag("neutral", "Accepted") : unsure ? tag("neutral", "Not checked") : v.issue ? tag("sug", "Suggestion") : tag("ok", "Looks good");
    let actions = "";
    if (unsure) actions = `<button class="btn btn-sm btn-primary" type="button" data-pl="accept" data-v="${t.id}">Accept</button><a class="btn btn-sm" href="#/plan/today/2">Edit</a>`;
    else if (!t.overridden && v.issue === "not_finishable") actions = `${W.rewrite && W.rewrite.taskId === t.id ? `<button class="btn btn-sm btn-primary" type="button" data-pl="use-wording" data-v="${t.id}">Use this wording</button>` : ""}<a class="btn btn-sm" href="#/plan/today/2">Edit</a><button class="btn btn-sm btn-ghost" type="button" data-pl="own" data-v="${t.id}">This is specific to me</button>`;
    else if (!t.overridden && v.issue === "scope_too_big") actions = `<button class="btn btn-sm btn-primary" type="button" data-pl="split" data-v="${t.id}">Split it</button><a class="btn btn-sm" href="#/plan/today/2">Edit</a><button class="btn btn-sm btn-ghost" type="button" data-pl="own" data-v="${t.id}">This is realistic for me</button>`;
    return `<article class="panel tcard-task ${t.fresh ? "enter" : ""}" aria-label="${esc(t.text)}"><div class="panel-body stack-sm">
      <div class="tc-head"><b>${esc(t.text)}</b>${T}</div>
      <div class="mono small faint">${t.time} · ${t.mins} min</div>
      <p class="small">${unsure ? "Couldn't check this one, looks OK?" : t.overridden ? "Your call. Logged, and counted as passed." : esc(v.note || "")}</p>
      ${worked && !unsure ? `<div class="worked"><div class="label-up">Worked example</div><p>${esc(W.rewrite.text)}</p></div>` : ""}
      ${actions ? `<div class="row">${actions}</div>` : ""}
    </div></article>`;
  }

  function step4() {
    if (!W.submitted) return `${stepLabel(4, "Today's plan")}<section class="panel"><div class="empty"><p>Submit your plan first.</p><a class="btn btn-primary" href="#/plan/today/${W.evaluated ? 3 : 2}">Back</a></div></section>`;
    const link = !W.linkAsked && W.tasks.find((t) => t.verdict && t.verdict.milestoneId && !t.added);
    const ms = link && db.milestones.find((m) => m.id === link.verdict.milestoneId);
    return `${stepLabel(4, "Today's plan", tag("ok", `Plan saved · quality ${W.quality}/5`))}
      ${link && ms ? `<div class="link-confirm" role="status">${icon("link")}<span>Link "${esc(link.text.split(",")[0])}" to "${esc(ms.name)}"?</span><span class="row"><button class="btn btn-sm btn-primary" type="button" data-pl="link-yes" data-v="${link.id}">Yes</button><button class="btn btn-sm" type="button" data-pl="link-no">No</button></span></div>` : ""}
      ${W.offDay ? `<div class="note" role="status">${icon("coffee")}<div>Marked as an off day. This plan won't count toward your progress. No reason needed. <button class="linkish" type="button" data-pl="offday-undo">Undo off day</button></div></div>` : ""}
      <section class="panel"><div class="panel-body checklist">${W.tasks.map((t) => checkRow(t, false)).join("")}</div>
        ${W.adding ? `<div class="add-form"><label class="field"><span class="label">Task</span><input class="input" data-pl-in="add-text" placeholder="e.g. Email tutor about CW2"></label><label class="field"><span class="label">When</span><input class="input mono" type="time" data-pl-in="add-time" value="19:00"></label><label class="field"><span class="label">Minutes</span><input class="input mono" type="number" min="5" max="90" data-pl-in="add-mins" value="20"></label><button class="btn btn-sm btn-primary" type="button" data-pl="add-save">Add</button></div>` : ""}
        <div class="panel-foot"><button class="btn btn-sm" type="button" data-pl="add-open">${icon("plus")}Add task (not scored)</button>
          <button class="btn btn-sm" type="button" data-pl="ics">${icon("calendar-plus")}Add to calendar (.ics)</button>
          ${W.offDay ? "" : `<button class="btn btn-sm btn-ghost" type="button" data-pl="offday">${icon("coffee")}Off day</button>`}
          <span style="flex:1"></span><span class="tiny faint">After submitting you can tick, move or add.</span></div></section>
      <div class="wiz-foot"><a class="btn" href="#/">${icon("house")}Today</a>${afterSix() ? `<a class="btn btn-primary" href="#/?checkin=1">${icon("moon-star")}Evening check-in</a>` : `<span class="tiny faint">Evening check-in opens at 18:00.</span>`}</div>`;
  }
  function checkRow(t, compact) {
    const done = t.status === "done", moved = t.status === "moved";
    const canMove = !compact && t.status === "planned" && toMin(st.now) < toMin(t.time);
    const ty = (t.verdict && t.verdict.type) || SERVER.typeOf(t.text);
    const ms = W.links[t.id] && db.milestones.find((m) => m.id === W.links[t.id]);
    return `<div class="crow ${done ? "is-done" : ""} ${moved ? "is-moved" : ""}" data-row="${t.id}">
      <button class="tick" type="button" data-pl="tick" data-v="${t.id}" aria-pressed="${done}" aria-label="${done ? "Done" : "Mark done"}: ${esc(t.text)}">${done ? icon("check") : ""}</button>
      <span class="mono small ct-time">${moved ? t.movedTo : t.time}</span>
      <span class="ct-text"><span class="ct-name">${esc(t.text)}</span>${moved ? `<span class="tiny faint">Moved to ${t.movedTo}</span>` : ""}${ms ? `<span class="tiny faint">${icon("flag")}${esc(ms.name)}</span>` : ""}${t.added ? `<span class="tiny faint">Added · not scored</span>` : ""}</span>
      ${compact ? "" : `<span class="ptag neutral">${SERVER.TYPE_NAME[ty]}</span>`}
      ${t.link ? `<a class="btn btn-sm" href="#/practice/${t.link.ref}?task=${t.id}">${icon("book-open-check")}Practise</a>` : ""}
      ${canMove ? (W.moving === t.id ? `<span class="move-form"><input class="input mono" type="time" aria-label="New time" data-pl-in="move-time" value="${fromMin(Math.min(toMin(t.time) + 120, 20 * 60))}"><button class="btn btn-sm btn-primary" type="button" data-pl="move-save" data-v="${t.id}">Move</button></span>` : `<button class="btn btn-sm btn-ghost" type="button" data-pl="move" data-v="${t.id}">Move</button>`) : ""}
    </div>`;
  }

  // ================= §11 evening check-in (sheet over Today) =================
  const TOOK = [["less", "Less"], ["as_planned", "As planned"], ["more", "More"], ["much_more", "Much more"]];
  function eveningSheet() {
    if (!W.submitted) return `<div class="sheet-wrap" data-sheet><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ev-h"><div class="sheet-head"><span class="label-up" id="ev-h" tabindex="-1" data-autofocus>Evening check-in</span><a class="icon-btn" href="#/" aria-label="Close">${icon("x")}</a></div><p class="small">There's no plan for today yet.</p><a class="btn btn-primary" href="#/plan/today/1">Plan your day</a></div></div>`;
    const C = st.checkin || (st.checkin = { took: {}, overall: null, saving: false, result: null });
    const ticked = W.tasks.filter((t) => t.status === "done"), other = W.tasks.filter((t) => t.status !== "done");
    const ready = ticked.every((t) => C.took[t.id]) && C.overall;
    const chips = (key, val) => `<div class="tchips" role="group" aria-label="Took">${TOOK.map(([k, l]) => `<button type="button" class="tchip" data-pl="took" data-v="${key}:${k}" aria-pressed="${val === k}" ${C.result ? "disabled" : ""}>${l}</button>`).join("")}</div>`;
    return `<div class="sheet-wrap" data-sheet><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ev-h">
      <div class="sheet-head"><span class="label-up" id="ev-h" tabindex="-1" data-autofocus>Evening check-in · about 10 seconds</span>${C.result ? "" : `<button class="btn btn-sm" type="button" data-pl="all-planned">All as planned</button>`}<a class="icon-btn" href="#/" aria-label="Close">${icon("x")}</a></div>
      <div class="stack-sm" style="gap:14px">
        ${ticked.map((t) => `<div class="ev-row"><div class="small"><b>${esc(t.text)}</b> <span class="faint">· planned ${t.mins} min</span></div><div class="row"><span class="tiny faint">Took:</span>${chips(t.id, C.took[t.id])}</div></div>`).join("")}
        ${other.map((t) => `<div class="ev-row dashed small">${esc(t.text)} <span class="faint">· ${t.status === "moved" ? "moved (counts as handled)" : "not done"}</span></div>`).join("")}
        <div class="ev-row overall"><div class="small" style="font-weight:500">Overall, today's plan took:</div>${chips("overall", C.overall)}</div>
      </div>
      ${C.result ? resultPanel(C.result) : `<div class="row" style="margin-top:14px"><button class="btn btn-primary" type="button" data-pl="ev-save" ${ready && !C.saving ? "" : "disabled"} aria-describedby="ev-why">${C.saving ? "Saving…" : "Save"}</button><span class="tiny faint" id="ev-why">${ready ? "" : "Choose one option for every row."}</span></div>`}
    </div></div>`;
  }
  function resultPanel(r) {
    const main = W.offDay ? "Off day: this plan is not counted." : r.onTarget ? `On target. ${r.count} of ${CFG.N_PLANS} plans toward the competent path.` : `Saved. This plan is not on target yet, which is fine; you are still at ${r.count} of ${CFG.N_PLANS}.`;
    const change = r.change === "unlock" ? "You've planned well 4 times out of your last 5. From tomorrow you'll get lighter feedback and no morning questions. You can still ask for full feedback any time."
      : r.change === "stepback" ? "Let's bring back the detailed feedback for a while. It'll fade again as your plans land." : null;
    return `<div class="result enter" role="status" aria-live="polite">
      <p><b>${main}</b></p>
      ${W.offDay ? "" : `<p class="small">Completion today: ${r.handled} of ${r.total} tasks handled (${Math.round(r.completion * 100)}%).</p>`}
      ${r.tip ? `<p class="small">${icon("lightbulb")} ${esc(r.tip)}</p>` : ""}
      ${change ? `<p class="small path-change">${icon("sparkles")} ${change}</p>` : ""}
      <div class="row"><a class="btn btn-sm" href="#/">Done</a><button class="btn btn-sm btn-ghost" type="button" data-pl="next-day">Simulate next day</button></div>
    </div><div data-reflection-slot hidden></div>`;
  }

  // ================= §13 Progress =================
  function progress() {
    const n = onTargetCount(), hist = db.history.slice(-14);
    const done = hist.filter((h) => h.completion != null);
    const avg = done.length ? Math.round(done.reduce((s, h) => s + h.completion, 0) / done.length) : 0;
    return `<div class="page-head"><div><h1>Progress</h1><p class="small muted">Planning · your own history only, no comparison with others.</p></div></div>
      <div class="prog-grid">
        <section class="panel" aria-labelledby="pg1"><div class="panel-head"><h2 id="pg1">Plans on target</h2><span class="sub">${competent() ? "Competent path" : "Beginner path"}</span></div>
          <div class="panel-body stack-sm"><div class="big-stat"><b>${n} of ${CFG.N_PLANS}</b> <span class="small muted">plans on target</span></div>
            <div class="seg-bar" role="img" aria-label="${n} of ${CFG.N_PLANS} recent plans on target">${db.student.recent.map((x) => `<span class="${x ? "on" : ""}"></span>`).join("")}</div>
            <p class="small muted">${competent() ? "You get lighter feedback. Detailed feedback comes back if 3 plans in a row miss the target." : `${Math.max(0, CFG.BEST_OF - n)} more on-target plan${CFG.BEST_OF - n === 1 ? "" : "s"} in your last 5 unlocks lighter feedback.`}</p></div></section>
        <section class="panel span2" aria-labelledby="pg2"><div class="panel-head"><h2 id="pg2">Last 14 days</h2><span class="sub">completion per day</span></div>
          <div class="panel-body">
            <div class="hbars" role="img" aria-labelledby="pg2 bars-sum">
              <div class="hb-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
              <div class="hb-plot">${hist.map((h) => { const d = toDate(h.date).getUTCDate();
                return h.completion == null
                  ? `<div class="hb-col" title="${fmtDate(h.date)}: off day"><span class="hb-off">Off day</span><span class="hb-x">${d}</span></div>`
                  : `<div class="hb-col" title="${fmtDate(h.date)}: ${h.completion}% handled"><span class="hb-bar" style="--h:${h.completion}%"></span><span class="hb-x">${d}</span></div>`; }).join("")}</div>
            </div>
            <p class="small muted" id="bars-sum">${done.length} planned days, ${hist.length - done.length} off day${hist.length - done.length === 1 ? "" : "s"}. On average ${avg}% of tasks were handled; the best day was ${Math.max(...done.map((h) => h.completion))}%.</p>
            <details class="small"><summary>Show as a table</summary><table class="data"><thead><tr><th>Day</th><th>Completion</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${fmtDate(h.date)}</td><td>${h.completion == null ? "Off day" : `${h.completion}%`}</td></tr>`).join("")}</tbody></table></details>
          </div></section>
        <section class="panel" aria-labelledby="pg3"><div class="panel-head"><h2 id="pg3">Time estimates by task type</h2></div>
          <div class="panel-body"><p class="small">${SERVER.tendencies().join(" ") || "Not enough ratings yet (3 per type)."}</p><p class="tiny faint">Only types with at least 3 ratings in the last 14 days.</p></div></section>
      </div>`;
  }

  // ================= §14 Settings (planning parts) =================
  function settingsSection() {
    const ios = /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone;
    return `<section class="panel" aria-labelledby="ps-h" style="margin-bottom:20px"><div class="panel-head"><h2 id="ps-h">Planning</h2><span class="sub">Nickname: <b class="mono">${esc(db.student.nickname)}</b></span></div>
      <div class="panel-body settings-plan">
        <div><h3>Day window</h3>${windowControl("settings")}</div>
        <div><h3>Reminders</h3>
          <div class="stack-sm"><div><button class="btn btn-sm" type="button" data-pl="notify" ${st.notif === "granted" ? "disabled" : ""}>${icon("bell")}${st.notif === "granted" ? "Notifications on" : "Enable notifications"}</button></div>
            ${ios ? `<p class="tiny faint">On iPhone, add this site to your Home Screen first (Share → Add to Home Screen).</p>` : ""}
            <div class="win-row"><label class="field"><span class="label">Morning</span><input class="input mono" type="time" value="08:00" data-pl-in="rem-am"></label><label class="field"><span class="label">Evening</span><input class="input mono" type="time" value="20:00" data-pl-in="rem-pm"></label></div></div></div>
        <div><h3>Recovery code</h3><div class="row"><code class="rcode">${st.showRecovery ? esc(db.student.recovery) : "••••-•••••-•••••-••"}</code><button class="btn btn-sm" type="button" data-pl="rc-show" aria-pressed="${st.showRecovery}">${st.showRecovery ? "Hide" : "Show"}</button><button class="btn btn-sm" type="button" data-pl="rc-copy">${icon("copy")}Copy</button></div></div>
        <div><h3>Your data</h3><button class="btn btn-sm danger-ink" type="button" data-pl="del-open">${icon("trash-2")}Delete my data</button></div>
      </div>
      <dialog class="dlg" data-del-dialog aria-labelledby="del-h"><form method="dialog" class="stack-sm">
        <h2 id="del-h">Delete my data</h2><p class="small">This deletes all your plans, ticks and ratings. It can't be undone.</p>
        <label class="field"><span class="label">Type your nickname (${esc(db.student.nickname)}) to confirm</span><input class="input mono" data-pl-in="del-confirm" autocomplete="off"></label>
        <div class="row"><button class="btn btn-sm danger-ink" type="button" data-pl="del-go" disabled>Delete everything</button><button class="btn btn-sm btn-ghost" value="cancel">Cancel</button></div>
      </form></dialog></section>`;
  }

  // ================= routing =================
  function meta(parts) {
    const [a, b] = parts.path;
    if (a === "setup") return { title: "Setup", parent: "Plan" };
    if (a === "milestones") return { title: "Milestones", parent: "Plan" };
    if (a === "today") return { title: `Step ${b} of 4`, parent: "Plan" };
    return { title: "Plan" };
  }
  function render(parts) {
    const [a, b] = parts.path;
    let body;
    if (a === "setup") body = setup();
    else if (a === "milestones") body = milestonesPage();
    else if (a === "today") {
      let n = Math.min(4, Math.max(1, +b || 1));
      if (n === 1 && competent()) { setTimeout(() => location.replace("#/plan/today/2"), 0); n = 2; }
      if (n === 4 && !W.submitted && W.evaluated) n = 3;
      body = wizard(n);
    } else body = landing();
    return `<div class="planning" data-planning>${body}</div>`;
  }
  const todayPage = (parts) => `<div class="planning" data-planning>${today(parts)}</div>`;
  const progressPage = () => `<div class="planning" data-planning>${progress()}${proto()}</div>`;

  // ================= behaviour =================
  function bind(root, id, parts) {
    const box = root.querySelector("[data-planning]") || root.querySelector(".page");
    if (!box) return;
    const rr = () => { const a = document.activeElement, key = a && (a.id || (a.dataset && (a.dataset.pl ? `[data-pl="${a.dataset.pl}"][data-v="${a.dataset.v || ""}"]` : null))); SX.render(); if (key) { const el = key.startsWith("[") ? document.querySelector(key) : document.getElementById(key); el && el.focus && el.focus({ preventScroll: true }); } };
    const val = (sel) => { const el = box.querySelector(sel); return el ? el.value : ""; };

    W.tasks.forEach((t) => delete t.fresh);
    if (box.querySelector("[data-sheet]")) box.addEventListener("keydown", (e) => { if (e.key === "Escape") location.hash = "#/"; });

    // inputs: update state without re-rendering (keeps focus); refresh only dependent regions
    box.addEventListener("input", (e) => {
      const t = e.target, d = t.dataset;
      if (d.plIn === "q1") W.q1 = t.value;
      if (d.plIn === "q2") { W.busyText = t.value; const m = t.value.match(/(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})/); W.busy = m ? [{ start: m[1].replace(".", ":").padStart(5, "0"), end: m[2].replace(".", ":").padStart(5, "0") }] : []; if (m) { const lb = t.value.replace(m[0], "").trim(); if (lb) { busyLabels["today-" + W.date] = lb; LS.set("socratix-busy-labels", busyLabels); } } }
      if (d.plIn === "q3") { W.priority = t.value; const b = box.querySelector('[data-pl="to2"]'); if (b) b.disabled = !t.value.trim(); const w = box.querySelector("#to2-why"); if (w) w.textContent = t.value.trim() ? "" : "Add your top priority to continue."; }
      if (d.plIn === "ask") W.ask.q = t.value;
      if (d.plIn === "paste") st.pasteText = t.value;
      if (d.tk) {
        const tk = W.tasks.find((x) => x.id === d.tk); tk[d.f] = d.f === "mins" ? +t.value : t.value; tk.changedSinceReview = true;
        const R = SERVER.rules(W.tasks, W.date, extraBusy());
        W.tasks.forEach((x) => { const h = box.querySelector(`[data-hint="${x.id}"]`); if (h) { h.innerHTML = hintHtml(R.hints[x.id]); SX.icons(); } });
      }
      if (d.dl && st.preview && d.dl.startsWith("pv")) st.preview[+d.dl.slice(2)][d.f] = t.value;
      if (d.msIn !== undefined) {
        const row = st.msEdit.rows[+d.msIn]; row[d.f] = d.f === "hours" ? +t.value : t.value;
        const reg = box.querySelector("[data-ms-rules]"); if (reg) { reg.innerHTML = msRules(deadlineById(st.msDeadline)); }
        if (d.f === "name") { const c = box.querySelector(`[data-ms-tag="${d.msIn}"]`); const cls = SERVER.classify(t.value); if (c && !st.msTags[row.id]) c.innerHTML = cls === "pass" ? tag("ok", "Looks good") : tag("sug", "Suggestion"); }
        SX.icons();
      }
      if (d.plBusy) { const b = db.setup.busy.find((x) => x.id === d.plBusy); if (d.f === "label") { busyLabels[b.id] = t.value; } else b[d.f] = t.value; }
      if (d.plIn === "win-start" || d.plIn === "win-end") {
        const s = val('[data-pl-in="win-start"]'), en = val('[data-pl-in="win-end"]'), bad = toMin(en) <= toMin(s);
        const m = box.querySelector("[data-win-msg]"); if (m) { m.textContent = bad ? "End needs to be after start." : "Tasks are planned inside this window."; m.className = `tiny ${bad ? "warn-t" : "faint"}`; }
        const sb = box.querySelector('[data-pl="save-win"]'); if (sb) sb.disabled = bad;
      }
      if (d.plIn === "del-confirm") { const g = box.querySelector('[data-pl="del-go"]'); if (g) g.disabled = t.value.trim() !== db.student.nickname; }
      if (W.started) saveDraft();
    });
    box.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset.plIn === "ics" && t.files[0]) {
        const text = await t.files[0].text().catch(() => "");
        const evs = [...text.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((m) => m[0]);
        let n = 0;
        evs.forEach((ev) => { const s = ev.match(/DTSTART[^:]*:(\d{8})T(\d{2})(\d{2})/), en = ev.match(/DTEND[^:]*:(\d{8})T(\d{2})(\d{2})/), sum = (ev.match(/SUMMARY:(.*)/) || [])[1];
          if (s && en) { const date = `${s[1].slice(0, 4)}-${s[1].slice(4, 6)}-${s[1].slice(6)}`; const day = wd(date); if (day >= 1 && day <= 5) { db.setup.classes.push({ id: "c" + seq++, day, start: `${s[2]}:${s[3]}`, end: `${en[2]}:${en[3]}`, name: (sum || "Class").trim() }); n++; } } });
        toast(n ? `Added ${n} class${n === 1 ? "" : "es"} from the file (demo). Save to keep them.` : "No weekday classes found in that file.");
        rr();
      }
    });

    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-pl]"); if (!b) return;
      const a = b.dataset.pl, v = b.dataset.v;
      const sel = `[data-pl="${a}"]${v ? `[data-v="${v}"]` : ""}`;
      const busy = async (fn) => { if (b.disabled) return; b.disabled = true; try { await fn(); } catch { netToast(() => document.querySelector(sel)?.click()); } finally { if (b.isConnected) b.disabled = false; } };

      // prototype controls
      if (a === "sim") { st.sim[v] = !st.sim[v]; return rr(); }
      if (a === "path") { db.student.path = v; return rr(); }
      if (a === "clock") { st.now = v; return rr(); }
      if (a === "reset") { LS.del("socratix-plan-draft"); location.reload(); return; }
      if (a === "next-day") { nextDay(); location.hash = "#/"; return rr(); }

      // landing / today
      if (a === "weekly-x") { st.weeklyDismissed = true; return rr(); }
      if (a === "weekly-go") st.weeklyDismissed = true;
      if (a === "plan-tomorrow") { if (!W.closed && W.submitted) toast("Tomorrow's plan starts fresh. Today's check-in is still open."); nextDay(true); location.hash = competent() ? "#/plan/today/2" : "#/plan/today/1"; return; }
      if (a === "sg-skip") { st.suggestion.skipped = true; toast("Skipped for today."); return rr(); }
      if (a === "sg-edit") { st.suggestion.editing = true; return rr(); }
      if (a === "sg-add") {
        const s = F.e4, text = val('[data-pl-in="sg-text"]') || s.text, time = val('[data-pl-in="sg-time"]') || s.time, mins = +(val('[data-pl-in="sg-mins"]') || s.mins);
        const t = { ...blankTask(), id: "t-e4", text, time, mins, link: s.link, added: W.submitted, verdict: { finishable: "yes", scopeOk: true, issue: null, note: "Suggested from your practice.", type: "coding" }, changedSinceReview: false };
        W.tasks.push(t); st.suggestion.editing = false; saveDraft(); toast(W.submitted ? "Added to today's plan (not scored)." : "Added to your draft plan."); return rr();
      }

      // setup: deadlines
      if (a === "setup-tab") { st.setupTab = v; st.readMsg = null; return rr(); }
      if (a === "read") return busy(async () => {
        st.reading = true; rr();
        try { const r = await api(() => SERVER.e1(st.pasteText || "", { date: W.date, elmDown: st.sim.elm }));
          if (r.found) { st.preview = r.items.map((x) => ({ ...x, keep: true })); st.readMsg = null; }
          else { st.preview = null; st.setupTab = "fill"; st.readMsg = "Couldn't read that. Fill it in instead."; }
        } finally { st.reading = false; rr(); }
      });
      if (a === "pv-toggle") { st.preview[+v].keep = !st.preview[+v].keep; return rr(); }
      if (a === "save-all") return busy(async () => { const keep = st.preview.filter((p) => p.keep); await api(() => keep.forEach(upsertDeadline)); st.preview = null; st.pasteText = ""; toast("Saved"); rr(); });
      if (a === "dl-add") { const d = readDl("new"); if (!d.course || !d.item || !d.date) { toast("Fill in course, item and date."); return; } return busy(async () => { await api(() => upsertDeadline(d)); toast("Saved"); rr(); }); }
      if (a === "dl-edit") { st.editDeadline = v; return rr(); }
      if (a === "dl-cancel") { st.editDeadline = null; return rr(); }
      if (a === "dl-save") return busy(async () => { const d = readDl("ed"); await api(() => Object.assign(deadlineById(v), d)); st.editDeadline = null; toast("Saved"); rr(); });
      if (a === "dl-del") return busy(async () => { await api(() => { db.setup.deadlines = db.setup.deadlines.filter((d) => d.id !== v); }); toast("Deleted"); rr(); });
      if (a === "save-win") return busy(async () => { const s = val('[data-pl-in="win-start"]'), en = val('[data-pl-in="win-end"]'); await api(() => { db.setup.window = { start: s, end: en }; db.setup.updated = "Today"; }); toast("Saved"); rr(); });
      if (a === "cls-open") { st.addClass = !st.addClass; return rr(); }
      if (a === "cls-add") { const n = val('[data-pl-in="cls-name"]').trim(); if (!n) { toast("Give the class a name."); return; } db.setup.classes.push({ id: "c" + seq++, day: +val('[data-pl-in="cls-day"]'), start: val('[data-pl-in="cls-start"]'), end: val('[data-pl-in="cls-end"]'), name: n }); st.addClass = false; return rr(); }
      if (a === "cls-del") { db.setup.classes = db.setup.classes.filter((c) => c.id !== v); return rr(); }
      if (a === "save-tt") return busy(async () => { await api(() => { db.setup.updated = "Today"; }); toast("Saved"); });
      if (a === "busy-day") { const [id, d] = v.split(":"); const bb = db.setup.busy.find((x) => x.id === id); bb.days = bb.days.includes(+d) ? bb.days.filter((x) => x !== +d) : [...bb.days, +d]; return rr(); }
      if (a === "busy-add") { db.setup.busy.push({ id: "b" + seq++, days: [1], start: "18:00", end: "19:00" }); return rr(); }
      if (a === "busy-del") { db.setup.busy = db.setup.busy.filter((x) => x.id !== v); delete busyLabels[v]; return rr(); }
      if (a === "save-busy") return busy(async () => { LS.set("socratix-busy-labels", busyLabels); await api(() => { /* server receives days + times only */ db.setup.updated = "Today"; }); toast("Saved"); });

      // milestones
      if (a === "ms-dl") { st.msDeadline = v; st.msEdit = null; return rr(); }
      if (a === "ms-add") { st.msEdit.rows.push({ id: "m" + seq++, deadline: st.msDeadline, name: "", date: "", hours: 2 }); rr(); const ins = box.ownerDocument.querySelectorAll('[data-f="name"][data-ms-in]'); ins[ins.length - 1]?.focus(); return; }
      if (a === "ms-del") { st.msEdit.rows.splice(+v, 1); return rr(); }
      if (a === "ms-sort") { st.msEdit.rows.sort((x, y) => (x.date || "9").localeCompare(y.date || "9")); return rr(); }
      if (a === "ms-own") { st.msTags[v] = true; return rr(); }
      if (a === "ms-redate") { const el = document.querySelector(`[data-ms-in="${v}"][data-f="date"]`); el && (el.focus(), el.showPicker && (() => { try { el.showPicker(); } catch { /* not allowed */ } })()); return; }
      if (a === "ms-save") return busy(async () => { const R = SERVER.milestoneRules(st.msEdit.rows, deadlineById(st.msDeadline)); await api(() => { db.milestones = [...db.milestones.filter((m) => m.deadline !== st.msDeadline), ...st.msEdit.rows.filter((m) => m.name.trim() && m.date)]; }); toast(R.cramming.length ? "Saved, with a cramming warning to look at." : "Saved"); rr(); });

      // wizard step 1
      if (a === "q1-read") return busy(async () => {
        W.reading = true; rr();
        try { const r = await api(() => SERVER.e1(W.q1, { date: W.date, elmDown: st.sim.elm })); W.extracted = r; W.extractEdit = false; W.extractSaved = false; }
        finally { W.reading = false; rr(); }
      });
      if (a === "q1-save") return busy(async () => { await api(() => upsertDeadline(W.extracted.items[0])); W.extractSaved = true; saveDraft(); rr(); });
      if (a === "q1-edit") { W.extractEdit = true; return rr(); }
      if (a === "q1-save-form") { const d = readDl("q1"); if (!d.course || !d.item || !d.date) { toast("Fill in course, item and date."); return; } return busy(async () => { await api(() => upsertDeadline(d)); W.extracted = { found: true, items: [d] }; W.extractEdit = false; W.extractSaved = true; saveDraft(); rr(); }); }
      if (a === "to2") { if (!W.priority.trim()) return; location.hash = "#/plan/today/2"; return; }

      // wizard step 2
      if (a === "tk-add") { W.tasks.push(blankTask()); saveDraft(); rr(); const ins = document.querySelectorAll('[data-f="text"][data-tk]'); ins[ins.length - 1]?.focus(); return; }
      if (a === "tk-del") { W.tasks = W.tasks.filter((t) => t.id !== v); saveDraft(); return rr(); }
      if (a === "where") { W.showWhere = !W.showWhere; return rr(); }
      if (a === "template") { W.template = !W.template; return rr(); }
      if (a === "ask-open") { W.ask.open = true; rr(); document.getElementById("ask")?.focus(); return; }
      if (a === "ask") return busy(async () => {
        if (!W.ask.q.trim()) return;
        W.ask.loading = true; rr();
        try { const r = await api(() => SERVER.e5(W.ask.q, { elmDown: st.sim.elm })); W.ask.answer = r.capped ? "You've used today's questions; try the template." : r.answer; }
        finally { W.ask.loading = false; rr(); }
      });
      if (a === "check") return busy(async () => {
        W.tasks = W.tasks.filter((t) => t.text.trim() || t.time);
        if (!W.tasks.length) { toast("Add at least one task."); return; }
        W.evaluating = true; location.hash = "#/plan/today/3";
        try { await api(() => evaluate()); }
        catch { W.evaluating = false; location.hash = "#/plan/today/2"; throw new Error("net"); }
        W.evaluating = false; saveDraft(); rr();
      });

      // wizard step 3
      if (a === "use-wording") { const t = W.tasks.find((x) => x.id === v); t.text = W.rewrite.text; reviewLocal(t); return rr(); }
      if (a === "split") {
        // two finishable parts instead of one too-big task
        const t = W.tasks.find((x) => x.id === v), i = W.tasks.indexOf(t), part = Math.max(20, Math.round(t.mins));
        const base = t.text.replace(/,?\s*(all questions|the whole thing|everything)/i, "").replace(/[.\s]+$/, ""), low = base.charAt(0).toLowerCase() + base.slice(1);
        const s = toMin(t.time), aT = { ...t, id: t.id + "a", text: `Answer ${low}, Q1–2`, mins: part, fresh: true }, bT = { ...blankTask(), id: t.id + "b", text: `Answer ${low}, Q3–4`, time: fromMin(s + part + 10), mins: part, fresh: true };
        W.tasks.splice(i, 1, aT, bT); reviewLocal(aT); reviewLocal(bT); return rr();
      }
      if (a === "own") { const t = W.tasks.find((x) => x.id === v); t.overridden = true; toast("Your call. Logged, and counted as passed."); return rr(); }
      if (a === "accept") { W.tasks.find((x) => x.id === v).accepted = true; return rr(); }
      if (a === "prio-own") { W.priorityOverride = true; return rr(); }
      if (a === "prio-add") { const t = blankTask(); t.text = W.priority; W.tasks.push(t); location.hash = "#/plan/today/2"; return; }
      if (a === "full") return busy(async () => { await api(() => { W.fullFeedback = true; const r = SERVER.e3(W.tasks, ctx()); if (r) W.tasks.forEach((t) => { if (!t.overridden && !t.accepted) t.verdict = r.verdicts[t.id]; }); }); rr(); });
      if (a === "submit") return busy(async () => {
        W.submitting = true; rr();
        try { await api(() => { const R = SERVER.rules(W.tasks, W.date, extraBusy()); W.quality = SERVER.quality(W, R); W.submitted = true; db.oneOffBusy[W.date] = W.busy.map((x) => ({ ...x })); }); }
        finally { W.submitting = false; }
        LS.del("socratix-plan-draft"); location.hash = "#/plan/today/4";
      });

      // wizard step 4 + Today checklist (optimistic, rollback on error)
      if (a === "link-yes") { W.links[v] = W.tasks.find((t) => t.id === v).verdict.milestoneId; W.linkAsked = true; toast("Linked."); return rr(); }
      if (a === "link-no") { W.linkAsked = true; return rr(); }
      if (a === "tick") { const t = W.tasks.find((x) => x.id === v); const prev = t.status; return optimistic(() => { t.status = prev === "done" ? "planned" : "done"; }, () => { t.status = prev; }); }
      if (a === "move") { W.moving = v; return rr(); }
      if (a === "move-save") { const t = W.tasks.find((x) => x.id === v), to = val('[data-pl-in="move-time"]'); const prev = [t.status, t.movedTo]; W.moving = null; return optimistic(() => { t.status = "moved"; t.movedTo = to; toast(`Moved to ${to}`); }, () => { [t.status, t.movedTo] = prev; }); }
      if (a === "add-open") { W.adding = !W.adding; return rr(); }
      if (a === "add-save") { const text = val('[data-pl-in="add-text"]').trim(); if (!text) { toast("Write the task first."); return; } const t = { ...blankTask(), text, time: val('[data-pl-in="add-time"]'), mins: +val('[data-pl-in="add-mins"]'), added: true }; W.adding = false; return optimistic(() => W.tasks.push(t), () => { W.tasks = W.tasks.filter((x) => x !== t); }); }
      if (a === "ics") return downloadIcs();
      if (a === "offday") { return optimistic(() => { W.offDay = true; }, () => { W.offDay = false; }); }
      if (a === "offday-undo") { return optimistic(() => { W.offDay = false; }, () => { W.offDay = true; }); }

      // evening
      if (a === "took") { const [k, x] = v.split(":"); const C = st.checkin; if (k === "overall") C.overall = x; else C.took[k] = x; return rr(); }
      if (a === "all-planned") { const C = st.checkin; W.tasks.filter((t) => t.status === "done").forEach((t) => (C.took[t.id] = "as_planned")); C.overall = "as_planned"; return rr(); }
      if (a === "ev-save") return busy(async () => { const C = st.checkin; C.saving = true; rr(); try { C.result = await api(() => SERVER.checkin(W, C.took, C.overall)); W.closed = true; } finally { C.saving = false; rr(); } });

      // settings
      if (a === "notify") {
        if (!("Notification" in window)) { toast("This browser doesn't support notifications."); return; }
        try { st.notif = await Notification.requestPermission(); } catch { st.notif = "denied"; }
        toast(st.notif === "granted" ? "Notifications on. Reminders at 08:00 and 20:00." : "Notifications are blocked in your browser settings."); return rr();
      }
      if (a === "rc-show") { st.showRecovery = !st.showRecovery; return rr(); }
      if (a === "rc-copy") { try { await navigator.clipboard.writeText(db.student.recovery); toast("Copied"); } catch { toast("Couldn't copy. Show the code and write it down."); } return; }
      if (a === "del-open") { const dlg = box.querySelector("[data-del-dialog]"); dlg && dlg.showModal && dlg.showModal(); return; }
      if (a === "del-go") { const dlg = box.querySelector("[data-del-dialog]"); dlg && dlg.close(); LS.del("socratix-plan-draft"); LS.del("socratix-busy-labels"); toast("All your plans, ticks and ratings were deleted."); location.hash = "#/login"; return; }
    });

    function ctx() { return { date: W.date, priority: W.priority, allTasks: W.tasks, elmDown: st.sim.elm }; }
    function evaluate() {
      const rulesOnly = W.reviewsUsed >= CFG.MAX_REVIEWS_PER_PLAN;
      const send = W.evaluated ? W.tasks.filter((t) => t.changedSinceReview) : W.tasks;   // Check again sends only changed tasks
      const r = rulesOnly ? null : SERVER.e3(send, ctx());
      send.forEach((t) => {
        t.verdict = r ? r.verdicts[t.id] : rulesOnly ? SERVER.ruleVerdict(t) : { finishable: "unsure", scopeOk: true, issue: "unchecked", note: "", type: SERVER.typeOf(t.text) };
        t.changedSinceReview = false; t.accepted = false;
      });
      if (r) { W.priorityCovered = r.priorityCovered; W.coveredBy = r.coveredBy; }   // ELM down: coverage stays unknown, no cap
      const weakest = W.tasks.find((t) => t.verdict && t.verdict.issue === "not_finishable" && t.verdict.source === "elm");
      W.rewrite = weakest && r ? { taskId: weakest.id, text: SERVER.rewriteOf(weakest) } : W.rewrite && W.tasks.some((t) => t.id === W.rewrite.taskId) ? W.rewrite : null;
      if (!rulesOnly) W.reviewsUsed++;
      W.rulesOnly = W.reviewsUsed >= CFG.MAX_REVIEWS_PER_PLAN && W.evaluated;
      W.evaluated = true;
    }
    // a Step 3 action changed one task: re-check just that task right away (rules + the same mock reviewer)
    function reviewLocal(t) {
      const r = !st.sim.elm && !W.rulesOnly ? SERVER.e3([t], ctx()) : null;
      t.verdict = r ? r.verdicts[t.id] : SERVER.ruleVerdict(t); t.changedSinceReview = false;
      if (r) { const c = SERVER.e3(W.tasks, ctx()); W.priorityCovered = c.priorityCovered; W.coveredBy = c.coveredBy; }
      if (W.rewrite && W.rewrite.taskId === t.id) W.rewrite = null;
      saveDraft();
    }
    async function optimistic(apply, rollback) {
      apply(); rr();
      try { await api(() => null); } catch { rollback(); rr(); netToast(null); }
    }
    function readDl(key) { const g = (f) => (box.querySelector(`[data-dl="${key}"][data-f="${f}"]`) || {}).value || ""; return { course: g("course").trim().toUpperCase(), item: g("item").trim(), date: g("date"), time: g("time") || "23:59" }; }
    function upsertDeadline(d) {
      const ex = db.setup.deadlines.find((x) => x.course.toLowerCase() === d.course.toLowerCase() && x.item.toLowerCase() === d.item.toLowerCase());
      if (ex) Object.assign(ex, { date: d.date, time: d.time }); else db.setup.deadlines.push({ id: "d" + seq++, course: d.course, item: d.item, date: d.date, time: d.time });
    }
    function downloadIcs() {
      const stamp = (date, t) => `${date.replace(/-/g, "")}T${t.replace(":", "")}00`;
      const ev = W.tasks.map((t) => { const s = t.status === "moved" ? t.movedTo : t.time, e = fromMin(toMin(s) + (+t.mins || 30)); return `BEGIN:VEVENT\r\nUID:${t.id}-${W.date}@socratix\r\nDTSTAMP:${stamp(W.date, "00:00")}\r\nDTSTART:${stamp(W.date, s)}\r\nDTEND:${stamp(W.date, e)}\r\nSUMMARY:${t.text.replace(/[,;]/g, "\\$&")}\r\nEND:VEVENT`; }).join("\r\n");
      const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Socratix//Plan//EN\r\n${ev}\r\nEND:VCALENDAR\r\n`], { type: "text/calendar" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `plan-${W.date}.ics`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast("Calendar file downloaded.");
    }
  }

  function nextDay(fromPlanTomorrow) {
    const date = addDays(W.date, 1);
    if (W.submitted && !W.closed && !fromPlanTomorrow) { db.history.push({ date: W.date, completion: W.offDay ? null : Math.round((W.tasks.filter((t) => !t.added && t.status !== "planned").length / Math.max(1, W.tasks.filter((t) => !t.added).length)) * 100) }); db.history = db.history.slice(-14); }
    W = newWizard(date, false); st.checkin = null; st.suggestion = { skipped: false, editing: false }; st.now = "09:30";
    F.today = date; LS.del("socratix-plan-draft");
  }

  // Practice → Planning: an activity_completed with plan_task_id ticks the task
  SX.on && SX.on("activity_completed", (ev) => { const t = W.tasks.find((x) => x.id === ev.plan_task_id); if (t && t.status !== "done") { t.status = "done"; toast(`Plan task "${t.text}" ticked.`); } });
  const planTask = (id) => { const t = W.tasks.find((x) => x.id === id); return t ? { id: t.id, title: t.text } : null; };

  return { meta, render, bind, today: todayPage, progress: progressPage, settingsSection, planTask, _server: SERVER, _db: db };
};
