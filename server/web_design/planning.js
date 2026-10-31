// Socratix — Planning: Today, Plan landing, Setup, Backward planning, the 4-step daily wizard,
// evening check-in, Progress and the planning parts of Settings.
// Behaviour: planning_methodology.md v6 (+ session decisions: rest day, study-time dates); layout: planning_ui.md v2.
// SERVER below simulates the planning API rules; ELM calls (E1–E6) go to our server with a dev token, else rules/templates.
// Copy rule: suggestions, never verdicts — the UI never says fail / wrong / weak / bad / demoted.
window.PlanningModule = (SX) => {
  "use strict";
  const { D, esc, icon, toast, sleep } = SX;
  const F = D.planning;
  const CFG = F.config;
  const ST = window.SXstrategy, ICS = window.SXics;

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

  // ================= simulated SERVER (rules) =================
  const db = {
    student: { ...F.student, recent: [...F.student.recent] },
    setup: JSON.parse(JSON.stringify(F.setup)),
    hasSetup: true,
    milestones: F.milestones.map((m) => ({ ...m })),
    history: F.history.map((h) => ({ ...h, kind: h.completion == null ? "rest" : "normal" })),
    ratings: JSON.parse(JSON.stringify(F.ratings)),
    askLeft: CFG.ASK_PER_DAY - F.askUsed,
    oneOffBusy: {},           // date -> [{start,end}] (times only)
    ics: LS.get("socratix-ics", null), // {events, first, last} from the student's calendar file: stays on this device
  };
  delete db.setup.busyLabelsSeed;
  if (db.ics) db.setup.classes = []; // the real calendar replaces the sample timetable

  const SERVER = (() => {
    // 7.1 free minutes = day window minus the union of class and busy blocks on that date
    function blocksFor(date, extra = []) {
      const d = wd(date), out = [];
      db.setup.classes.filter((c) => c.day === d).forEach((c) => out.push({ start: toMin(c.start), end: toMin(c.end), label: c.name, kind: "class" }));
      db.setup.busy.filter((b) => b.days.includes(d)).forEach((b) => out.push({ start: toMin(b.start), end: toMin(b.end), label: "busy", id: b.id, kind: "busy" }));
      [...(db.oneOffBusy[date] || []), ...extra].forEach((b) => out.push({ start: toMin(b.start), end: toMin(b.end), label: "busy", kind: "busy" }));
      if (db.ics) db.ics.events.filter((e) => e.date === date).forEach((e) => out.push({ start: toMin(e.start), end: toMin(e.end), label: e.status, kind: "ics" }));
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
      bl.forEach((b) => { if (b.start > t) out.push({ start: t, end: b.start, free: true }); if (b.end > t) out.push({ start: Math.max(t, b.start), end: b.end, free: false, label: b.kind === "class" ? b.label : b.label === "tentative" ? "tentative" : "busy" }); t = Math.max(t, b.end); });
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

    function conceptsOf(text) { return ((D.reflection && D.reflection.conceptOf) || []).filter((c) => new RegExp(c.re, "i").test(text)).map((c) => c.concept); }
    // Rules-only verdict (after MAX_REVIEWS or for a quick local re-check)
    function ruleVerdict(t) {
      const cls = classify(t.text);
      return cls === "pass" ? { finishable: "yes", scopeOk: true, issue: null, note: "Has a clear finish line.", type: typeOf(t.text), source: "rules" }
        : { finishable: "no", scopeOk: true, issue: "not_finishable", note: "Add a finish line or a time, e.g. \"for 45 min\".", type: typeOf(t.text), source: "rules" };
      // (concept_ids for rules-only verdicts are added by the caller)
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

    // 7.6 completion / on target / path switch — only at check-in
    function checkin(W, took, overall) {
      const original = W.tasks.filter((t) => !t.added);
      const handled = original.filter((t) => t.status === "done" || t.status === "moved").length;
      const completion = original.length ? handled / original.length : 0;
      const onTarget = W.dayKind === "rest" ? null : (W.quality || 0) >= CFG.QUALITY_MIN && completion >= CFG.COMPLETION_MIN; // rest_over_cap is scored like a normal day
      const before = db.student.path;
      W.tasks.filter((t) => t.status === "done" && took[t.id]).forEach((t) => { const ty = (t.verdict && t.verdict.type) || SERVER.typeOf(t.text); (db.ratings[ty] = db.ratings[ty] || []).push(took[t.id]); });
      let change = null;
      if (onTarget !== null) {
        db.student.recent.push(onTarget); db.student.recent = db.student.recent.slice(-CFG.N_PLANS);
        const n = db.student.recent.filter(Boolean).length;
        if (before === "beginner" && n >= CFG.BEST_OF) { db.student.path = "competent"; change = "unlock"; }
        else if (before === "competent" && db.student.recent.slice(-CFG.STEP_BACK_AFTER).every((x) => x === false)) { db.student.path = "beginner"; change = "stepback"; }
      }
      db.history.push({ date: W.date, completion: W.dayKind === "rest" ? null : Math.round(completion * 100), kind: W.dayKind === "rest" ? "rest" : W.dayKind });
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

    return { blocksFor, freeMinutes, slots, classify, typeOf, TYPE_NAME, dueSoon, conceptsOf, ruleVerdict, rules, quality, milestoneRules, checkin, tendencies };
  })();

  // ================= client state =================
  const st = {
    now: (() => { const n = new Date(); return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`; })(),
    sim: { elm: false, waking: false, net: false, push: false, fresh: false },
    weeklyDismissed: false, fromCheck: [], fromPlanDone: {},
    setupTab: "fill", preview: null, readMsg: null, editDeadline: null,
    msTab: "exam", msDeadline: null, msEdit: null, msTags: {}, msAdd: false, e2: {}, redate: null, skip: null,
    toastAct: null, suggestion: { skipped: false, editing: false }, e4: undefined,
    notif: "default",
  };

  // ================= ELM (through our server; dev token for now) =================
  // Returns the reply, or null → the caller uses its rule/template fallback (v6 §10: the plan is never blocked).
  const TOKEN_KEY = "socratix-elm-token";
  const elmToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
  async function elm(call, payload) {
    if (st.sim.elm || !elmToken()) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(`/api/planning/${call}`, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${elmToken()}` }, body: JSON.stringify(payload) });
      if (!r.ok) return null;
      const j = await r.json();
      return j && !j.fallback ? j : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  // E1: text → deadlines | exam topics | assignment parts. Fallback {found:false} → the student fills the form (v6 §15).
  async function e1(text, mode) {
    if (!String(text).trim()) return { found: false };
    const r = await elm("e1", { text, mode, today: F.today });
    const items = r && Array.isArray(r.items) ? r.items.filter((x) => (mode === "deadlines" ? x.course && x.item && /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") : x.name)) : [];
    return items.length ? { found: true, items: items.map((x) => (mode === "deadlines" ? { ...x, course: String(x.course).toUpperCase(), time: x.time || "23:59" } : x)) } : { found: false };
  }
  // E3 plan review. Returns null when ELM can't answer, so every task shows "Couldn't check this one" (v6 §15).
  const ISSUE = { vague_outcome: "not_finishable", unclear_target: "not_finishable", scope_too_big: "scope_too_big", too_long_split: "scope_too_big" };
  async function e3(tasks, full) {
    const raw = await elm("e3", {
      path: db.student.path, full, top_priority: W.priority,
      due_milestones: SERVER.dueSoon(W.date).map((m) => ({ id: m.id, name: m.name })),
      concepts: [...new Set(((D.reflection && D.reflection.conceptOf) || []).map((c) => c.concept))],
      tasks: tasks.map((t) => ({ id: t.id, text: t.text, minutes: +t.mins, rule_specificity: SERVER.classify(t.text) })),
      other_tasks: W.tasks.filter((t) => !tasks.includes(t)).map((t) => ({ id: t.id, text: t.text })),
    });
    if (!raw || !Array.isArray(raw.tasks)) return null;
    const verdicts = {};
    raw.tasks.forEach((x) => {
      if (!tasks.some((t) => t.id === x.id)) return; // ids must match the input
      const issue = x.finishable === "no" ? "not_finishable" : x.scope_ok === false ? "scope_too_big" : ISSUE[x.issue_code] || null;
      verdicts[x.id] = { finishable: ["yes", "no", "unsure"].includes(x.finishable) ? x.finishable : "unsure", scopeOk: x.scope_ok !== false, issue, note: x.note || "",
        type: SERVER.TYPE_NAME[x.task_type] ? x.task_type : SERVER.typeOf(tasks.find((t) => t.id === x.id).text),
        milestoneId: db.milestones.some((m) => m.id === x.milestone_id) ? x.milestone_id : null, course: x.course || null,
        concept_ids: Array.isArray(x.concept_ids) ? x.concept_ids.filter((c) => c !== "unsure") : [], source: "elm" };
    });
    return { verdicts, priorityCovered: typeof raw.priority_covered === "boolean" ? raw.priority_covered : null, coveredBy: raw.covered_by || null,
      rewrite: raw.rewrite && raw.rewrite.id && raw.rewrite.text ? { taskId: raw.rewrite.id, text: raw.rewrite.text } : null };
  }

  // ================= milestones on study time (strategy.js, v6 §6–§8) =================
  const stCfg = () => ({ ...ST.DEFAULTS, WEEKLY_STUDY_HOURS: +db.setup.weeklyHours || 20, DAILY_STUDY_CAP_MIN: +db.setup.dailyCapMin || 240, BUFFER_MIN: CFG.BUFFER_MIN, MILESTONE_BUFFER_DAYS: CFG.MILESTONE_BUFFER_DAYS });
  const gapsOf = (d) => SERVER.slots(d).filter((x) => x.free).map((x) => [x.start, x.end]);
  const isRestDay = (d) => db.history.some((h) => h.date === d && h.kind === "rest") || (typeof W !== "undefined" && W.date === d && W.dayKind === "rest");
  const studyCap = () => ST.capacity({ gapsOf, isRest: isRestDay, today: F.today, cfg: stCfg() });
  function buildStages(dl) {
    const C = studyCap(), cfg = stCfg();
    const r = dl.kind === "exam"
      ? ST.examPlan({ today: F.today, examDate: dl.date, topics: dl.topics || [], paperMin: dl.paperMin, C, gapsOf, cfg })
      : ST.assignmentPlan({ today: F.today, due: dl.date, subtype: dl.subtype, parts: dl.parts || [], C, cfg });
    return { ...r, milestones: r.milestones.map((m) => ({ id: "m" + seq++, deadline: dl.id, ...m, doneHours: 0, status: "open", redateCount: 0, saved: false })) };
  }
  const msWarnings = (rowsFor = {}) => ST.warnings({ today: F.today, C: studyCap(), cfg: stCfg(),
    deadlines: db.setup.deadlines.map((d) => ({ id: d.id, due: d.date, milestones: rowsFor[d.id] || db.milestones.filter((m) => m.deadline === d.id) })) });
  const newWizard = (date, withFixture) => ({
    date, step: 1, started: false,
    q1: "", extracted: null, extractEdit: false, extractSaved: false,
    busyText: "", busy: [], priority: "",
    tasks: withFixture ? F.tasks.map((t) => ({ ...t, verdict: null, overridden: false, accepted: false, changedSinceReview: false, status: "planned", movedTo: null })) : [blankTask()],
    showWhere: false, template: false, ask: { open: false, q: "", answer: null },
    evaluated: false, evaluating: false, reviewsUsed: 0, rulesOnly: false,
    priorityCovered: null, coveredBy: null, priorityOverride: false, rewrite: null, fullFeedback: false,
    quality: null, submitted: false, dayKind: "normal", restAsked: false, restPlan: null, linkAsked: false, links: {}, closed: false,
  });
  let seq = 10;
  function blankTask() { return { id: "t" + seq++, text: "", time: "", mins: 30, where: "", verdict: null, overridden: false, accepted: false, changedSinceReview: true, status: "planned", movedTo: null }; }
  // in-flight request flags are never part of a draft: a reload mid-request must not leave a button stuck
  const clearInFlight = (d) => { d.evaluating = false; d.submitting = false; d.reading = false; if (d.ask) d.ask.loading = false; return d; };
  let W = (() => { const d = LS.get("socratix-plan-draft", null); return d && d.date === F.today && !d.submitted ? clearInFlight(d) : newWizard(F.today, true); })();
  const saveDraft = () => { if (!W.submitted) LS.set("socratix-plan-draft", clearInFlight(JSON.parse(JSON.stringify(W)))); };
  // the sample deadlines get their v6 template stages once, on the student's real calendar
  if (!db.milestones.length) db.milestones = db.setup.deadlines.filter((d) => d.date >= F.today).flatMap((d) => buildStages(d).milestones.map((m) => ({ ...m, saved: true })));

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
  // Plan pages: setup sits behind the gear (top right), not in a landing card
  const head = (title, desc = "") => `<div class="page-head"><div><h1>${title}</h1><p class="path-line">${pathLine()}</p>${desc ? `<p class="small muted">${desc}</p>` : ""}</div>
    <a class="icon-btn plan-gear" href="#/plan/setup" aria-label="Planning setup" title="Planning setup" data-tour="plan-setup">${icon("settings")}</a></div>`;
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
      </div>
      <div class="row" style="margin-top:10px"><label class="field" style="max-width:320px"><span class="label">ELM dev token</span><input class="input mono" type="password" autocomplete="off" data-pl-in="elm-token" value="${esc(elmToken())}" placeholder="name:token"></label>
        <span class="tiny faint">${elmToken() ? "ELM calls go through the server with this token (this tab only)." : "Without a token the page uses rules and templates only."}</span></div></details>`;
  }

  // ================= §12 Today =================
  function today(parts) {
    if (st.sim.fresh) return `${waking}${todayHead()}${setupFirst()}${proto()}`;
    const done = W.tasks.filter((t) => t.status === "done").length, next = W.tasks.find((t) => t.status === "planned");
    let primary;
    if (W.submitted && afterSix() && !W.closed) primary = `<div class="tcard-main"><div><div class="label-up">This evening</div><h2>How did today go?</h2><p class="small muted">${done} of ${W.tasks.length} done. Look back on each task in Reflection.</p></div><a class="btn btn-primary" href="#/reflection">${icon("moon-star")}Check in</a></div>`;
    else if (W.submitted && W.closed) primary = `<div class="tcard-main"><div><div class="label-up">Today</div><h2>Plan closed</h2><p class="small muted">${W.tasks.length ? `${done} of ${W.tasks.length} done.` : "Rest day."} Tomorrow's plan opens from 18:00.</p></div><a class="btn" href="#/progress">${icon("chart-column")}See progress</a></div>`;
    else if (W.submitted && !W.tasks.length) primary = `<div class="tcard-main"><div><div class="label-up">Today</div><h2>Rest day</h2><p class="small muted">Enjoy it. Tomorrow's plan opens from 18:00.</p></div><button class="btn" type="button" data-pl="rest-undo">${icon("pencil-line")}Plan today after all</button></div>`;
    else if (W.submitted) primary = `<div class="tcard-main"><div><div class="label-up">Next task</div><h2>${next ? esc(next.text) : "All tasks handled"}</h2><p class="small muted mono">${next ? `${next.time} · ${next.mins} min · ` : ""}${done} of ${W.tasks.length} done</p></div><a class="btn btn-primary" href="#/plan/today/4">${icon("list-checks")}Open plan</a></div>`;
    else primary = `<div class="tcard-main"><div><div class="label-up">Today</div><h2>Plan your day</h2><p class="small muted">${competent() ? "Write your tasks and get light feedback. About 2 minutes." : "Four short steps: check-in, tasks, feedback, plan. About 3 minutes."}</p></div><a class="btn btn-primary" href="#/plan/today/${W.started ? W.step : 1}">${icon("pencil-line")}${W.started ? `Continue (step ${W.step})` : "Plan your day"}</a></div>`;
    const e4 = st.e4; // E4: fetched after render on the competent path; null = no card (v6 §15)
    const showSug = competent() && e4 && !st.suggestion.skipped && !W.tasks.some((t) => t.link);
    const targets = (SX.projectTargets && SX.projectTargets(W.date)) || [];
    return `${waking}${todayHead()}
      <div class="today-grid">
        <div class="stack" style="gap:16px">
          ${st.sim.push ? `<section class="panel tcard welcome-card"><div class="tcard-main"><div><div class="label-up">Good to see you</div><h2>Your reminder didn't arrive</h2><p class="small muted">No problem. ${W.submitted ? "Your plan is ready below." : "Plan your day here instead."}</p></div><a class="btn btn-primary" href="${W.submitted ? "#/plan/today/4" : "#/plan/today/1"}">${W.submitted ? "Open plan" : "Plan your day"}</a></div></section>` : ""}
          <section class="panel tcard primary-card" aria-label="Today's plan" data-tour="today-card">${primary}</section>
          ${W.submitted ? `<section class="panel" aria-labelledby="cl-h"><div class="panel-head"><h2 id="cl-h">Checklist</h2><span class="sub">${done} of ${W.tasks.length} done</span></div><div class="panel-body checklist compact">${W.tasks.map((t) => checkRow(t, true)).join("")}</div></section>` : ""}
          ${showSug ? `<section class="panel suggest-card" aria-labelledby="sg-h"><div class="panel-body stack-sm">
            <div class="label-up" id="sg-h">Suggested for you</div>
            ${st.suggestion.editing ? `<div class="sg-edit"><label class="field"><span class="label">Task</span><input class="input" data-pl-in="sg-text" value="${esc(e4.text)}"></label><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-pl-in="sg-time" value="${e4.time}"></label><label class="field"><span class="label">Minutes</span><input class="input mono" type="number" min="5" max="90" data-pl-in="sg-mins" value="${e4.mins}"></label></div>`
              : `<p><b>Suggested:</b> ${esc(e4.text)} · <span class="mono">${e4.mins} min · ${e4.time}</span></p><p class="tiny faint">From your practice: ${esc(e4.concept)} is worth practising.</p>`}
            <div class="row"><button class="btn btn-primary btn-sm" type="button" data-pl="sg-add">${icon("plus")}Add</button>${st.suggestion.editing ? "" : `<button class="btn btn-sm" type="button" data-pl="sg-edit">Edit</button>`}<button class="btn btn-ghost btn-sm" type="button" data-pl="sg-skip">Skip</button></div>
          </div></section>` : ""}
        </div>
        <div class="stack" style="gap:16px">
          <section class="panel" aria-labelledby="dw-h"><div class="panel-head"><h2 id="dw-h">Due this week</h2><a class="btn btn-ghost btn-sm" href="#/plan/milestones">Milestones</a></div>
            <div class="panel-body">${dueList(W.date)}</div></section>
          ${targets.length ? `<section class="panel" aria-labelledby="pt-h"><div class="panel-head"><h2 id="pt-h">Project targets</h2><a class="btn btn-ghost btn-sm" href="#/project">Projects</a></div>
            <div class="panel-body"><ul class="due-list">${targets.map((m) => `<li><span class="due-day mono">${WD[wd(m.date)]}</span><span><b>${esc(m.name)}</b><span class="tiny faint">${esc(m.project)}</span></span></li>`).join("")}</ul></div></section>` : ""}
        </div>
      </div>
      ${proto()}`;
  }
  function todayHead() {
    const h = toMin(st.now) / 60, g = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return `<div class="page-head"><div><h1>${g}</h1><p class="path-line">${fmtLong(W.date)} · ${pathLine()}</p></div></div>`;
  }
  function dueList(date) {
    const ms = SERVER.dueSoon(date).filter((m) => m.status !== "done" && m.status !== "skipped");
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
    const thisWeek = db.milestones.filter((m) => m.status === "open" && m.date >= mondayOf(F.today) && m.date <= addDays(mondayOf(F.today), 6) && m.date >= F.today).length;
    const showWeekly = wd(F.today) === 1 && !st.weeklyDismissed;
    return `${waking}${head("Plan")}
      ${showWeekly ? `<div class="banner info" role="status">${icon("calendar-sync")}<span>Anything new this week? Update your deadlines.</span><a class="btn btn-sm" href="#/plan/milestones" data-pl="weekly-go">Update deadlines</a><button class="icon-btn" type="button" data-pl="weekly-x" aria-label="Dismiss">${icon("x")}</button></div>` : ""}
      <div class="plan-cards two">
        <section class="panel" aria-labelledby="pc1"><div class="panel-head"><h2 id="pc1">Today's plan</h2><span class="sub">${fmtDate(W.date)}</span></div>
          <div class="panel-body stack-sm"><p class="small muted">${W.submitted ? (W.quality != null ? `Saved with quality ${W.quality}/5. ` : "Saved. ") + `${W.tasks.filter((t) => t.status === "done").length} of ${W.tasks.length} done.` : W.started ? `In progress: step ${W.step} of 4.` : "Not planned yet."}</p><div class="row">${btn}${tomorrow}</div></div></section>
        <section class="panel" aria-labelledby="pc2"><div class="panel-head"><h2 id="pc2">Exams & assignments</h2></div>
          <div class="panel-body stack-sm">
            <ul class="dl-list">${upcoming.map((d) => `<li><span>${tag("neutral", d.kind === "exam" ? "Exam" : "Assignment")} ${esc(d.course)} · ${esc(d.item)}</span><span class="mono small">${fmtDate(d.date)}</span></li>`).join("") || `<li class="small faint">No deadlines yet.</li>`}</ul>
            <a class="btn btn-sm" href="#/plan/milestones">${icon("flag")}${thisWeek} milestone${thisWeek === 1 ? "" : "s"} due this week</a></div></section>
      </div>${proto()}`;
  }

  // ================= §5 Setup (behind the gear) =================
  function setup() {
    const S = db.setup, days = [1, 2, 3, 4, 5], I = db.ics;
    const stale = I && I.last && I.last < F.today;
    return `${waking}${head("Setup", "Calendar, day window, study time and busy time. Planning uses them to find your real free time. Each part saves on its own.")}
      <div class="setup-grid">
      <section class="panel span2" aria-labelledby="s3"><div class="panel-head"><h2 id="s3">Calendar</h2><span class="sub">Outlook sync is coming later.</span></div><div class="panel-body stack-sm" style="gap:14px">
        ${I ? `<p class="small" role="status">${icon("calendar-check")} <b>${I.events.length} busy slots</b> from your calendar file, <span class="mono">${fmtDate(I.first)} – ${fmtDate(I.last)}</span>. Titles stay on this device; planning uses the times only.
            <button class="linkish" type="button" data-pl="ics-del">Remove calendar file</button></p>
            ${stale ? `<p class="note">${icon("info")}<span>Your calendar file ends on ${fmtDate(I.last)}. Import a newer one.</span></p>` : ""}`
          : `<p class="small muted">Export your timetable from Outlook (or any calendar) as an <b>.ics</b> file and upload it. Each busy slot appears on its real date.</p>`}
        ${I && !S.classes.length && !st.addClass ? "" : `<div class="tt-grid">${days.map((d) => `<div class="tt-day"><div class="tt-h">${WD[d]}</div>${S.classes.filter((c) => c.day === d).sort((a, b) => a.start.localeCompare(b.start)).map((c) => `<div class="tt-class"><span class="mono tiny">${c.start}–${c.end}</span><span class="small">${esc(c.name)}</span><button class="icon-btn" type="button" data-pl="cls-del" data-v="${c.id}" aria-label="Remove ${esc(c.name)} on ${WDL[d]}">${icon("x")}</button></div>`).join("") || `<span class="tiny faint">No classes</span>`}</div>`).join("")}</div>`}
        ${st.addClass ? `<div class="cls-form"><label class="field"><span class="label">Day</span><select class="select" data-pl-in="cls-day">${days.map((d) => `<option value="${d}">${WDL[d]}</option>`).join("")}</select></label><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-pl-in="cls-start" value="10:00"></label><label class="field"><span class="label">End</span><input class="input mono" type="time" data-pl-in="cls-end" value="11:00"></label><label class="field"><span class="label">Name</span><input class="input" data-pl-in="cls-name" placeholder="e.g. INF2 lecture"></label><button class="btn btn-primary btn-sm" type="button" data-pl="cls-add">Add</button></div>` : ""}
        <div class="row"><label class="btn btn-sm btn-primary file-btn">${icon("upload")}Upload .ics<input type="file" accept=".ics,text/calendar" data-pl-in="ics" class="sr-only"></label>
          <button class="btn btn-sm" type="button" data-pl="cls-open">${icon("plus")}Add a weekly class</button>
          <span style="flex:1"></span><button class="btn btn-sm" type="button" data-pl="save-tt">Save timetable</button></div>
      </div></section>

      <section class="panel" aria-labelledby="s2"><div class="panel-head"><h2 id="s2">Day window</h2></div><div class="panel-body stack-sm">${windowControl("setup")}</div></section>

      <section class="panel" aria-labelledby="s5"><div class="panel-head"><h2 id="s5">Study time</h2></div><div class="panel-body stack-sm">
        <div class="win-row"><label class="field"><span class="label">Hours per week outside classes</span><input class="input mono" type="number" min="1" max="70" step="1" data-pl-in="study-week" value="${S.weeklyHours}"></label>
          <label class="field"><span class="label">Most hours in one day</span><input class="input mono" type="number" min="1" max="12" step="0.5" data-pl-in="study-day" value="${S.dailyCapMin / 60}"></label></div>
        <p class="tiny faint">Milestone dates and warnings use this, capped by your real free time.</p>
        <div><button class="btn btn-sm btn-primary" type="button" data-pl="save-study">Save study time</button></div></div></section>

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

  // ================= v6 §6–§8 Exams & assignments =================
  const REDATE_REASONS = ["Took longer than planned", "Something came up", "Unclear what to do", "Other"];
  const SIZES = [["s", "S"], ["m", "M"], ["l", "L"]], CONF = [["low", "Low"], ["ok", "OK"], ["high", "High"]];
  const SUBTYPES = [["code", "Code"], ["written", "Written"], ["maths", "Maths"]];
  function msState() {
    const list = db.setup.deadlines.filter((d) => d.kind === st.msTab).sort((a, b) => a.date.localeCompare(b.date));
    const dl = list.find((d) => d.id === st.msDeadline) || list[0] || null;
    if (dl && (!st.msEdit || st.msEdit.deadline !== dl.id)) {
      st.msEdit = { deadline: dl.id, rows: db.milestones.filter((m) => m.deadline === dl.id).map((m) => ({ ...m })),
        topics: (dl.topics || []).map((t) => ({ ...t })), parts: (dl.parts || []).map((p) => ({ ...p })), subtype: dl.subtype || "code", papers: dl.papers || 0, paperMin: dl.paperMin || 120, paste: "", notes: [] };
      st.redate = st.skip = null;
    }
    return { list, dl };
  }
  function milestonesPage() {
    if (st.sim.fresh) return `${waking}${head("Exams & assignments")}${setupFirst()}${proto()}`;
    const { list, dl } = msState(), E = st.msEdit, exam = st.msTab === "exam";
    const qs = (dl && st.e2[dl.id]) || F.e2Generic;
    return `${waking}${head("Exams & assignments", "Socratix sets out the stages and places the dates in your real study time. You decide: rename, re-date, add or skip.")}
      <div class="tabs" role="tablist" aria-label="Deadline type">${[["exam", "Exams"], ["assignment", "Assignments"]].map(([k, l]) => `<button role="tab" type="button" data-pl="ms-tab" data-v="${k}" aria-selected="${st.msTab === k}">${l}</button>`).join("")}</div>
      <div class="chips-row" role="group" aria-label="${exam ? "Exams" : "Assignments"}">${list.map((d) => `<button type="button" class="qchip" data-pl="ms-dl" data-v="${d.id}" aria-pressed="${dl && d.id === dl.id}">${esc(d.course)} · ${esc(d.item)} <span class="mono">${fmtDate(d.date)}</span></button>`).join("")}
        <button type="button" class="qchip" data-pl="ms-add" aria-expanded="${st.msAdd}">${icon("plus")}Add ${exam ? "an exam" : "an assignment"}</button></div>
      ${st.msAdd ? addDeadlinePanel(exam) : ""}
      ${dl ? `<div class="ms-layout">
        <div class="stack" style="gap:16px">
          <section class="panel" aria-labelledby="in-h"><div class="panel-head"><h2 id="in-h">${esc(dl.course)} · ${esc(dl.item)}</h2><span class="sub mono">due ${fmtDate(dl.date)}, ${dl.time}</span></div>
            <div class="panel-body stack-sm" style="gap:14px">${exam ? examInputs(E) : assignInputs(E)}
              <div class="row"><button class="btn btn-primary btn-sm" type="button" data-pl="ms-build">${icon("wand-sparkles")}${E.rows.length ? "Rebuild stages" : "Build stages"}</button>
                <span class="tiny faint">${E.rows.length ? "Rebuilding replaces the dates and hours below." : "Stages come from the template; dates come from your free time."}</span>
                <span style="flex:1"></span><button class="btn btn-sm btn-ghost" type="button" data-pl="dl-del" data-v="${dl.id}">${icon("trash-2")}Delete deadline</button></div></div></section>
          <section class="panel" aria-labelledby="ms-h"><div class="panel-head"><h2 id="ms-h">Milestones</h2><span class="sub">${exam ? "Test yourself, space it, simulate it" : "Understand, build small, check early"}</span></div>
            <div class="panel-body stack-sm" style="gap:14px">
              ${ST.diffDays(F.today, dl.date) < CFG.MILESTONES_OPTIONAL_UNDER_DAYS ? `<p class="note">${icon("info")}<span>Under 7 days away: milestones are optional${exam ? ", so this is the short version" : ""}.</span></p>` : ""}
              ${E.notes.map((n) => `<p class="note">${icon("info")}<span>${esc(n.text)}</span></p>`).join("")}
              <div class="table-wrap"><table class="data ms-table"><thead><tr><th>Stage</th><th>Target date</th><th>Est. hours</th><th>Progress</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>${E.rows.map((m, k) => msRow(m, k)).join("") || `<tr><td colspan="5" class="small faint">No milestones yet. ${exam ? "Add topics" : "Add parts"}, then press <b>Build stages</b>.</td></tr>`}</tbody></table></div>
              <div class="row"><button class="btn btn-sm" type="button" data-pl="ms-row-add">${icon("plus")}Add milestone</button><span style="flex:1"></span><button class="btn btn-primary btn-sm" type="button" data-pl="ms-save">${icon("check")}Save milestones</button></div>
            </div></section>
        </div>
        <div class="stack" style="gap:16px">
          <section class="think" aria-labelledby="th-h"><div class="label-up" id="th-h">Think about</div><ol>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></section>
          <div data-ms-rules>${msRules(dl)}</div>
        </div>
      </div>` : `<section class="panel"><div class="empty">${icon("flag")}<h2>No ${exam ? "exams" : "assignments"} yet</h2><p class="small">Add one to get dated stages that fit your free time.</p><button class="btn btn-primary" type="button" data-pl="ms-add">${icon("plus")}Add ${exam ? "an exam" : "an assignment"}</button></div></section>`}
      ${proto()}`;
  }
  function addDeadlinePanel(exam) {
    return `<section class="panel" aria-labelledby="add-h"><div class="panel-head"><h2 id="add-h">New ${exam ? "exam" : "assignment"}</h2></div><div class="panel-body stack-sm" style="gap:14px">
      <div class="tabs" role="tablist" aria-label="How to add">${[["fill", "Fill in"], ["paste", "Paste text"]].map(([k, l]) => `<button role="tab" type="button" data-pl="setup-tab" data-v="${k}" aria-selected="${st.setupTab === k}">${l}</button>`).join("")}</div>
      ${st.readMsg ? `<p class="note" role="status">${icon("info")}<span>${st.readMsg}</span></p>` : ""}
      ${st.setupTab === "fill" ? `<div class="dl-form">${deadlineFields({ course: "", item: "", date: "", time: "" }, "new")}${exam ? "" : `<label class="field"><span class="label">Type</span><select class="select" data-pl-in="new-subtype">${SUBTYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>`}<button class="btn btn-primary" type="button" data-pl="dl-add">${icon("plus")}Add</button></div>`
        : `<div class="field"><label for="paste">Paste anything: an email, a course page, your own notes</label><textarea class="textarea" id="paste" rows="4" data-pl-in="paste" placeholder="e.g. cw2 for inf2 moved to thursday 2pm">${esc(st.pasteText || "")}</textarea></div>
           <div><button class="btn btn-primary" type="button" data-pl="read" ${st.reading ? "disabled" : ""}>${st.reading ? "Reading…" : `${icon("scan-text")}Read it`}</button></div>
           ${st.preview ? `<div class="preview" aria-label="Found deadlines"><div class="label-up">Found · nothing is saved yet</div>
             ${st.preview.map((p, k) => `<div class="pv-row ${p.keep ? "" : "removed"}">${deadlineFields(p, "pv" + k)}<span class="ptag neutral">${p.kind === "exam" ? "Exam" : "Assignment"}</span><button class="btn btn-sm" type="button" data-pl="pv-toggle" data-v="${k}" aria-pressed="${p.keep}">${p.keep ? "Remove" : "Keep"}</button></div>`).join("")}
             <div class="row"><button class="btn btn-primary btn-sm" type="button" data-pl="save-all" ${st.preview.some((p) => p.keep) ? "" : "disabled"}>${icon("check")}Save all</button><span class="tiny faint">${st.preview.filter((p) => p.keep).length} to save</span></div></div>` : ""}`}
    </div></section>`;
  }
  const seg = (name, k, opts, cur) => `<div class="seg seg-sm" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" data-pl="ms-set" data-v="${k}|${v}" aria-pressed="${cur === v}">${l}</button>`).join("")}</div>`;
  function pasteBox(label, ph) {
    return `<div class="field"><label for="ms-paste">${label}</label><textarea class="textarea" id="ms-paste" rows="3" data-pl-in="ms-paste" placeholder="${ph}">${esc(st.msEdit.paste)}</textarea></div>
      <div class="row"><button class="btn btn-sm" type="button" data-pl="ms-find" ${st.finding ? "disabled" : ""}>${st.finding ? "Reading…" : `${icon("scan-text")}Find them`}</button><span class="tiny faint">${icon("shield")} This text is sent to ELM to find the list. You check it before anything is used.</span></div>`;
  }
  function examInputs(E) {
    return `<div class="label-up">Topics and confidence</div>
      <ul class="in-list">${E.topics.map((t, k) => `<li><input class="input" aria-label="Topic" data-ms-topic="${k}" value="${esc(t.name)}">${seg("Confidence", `topic:${k}`, CONF, t.confidence)}<button class="icon-btn" type="button" data-pl="ms-topic-del" data-v="${k}" aria-label="Remove topic">${icon("x")}</button></li>`).join("") || `<li class="small faint">No topics yet.</li>`}</ul>
      <div><button class="btn btn-sm btn-ghost" type="button" data-pl="ms-topic-add">${icon("plus")}Add topic</button></div>
      ${pasteBox("Or paste the syllabus or topic list", "e.g. Week 1 matrices, week 2 vectors …")}
      <div class="win-row"><label class="field"><span class="label">Past papers available</span><input class="input mono" type="number" min="0" max="20" data-ms-num="papers" value="${E.papers}"></label>
        <label class="field"><span class="label">Paper length (minutes)</span><input class="input mono" type="number" min="30" max="240" step="10" data-ms-num="paperMin" value="${E.paperMin}"></label></div>`;
  }
  function assignInputs(E) {
    return `<div class="label-up">Type</div>${seg("Type", "subtype", SUBTYPES, E.subtype)}
      <div class="label-up">Parts and size</div>
      <ul class="in-list">${E.parts.map((p, k) => `<li><input class="input" aria-label="Part" data-ms-part="${k}" value="${esc(p.name)}">${seg("Size", `part:${k}`, SIZES, p.size)}<button class="icon-btn" type="button" data-pl="ms-part-del" data-v="${k}" aria-label="Remove part">${icon("x")}</button></li>`).join("") || `<li class="small faint">No parts yet.</li>`}</ul>
      <div class="row"><button class="btn btn-sm btn-ghost" type="button" data-pl="ms-part-add">${icon("plus")}Add part</button><span class="tiny faint">Size: S about 1 h, M about 3 h, L about 6 h.</span></div>
      ${pasteBox("Or paste the brief", "e.g. Task 1: parser … Task 2: report …")}`;
  }
  function msRow(m, k) {
    const overdue = m.status === "open" && m.date && m.date < F.today;
    const done = m.status === "done", skipped = m.status === "skipped";
    const reached = m.status === "open" && m.hours > 0 && m.doneHours >= m.hours;
    let dateCell;
    if (st.redate && st.redate.k === k) dateCell = `<div class="stack-sm"><input class="input mono" type="date" aria-label="New date" data-pl-in="redate-date" value="${m.date}"><div class="tchips" role="group" aria-label="Reason">${REDATE_REASONS.map((r) => `<button type="button" class="tchip" data-pl="redate-reason" data-v="${r}" aria-pressed="${st.redate.reason === r}">${r}</button>`).join("")}</div>
        <div class="row"><button class="btn btn-sm btn-primary" type="button" data-pl="redate-save" data-v="${k}" ${st.redate.reason ? "" : "disabled"}>Re-date</button><button class="btn btn-sm btn-ghost" type="button" data-pl="redate-x">Cancel</button></div></div>`;
    else if (m.saved) dateCell = `<span class="mono small">${fmtDate(m.date)}</span>${overdue ? ` ${tag("neutral", "Overdue")}` : ""}${!done && !skipped ? ` <button class="linkish" type="button" data-pl="redate" data-v="${k}">Re-date</button>` : ""}`;
    else dateCell = `<input class="input mono" type="date" aria-label="Target date" data-ms-in="${k}" data-f="date" value="${m.date}">`;
    return `<tr data-ms="${k}" class="${done || skipped ? "is-done" : ""}">
      <td><input class="input" aria-label="Stage name" data-ms-in="${k}" data-f="name" value="${esc(m.name)}"><div class="tiny faint ms-note">${esc(m.done || "")}</div>
        ${skipped ? `<div class="tiny faint">Skipped: ${esc(m.skipReason || "")}</div>` : st.skip && st.skip.k === k ? `<div class="row nowrap" style="margin-top:4px"><input class="input" aria-label="One-word reason" data-pl-in="skip-reason" placeholder="Reason, one word"><button class="btn btn-sm" type="button" data-pl="skip-save" data-v="${k}">Skip</button></div>` : ""}</td>
      <td>${dateCell}</td>
      <td><input class="input mono hrs" type="number" min="0" step="0.5" aria-label="Estimated hours" data-ms-in="${k}" data-f="hours" value="${m.hours}"></td>
      <td><span class="mono small">${r1(m.doneHours || 0)} / ${m.hours} h</span>${reached ? `<div class="tiny">${tag("ok", "Mark done?")}</div>` : ""}</td>
      <td class="row nowrap"><button class="tick sm" type="button" data-pl="ms-done" data-v="${k}" aria-pressed="${done}" aria-label="${done ? "Done" : "Mark done"}: ${esc(m.name)}">${done ? icon("check") : ""}</button>
        ${!done && !skipped && !(st.skip && st.skip.k === k) ? `<button class="btn btn-sm btn-ghost" type="button" data-pl="skip" data-v="${k}">Skip</button>` : ""}
        ${m.saved ? "" : `<button class="icon-btn" type="button" data-pl="ms-del" data-v="${k}" aria-label="Delete milestone">${icon("trash-2")}</button>`}</td></tr>`;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  function msRules(dl) {
    const R = msWarnings({ [dl.id]: st.msEdit.rows });
    const max = Math.max(1, ...R.weeks.map((w) => Math.max(w.planned, w.study)));
    const panels = [];
    if (R.buffer.some((b) => b.deadline === dl.id)) panels.push(`<div class="rule-panel">${tag("warn", "Buffer")}<span>Leave at least 2 days before the deadline. Name the step before submitting, e.g. "Final draft checked".</span></div>`);
    R.cramming.forEach((c) => panels.push(`<div class="rule-panel">${tag("warn", "Cramming")}<span>Week of ${fmtDate(c.week).slice(4)}: ${c.planned} h planned, ${c.study} h of study time. Spread it out?</span></div>`));
    R.atRisk.forEach((x) => panels.push(`<div class="rule-panel">${tag("warn", "At risk")}<span>Behind on "${esc(x.name)}": about ${x.left} h left, ${x.free} h before ${WD[wd(x.date)]}. Plan time or re-date?</span></div>`));
    return `${panels.join("") || `<div class="rule-panel ok">${tag("ok", "Looks good")}<span>Dates leave room before the deadline and every week fits your study time.</span></div>`}
      <section class="panel weeks" aria-labelledby="wk-h"><div class="panel-head"><h3 id="wk-h">Hours per week</h3><span class="sub">planned vs study time</span></div>
        <div class="panel-body"><ul class="wk-bars">${R.weeks.map((w) => `<li title="Week of ${fmtDate(w.week).slice(4)}: ${w.planned} h planned, ${w.study} h of study time">
          <span class="wk-l mono small">${fmtDate(w.week).slice(4)}</span>
          <span class="wk-track"><span class="wk-fill ${w.planned > w.study ? "over" : ""}" style="width:${(w.planned / max) * 100}%"></span><span class="wk-cap" style="left:${(w.study / max) * 100}%" aria-hidden="true"></span></span>
          <span class="wk-v small"><b>${w.planned} h</b> <span class="faint">/ ${w.study} h</span>${w.planned > w.study ? ` ${tag("warn", "Over")}` : ""}</span></li>`).join("")}</ul>
          <p class="tiny faint">Bar: milestone hours that week, all deadlines (spread over your study time up to each date). Line: your study time (weekly hours, capped by real free time from your calendar).</p></div></section>`;
  }

  // ================= §7–§10 daily wizard =================
  const STEPS = ["Today's check-in", "Write your tasks", "Feedback", "Today's plan"];
  function stepper(n) {
    return `<ol class="stepper" aria-label="Plan steps">${STEPS.map((s, k) => `<li ${k + 1 === n ? 'aria-current="step"' : ""} class="${k + 1 < n || (W.submitted && k < 3) ? "done" : ""} ${competent() && k === 0 ? "skipped" : ""}"><span class="sn">${k + 1 < n ? icon("check") : k + 1}</span><span class="sl-t">${s}</span></li>`).join("")}</ol>`;
  }
  function wizard(n) {
    if (st.sim.fresh) return `${waking}${head("Plan today")}${setupFirst()}${proto()}`;
    if (!SX.touring) { W.started = true; W.step = n; saveDraft(); }
    const body = !W.restAsked && !W.submitted && !SX.touring ? restCard() : n === 1 ? step1() : n === 2 ? step2() : n === 3 ? step3() : step4();
    return `${waking}${head(W.date === F.today ? "Plan today" : `Plan ${fmtDate(W.date)}`)}${stepper(n)}<div class="wiz" data-step="${n}">${body}</div>${proto()}`;
  }
  const stepLabel = (n, t, right = "") => `<div class="step-label"><span class="label-up">Step ${n} of 4 · ${t}</span>${right ? `<span class="small muted">${right}</span>` : ""}</div>`;

  // Session decision: ask about a rest day before planning. A rest day isn't scored and isn't a miss, and the UI never says so.
  function restCard() {
    const P = W.restPlan;
    return `<div class="step-label"><span class="label-up">Before you start</span></div>
      ${slotStrip()}
      <section class="panel"><div class="panel-body stack-sm" style="gap:14px">
        <h2 class="q-l" id="rest-q">Do you have a rest day today?</h2>
        ${!P ? `<div class="row" role="group" aria-labelledby="rest-q"><button class="btn btn-primary" type="button" data-pl="rest-yes" ${W.restLoading ? "disabled" : ""}>${W.restLoading ? "One moment…" : "Yes"}</button><button class="btn" type="button" data-pl="rest-no">No</button></div>`
          : `<p class="small muted">Here is a light plan, if you'd like one.</p>
            ${P.length ? `<div class="checklist">${P.map((t) => `<div class="crow"><span class="mono small ct-time">${t.time}</span><span class="ct-text"><span class="ct-name">${esc(t.text)}</span></span><span class="mono tiny faint">${t.mins} min</span></div>`).join("")}</div>` : `<p class="small faint">Nothing to suggest today.</p>`}
            <div class="row">${P.length ? `<button class="btn btn-primary btn-sm" type="button" data-pl="rest-use">Use this plan</button><button class="btn btn-sm" type="button" data-pl="rest-edit">Edit</button>` : ""}<button class="btn btn-sm btn-ghost" type="button" data-pl="rest-none">No plan today</button></div>`}
      </div></section>`;
  }
  function restPlanRules() {
    // fallback: one 20-minute task for the nearest open milestone, in the first free slot after now
    const m = db.milestones.filter((x) => x.status === "open" && x.date >= W.date && x.hours > 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!m) return [];
    const dl = deadlineById(m.deadline), now = W.date === F.today ? toMin(st.now) : 0;
    const slot = SERVER.slots(W.date).find((x) => x.free && Math.max(x.start, now) + 20 <= x.end);
    return slot ? [{ text: `${m.name} (${dl ? dl.course : ""}) for 20 min`, time: fromMin(Math.ceil(Math.max(slot.start, now) / 5) * 5), mins: 20, milestoneId: m.id }] : [];
  }
  function restWeekCount() { return db.history.filter((h) => h.kind === "rest" && mondayOf(h.date) === mondayOf(W.date) && h.date !== W.date).length; }

  function step1() {
    const ex = W.extracted;
    const targets = ((SX.projectTargets && SX.projectTargets(W.date)) || []).map((m) => `<b>${esc(m.name)}</b> <span class="faint">(${WD[wd(m.date)]}, project)</span>`);
    return `${stepLabel(1, "Today's check-in", "About 20 seconds")}
      ${slotStrip()}
      <section class="panel"><div class="panel-body stack" style="gap:22px">
        <div class="q"><label for="q1" class="q-l"><span class="qn">1</span>Anything new due or changed?</label>
          <div class="row nowrap"><input class="input" id="q1" data-pl-in="q1" value="${esc(W.q1)}" placeholder="e.g. cw2 for inf2 moved to thursday 2pm"><button class="btn" type="button" data-pl="q1-read" ${W.reading ? "disabled" : ""}>${W.reading ? "Reading…" : "Read it"}</button></div>
          ${ex && ex.found && !W.extractEdit ? `<div class="found" role="status"><span class="label-up">Found</span><span class="mono">${esc(ex.items[0].course)} · ${esc(ex.items[0].item)} · ${fmtDate(ex.items[0].date)}, ${ex.items[0].time}</span>
            <span class="row">${W.extractSaved ? `<span class="ptag ok">${icon("check")}Saved</span>` : `<button class="btn btn-sm btn-primary" type="button" data-pl="q1-save">Save</button><button class="btn btn-sm" type="button" data-pl="q1-edit">Edit</button>`}</span></div>` : ""}
          ${(ex && !ex.found) || W.extractEdit ? `<div class="found edit">${ex && !ex.found ? `<p class="small muted">Couldn't read that. Fill it in instead.</p>` : ""}${deadlineFields(ex && ex.found ? ex.items[0] : { course: "", item: "", date: "", time: "" }, "q1")}<div><button class="btn btn-sm btn-primary" type="button" data-pl="q1-save-form">Save</button></div></div>` : ""}
          <div class="due-inline small"><span class="faint">Due this week:</span> ${[...SERVER.dueSoon(W.date).filter((m) => m.status === "open").map((m) => `<b>${esc(m.name)}</b> <span class="faint">(${WD[wd(m.date)]})</span>`), ...targets].join(" · ") || "nothing"}</div>
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
    const sl = SERVER.slots(W.date, extraBusy()), I = db.ics;
    const stale = I && I.last && I.last < W.date ? `<p class="note">${icon("info")}<span>Your calendar file ends on ${fmtDate(I.last)}. <a href="#/plan/setup">Import a newer one</a>.</span></p>` : "";
    const none = !I && !db.setup.classes.length ? `<p class="note">${icon("info")}<span>No timetable yet. <a href="#/plan/setup">Upload your .ics</a> so your classes show here.</span></p>` : "";
    return `${stale}${none}<div class="slots"><span class="small">Your day, <b>${fmtDate(W.date)}</b>: <span class="mono">${db.setup.window.start}–${db.setup.window.end}</span>. Free slots:</span>
      ${sl.map((s) => `<span class="slot ${s.free ? "free" : "busy"}">${fromMin(s.start)}–${fromMin(s.end)}${s.free ? "" : ` ${esc(s.label === "busy" ? "busy" : s.label === "tentative" ? "tentative" : `${s.label} · busy`)}`}</span>`).join("")}</div>`;
  }
  // v6 §8.4: the next open stage of each deadline becomes a suggested task (rules only, no ELM)
  function planTargets() {
    const now = W.date === F.today ? toMin(st.now) : 0, taken = new Set(W.tasks.map((t) => t.milestoneId).filter(Boolean));
    return db.setup.deadlines.filter((d) => d.date >= W.date).map((d) => {
      const m = db.milestones.filter((x) => x.deadline === d.id && x.status === "open" && x.hours > 0 && x.date >= W.date).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!m || taken.has(m.id) || st.fromPlanDone[W.date + m.id]) return null;
      const mins = Math.max(25, Math.min(45, Math.round((m.hours - (m.doneHours || 0)) * 60)));
      const slot = SERVER.slots(W.date, extraBusy()).find((x) => x.free && Math.max(x.start, now) + mins <= x.end);
      return slot ? { id: m.id, text: `${m.name} (${d.course} ${d.item}) for ${mins} min`, mins, time: fromMin(Math.ceil(Math.max(slot.start, now) / 5) * 5), due: m.date } : null;
    }).filter(Boolean).slice(0, 2);
  }
  function step2() {
    const R = SERVER.rules(W.tasks, W.date, extraBusy());
    return `${stepLabel(2, "Write your tasks")}
      ${slotStrip()}
      ${checkSuggestions()}
      <section class="panel"><div class="panel-body stack-sm" style="gap:12px">
        <div class="table-wrap task-wrap" data-tour="task-table"><table class="task-table"><thead><tr><th>What exactly</th><th>When</th><th>How long</th>${W.showWhere ? "<th>Where</th>" : ""}<th><span class="sr-only">Delete</span></th></tr></thead>
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
  function checkSuggestions() {
    const list = st.fromCheck.filter((x) => x.date === W.date && !x.done), pt = planTargets();
    const fromPlan = pt.length ? `<section class="panel from-check" aria-labelledby="fp-h"><div class="panel-body stack-sm">
      <div class="label-up" id="fp-h">From your exam & assignment plans</div>
      ${pt.map((x) => `<div class="fc-row"><div><b>${esc(x.text)}</b> <span class="mono small faint">· ${x.time}</span><div class="tiny faint">Stage due ${fmtDate(x.due)}</div></div>
        <div class="row"><button class="btn btn-sm btn-primary" type="button" data-pl="fp-accept" data-v="${x.id}">Accept</button><button class="btn btn-sm btn-ghost" type="button" data-pl="fp-skip" data-v="${x.id}">Skip</button></div></div>`).join("")}</div></section>` : "";
    if (!list.length) return fromPlan;
    return `${fromPlan}<section class="panel from-check" aria-labelledby="fc-h"><div class="panel-body stack-sm">
      <div class="label-up" id="fc-h">Suggested from last night's check</div>
      ${list.map((x) => `<div class="fc-row">${x.editing ? `<div class="sg-edit"><label class="field"><span class="label">Task</span><input class="input" data-fc="${x.id}" data-f="text" value="${esc(x.text)}"></label><label class="field"><span class="label">Start</span><input class="input mono" type="time" data-fc="${x.id}" data-f="time" value="${x.time}"></label><label class="field"><span class="label">Minutes</span><input class="input mono" type="number" min="5" max="90" data-fc="${x.id}" data-f="mins" value="${x.mins}"></label></div>`
        : `<div><b>${esc(x.text)}</b> <span class="mono small faint">· ${x.mins} min · ${x.time}</span><div class="tiny faint">${esc(x.concept)}: ${esc(x.why)}</div></div>`}
        <div class="row"><button class="btn btn-sm btn-primary" type="button" data-pl="fc-accept" data-v="${x.id}">Accept</button>${x.editing ? "" : `<button class="btn btn-sm" type="button" data-pl="fc-edit" data-v="${x.id}">Edit</button>`}<button class="btn btn-sm btn-ghost" type="button" data-pl="fc-skip" data-v="${x.id}">Skip</button></div></div>`).join("")}
    </div></section>`;
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
      <section class="panel"><div class="panel-body checklist">${W.tasks.map((t) => checkRow(t, false)).join("")}</div>
        ${W.adding ? `<div class="add-form"><label class="field"><span class="label">Task</span><input class="input" data-pl-in="add-text" placeholder="e.g. Email tutor about CW2"></label><label class="field"><span class="label">When</span><input class="input mono" type="time" data-pl-in="add-time" value="19:00"></label><label class="field"><span class="label">Minutes</span><input class="input mono" type="number" min="5" max="90" data-pl-in="add-mins" value="20"></label><button class="btn btn-sm btn-primary" type="button" data-pl="add-save">Add</button></div>` : ""}
        <div class="panel-foot"><button class="btn btn-sm" type="button" data-pl="add-open">${icon("plus")}Add task (not scored)</button>
          <button class="btn btn-sm" type="button" data-pl="ics">${icon("calendar-plus")}Add to calendar (.ics)</button>
          <span style="flex:1"></span><span class="tiny faint">After submitting you can tick, move or add.</span></div></section>
      <div class="wiz-foot"><a class="btn" href="#/">${icon("house")}Today</a>${afterSix() ? `<a class="btn btn-primary" href="#/reflection">${icon("moon-star")}Reflect on today</a>` : `<span class="tiny faint">Reflection is best in the evening (from 18:00).</span>`}</div>`;
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

  // ================= §13 Progress =================
  function progress() {
    const n = onTargetCount(), hist = db.history.slice(-14);
    const done = hist.filter((h) => h.completion != null);
    const avg = done.length ? Math.round(done.reduce((s, h) => s + h.completion, 0) / done.length) : 0;
    return `<div class="page-head"><div><h1>Progress</h1><p class="small muted">Planning · your own history only, no comparison with others.</p></div></div>
      <div class="prog-grid">
        <section class="panel" aria-labelledby="pg1" data-tour="progress-summary"><div class="panel-head"><h2 id="pg1">Plans on target</h2><span class="sub">${competent() ? "Competent path" : "Beginner path"}</span></div>
          <div class="panel-body stack-sm"><div class="big-stat"><b>${n} of ${CFG.N_PLANS}</b> <span class="small muted">plans on target</span></div>
            <div class="seg-bar" role="img" aria-label="${n} of ${CFG.N_PLANS} recent plans on target">${db.student.recent.map((x) => `<span class="${x ? "on" : ""}"></span>`).join("")}</div>
            <p class="small muted">${competent() ? "You get lighter feedback. Detailed feedback comes back if 3 plans in a row miss the target." : `${Math.max(0, CFG.BEST_OF - n)} more on-target plan${CFG.BEST_OF - n === 1 ? "" : "s"} in your last 5 unlocks lighter feedback.`}</p></div></section>
        <section class="panel span2" aria-labelledby="pg2"><div class="panel-head"><h2 id="pg2">Last 14 days</h2><span class="sub">completion per day</span></div>
          <div class="panel-body">
            <div class="hbars" role="img" aria-labelledby="pg2 bars-sum">
              <div class="hb-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
              <div class="hb-plot">${hist.map((h) => { const d = toDate(h.date).getUTCDate();
                return h.completion == null
                  ? `<div class="hb-col" title="${fmtDate(h.date)}: rest day"><span class="hb-off">Rest day</span><span class="hb-x">${d}</span></div>`
                  : `<div class="hb-col" title="${fmtDate(h.date)}: ${h.completion}% handled"><span class="hb-bar" style="--h:${h.completion}%"></span><span class="hb-x">${d}</span></div>`; }).join("")}</div>
            </div>
            <p class="small muted" id="bars-sum">${done.length} planned days, ${hist.length - done.length} rest day${hist.length - done.length === 1 ? "" : "s"}. On average ${avg}% of tasks were handled; the best day was ${Math.max(...done.map((h) => h.completion))}%.</p>
            <details class="small"><summary>Show as a table</summary><table class="data"><thead><tr><th>Day</th><th>Completion</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${fmtDate(h.date)}</td><td>${h.completion == null ? "Rest day" : `${h.completion}%`}</td></tr>`).join("")}</tbody></table></details>
          </div></section>
        ${reflectionProgress()}
        <section class="panel" aria-labelledby="pg3"><div class="panel-head"><h2 id="pg3">Time estimates by task type</h2></div>
          <div class="panel-body"><p class="small">${SERVER.tendencies().join(" ") || "Not enough ratings yet (3 per type)."}</p><p class="tiny faint">Only types with at least 3 ratings in the last 14 days.</p></div></section>
      </div>`;
  }

  // demo_features_spec §3.7: reflection as a skill (private)
  function reflectionProgress() {
    const R = D.reflection; if (!R) return "";
    const tr = R.depthTrend.slice(-12), c = R.calibration, pct = c.total ? Math.round((c.matched / c.total) * 100) : 0;
    const LBL = ["", "Describes", "Explains", "Plans"];
    const last = tr.slice(-5), mode = [3, 2, 1].find((d) => last.filter((x) => x === d).length >= 3) || last[last.length - 1];
    return `<section class="panel" aria-labelledby="pg4"><div class="panel-head"><h2 id="pg4">Reflection depth</h2><span class="sub">private to you</span></div>
      <div class="panel-body stack-sm">
        <div class="depth-bars" role="img" aria-label="Depth of your last ${tr.length} reflections, 1 to 3">${tr.map((d, k) => `<span class="d${d}" style="--h:${(d / 3) * 100}%" title="Reflection ${k + 1}: ${LBL[d]}"></span>`).join("")}</div>
        <div class="depth-legend tiny faint"><span>1 Describes</span><span>2 Explains</span><span>3 Plans</span></div>
        <p class="small">Your recent reflections mostly <b>${LBL[mode].toLowerCase()}</b>${mode === 3 ? ": they name a cause and a next step." : mode === 2 ? ": they name a cause. Adding a next step makes them more useful." : ". Try naming a cause."}</p>
        <p class="small"><b>Self-assessment accuracy:</b> your own rating matched the check result for ${c.matched} of ${c.total} concepts (${pct}%) in the last 14 days.</p>
      </div></section>`;
  }

  // ================= §14 Settings (planning parts) =================
  function settingsSection() {
    const ios = /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone;
    return `<section class="panel" aria-labelledby="ps-h" style="margin-bottom:20px"><div class="panel-head"><h2 id="ps-h">Planning</h2><span class="sub">Signed in as <b class="mono">${esc(db.student.email)}</b></span></div>
      <div class="panel-body settings-plan">
        <div><h3>Day window and study time</h3><p class="small muted">These are in planning setup now.</p><a class="btn btn-sm" href="#/plan/setup">${icon("settings")}Open planning setup</a></div>
        <div><h3>Reminders</h3>
          <div class="stack-sm"><div><button class="btn btn-sm" type="button" data-pl="notify" ${st.notif === "granted" ? "disabled" : ""}>${icon("bell")}${st.notif === "granted" ? "Notifications on" : "Enable notifications"}</button></div>
            ${ios ? `<p class="tiny faint">On iPhone, add this site to your Home Screen first (Share → Add to Home Screen).</p>` : ""}
            <div class="win-row"><label class="field"><span class="label">Morning</span><input class="input mono" type="time" value="08:00" data-pl-in="rem-am"></label><label class="field"><span class="label">Evening</span><input class="input mono" type="time" value="20:00" data-pl-in="rem-pm"></label></div></div></div>
        <div><h3>Your data</h3><button class="btn btn-sm danger-ink" type="button" data-pl="del-open">${icon("trash-2")}Delete my data</button></div>
      </div>
      <dialog class="dlg" data-del-dialog aria-labelledby="del-h"><form method="dialog" class="stack-sm">
        <h2 id="del-h">Delete my data</h2><p class="small">This deletes all your plans, ticks, ratings and reflections. It can't be undone.</p>
        <label class="field"><span class="label">Type your email (${esc(db.student.email)}) to confirm</span><input class="input mono" data-pl-in="del-confirm" autocomplete="off"></label>
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

    // ELM answers the page shows once they arrive; the page works without them
    if (id === "plan" && parts.path[0] === "milestones" && st.msEdit && !(st.msEdit.deadline in st.e2)) {
      const dl = deadlineById(st.msEdit.deadline); st.e2[dl.id] = null; // E2: once per deadline (cached)
      elm("e2", { course: dl.course, item: dl.item, kind: dl.kind, subtype: dl.subtype, due: dl.date }).then((r) => {
        if (r && Array.isArray(r.questions) && r.questions.length) { st.e2[dl.id] = r.questions.slice(0, 3).map(String); if (location.hash.startsWith("#/plan/milestones")) SX.render(); }
      });
    }
    if (id === "today" && competent() && st.e4 === undefined) {
      st.e4 = null; // E4: one gap suggestion per day, competent path only
      const g = F.gapForE4, free = SERVER.slots(W.date).filter((x) => x.free && x.end - x.start >= 30 && x.end > toMin(st.now));
      if (g) elm("e4", { concept: g.concept, minutes_hint: 30, free_slots: free.map((x) => ({ start: fromMin(Math.max(x.start, toMin(st.now))), end: fromMin(x.end) })) }).then((r) => {
        const s0 = r && toMin(r.start), ok = s0 != null && +r.minutes >= 5 && +r.minutes <= CFG.MAX_TASK_MIN && free.some((x) => s0 >= x.start && s0 + +r.minutes <= x.end);
        if (ok && r.text) { st.e4 = { concept: g.concept, link: g.link, text: String(r.text), time: r.start, mins: +r.minutes }; if (location.hash === "#/" || location.hash === "") SX.render(); }
      });
    }

    // inputs: update state without re-rendering (keeps focus); refresh only dependent regions
    box.addEventListener("input", (e) => {
      const t = e.target, d = t.dataset;
      if (d.plIn === "q1") W.q1 = t.value;
      if (d.plIn === "q2") { W.busyText = t.value; const m = t.value.match(/(\d{1,2}[:.]\d{2})\s*[–-]\s*(\d{1,2}[:.]\d{2})/); W.busy = m ? [{ start: m[1].replace(".", ":").padStart(5, "0"), end: m[2].replace(".", ":").padStart(5, "0") }] : []; if (m) { const lb = t.value.replace(m[0], "").trim(); if (lb) { busyLabels["today-" + W.date] = lb; LS.set("socratix-busy-labels", busyLabels); } } }
      if (d.plIn === "q3") { W.priority = t.value; const b = box.querySelector('[data-pl="to2"]'); if (b) b.disabled = !t.value.trim(); const w = box.querySelector("#to2-why"); if (w) w.textContent = t.value.trim() ? "" : "Add your top priority to continue."; }
      if (d.plIn === "ask") W.ask.q = t.value;
      if (d.fc) { const x = st.fromCheck.find((y) => y.id === d.fc); x[d.f] = d.f === "mins" ? +t.value : t.value; }
      if (d.plIn === "paste") st.pasteText = t.value;
      if (d.tk) {
        const tk = W.tasks.find((x) => x.id === d.tk); tk[d.f] = d.f === "mins" ? +t.value : t.value; tk.changedSinceReview = true;
        const R = SERVER.rules(W.tasks, W.date, extraBusy());
        W.tasks.forEach((x) => { const h = box.querySelector(`[data-hint="${x.id}"]`); if (h) { h.innerHTML = hintHtml(R.hints[x.id]); SX.icons(); } });
      }
      if (d.dl && st.preview && d.dl.startsWith("pv")) st.preview[+d.dl.slice(2)][d.f] = t.value;
      if (d.msIn !== undefined) {
        const row = st.msEdit.rows[+d.msIn]; row[d.f] = d.f === "hours" ? +t.value : t.value;
        const reg = box.querySelector("[data-ms-rules]"); if (reg) { reg.innerHTML = msRules(deadlineById(st.msEdit.deadline)); SX.icons(); }
      }
      if (d.msTopic !== undefined) st.msEdit.topics[+d.msTopic].name = t.value;
      if (d.msPart !== undefined) st.msEdit.parts[+d.msPart].name = t.value;
      if (d.msNum) st.msEdit[d.msNum] = +t.value;
      if (d.plIn === "ms-paste") st.msEdit.paste = t.value;
      if (d.plIn === "elm-token") { try { t.value.trim() ? sessionStorage.setItem(TOKEN_KEY, t.value.trim()) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* blocked storage: no ELM */ } st.e4 = undefined; }
      if (d.plBusy) { const b = db.setup.busy.find((x) => x.id === d.plBusy); if (d.f === "label") { busyLabels[b.id] = t.value; } else b[d.f] = t.value; }
      if (d.plIn === "win-start" || d.plIn === "win-end") {
        const s = val('[data-pl-in="win-start"]'), en = val('[data-pl-in="win-end"]'), bad = toMin(en) <= toMin(s);
        const m = box.querySelector("[data-win-msg]"); if (m) { m.textContent = bad ? "End needs to be after start." : "Tasks are planned inside this window."; m.className = `tiny ${bad ? "warn-t" : "faint"}`; }
        const sb = box.querySelector('[data-pl="save-win"]'); if (sb) sb.disabled = bad;
      }
      if (d.plIn === "del-confirm") { const g = box.querySelector('[data-pl="del-go"]'); if (g) g.disabled = t.value.trim().toLowerCase() !== db.student.email; }
      if (W.started) saveDraft();
    });
    box.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.dataset.plIn === "ics" && t.files[0]) {
        const text = await t.files[0].text().catch(() => "");
        const r = ICS.parseIcs(text);
        if (!r.events.length) { toast("No busy times found in that file. Check it's an .ics calendar export."); t.value = ""; return; }
        db.ics = { events: r.events, first: r.first, last: r.last }; db.setup.classes = []; db.setup.updated = "Today";
        LS.set("socratix-ics", db.ics); // titles were never read; only dates, times and busy/tentative stay on this device
        toast(`Imported ${r.events.length} busy slots, ${fmtDate(r.first)} – ${fmtDate(r.last)}.${r.unsupported ? ` ${r.unsupported} repeating event${r.unsupported === 1 ? "" : "s"} used only once.` : ""}`);
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
        const s = st.e4, text = val('[data-pl-in="sg-text"]') || s.text, time = val('[data-pl-in="sg-time"]') || s.time, mins = +(val('[data-pl-in="sg-mins"]') || s.mins);
        const t = { ...blankTask(), id: "t-e4", text, time, mins, link: s.link, added: W.submitted, verdict: { finishable: "yes", scopeOk: true, issue: null, note: "Suggested from your practice.", type: "coding" }, changedSinceReview: false };
        W.tasks.push(t); st.suggestion.editing = false; saveDraft(); toast(W.submitted ? "Added to today's plan (not scored)." : "Added to your draft plan."); return rr();
      }

      // setup: deadlines
      if (a === "setup-tab") { st.setupTab = v; st.readMsg = null; return rr(); }
      if (a === "read") return busy(async () => {
        st.reading = true; rr();
        try { const r = await e1(st.pasteText || "", "deadlines");
          if (r.found) { st.preview = r.items.map((x) => ({ ...x, kind: x.kind || st.msTab, keep: true })); st.readMsg = null; }
          else { st.preview = null; st.setupTab = "fill"; st.readMsg = "Couldn't read that. Fill it in instead."; }
        } finally { st.reading = false; rr(); }
      });
      if (a === "pv-toggle") { st.preview[+v].keep = !st.preview[+v].keep; return rr(); }
      if (a === "save-all") return busy(async () => { const keep = st.preview.filter((p) => p.keep); await api(() => keep.forEach(upsertDeadline)); st.preview = null; st.pasteText = ""; toast("Saved"); rr(); });
      if (a === "dl-add") { const d = { ...readDl("new"), kind: st.msTab, subtype: st.msTab === "assignment" ? val('[data-pl-in="new-subtype"]') || "code" : null }; if (!d.course || !d.item || !d.date) { toast("Fill in course, item and date."); return; } return busy(async () => { await api(() => upsertDeadline(d)); st.msAdd = false; const n = db.setup.deadlines.find((x) => x.course === d.course && x.item === d.item); if (n) { st.msDeadline = n.id; st.msEdit = null; } toast("Saved. Now add the " + (d.kind === "exam" ? "topics" : "parts") + "."); rr(); }); }
      if (a === "dl-edit") { st.editDeadline = v; return rr(); }
      if (a === "dl-cancel") { st.editDeadline = null; return rr(); }
      if (a === "dl-save") return busy(async () => { const d = readDl("ed"); await api(() => Object.assign(deadlineById(v), d)); st.editDeadline = null; toast("Saved"); rr(); });
      if (a === "dl-del") return busy(async () => { await api(() => { db.setup.deadlines = db.setup.deadlines.filter((d) => d.id !== v); db.milestones = db.milestones.filter((m) => m.deadline !== v); }); st.msEdit = null; st.msDeadline = null; toast("Deleted"); rr(); });
      if (a === "save-study") return busy(async () => { const w = +val('[data-pl-in="study-week"]'), dmax = +val('[data-pl-in="study-day"]'); if (!(w > 0 && dmax > 0)) { toast("Enter hours above 0."); return; } await api(() => { db.setup.weeklyHours = w; db.setup.dailyCapMin = Math.round(dmax * 60); db.setup.updated = "Today"; }); toast("Saved"); rr(); });
      if (a === "ics-del") { db.ics = null; LS.del("socratix-ics"); toast("Calendar file removed from this device."); return rr(); }
      if (a === "save-win") return busy(async () => { const s = val('[data-pl-in="win-start"]'), en = val('[data-pl-in="win-end"]'); await api(() => { db.setup.window = { start: s, end: en }; db.setup.updated = "Today"; }); toast("Saved"); rr(); });
      if (a === "cls-open") { st.addClass = !st.addClass; return rr(); }
      if (a === "cls-add") { const n = val('[data-pl-in="cls-name"]').trim(); if (!n) { toast("Give the class a name."); return; } db.setup.classes.push({ id: "c" + seq++, day: +val('[data-pl-in="cls-day"]'), start: val('[data-pl-in="cls-start"]'), end: val('[data-pl-in="cls-end"]'), name: n }); st.addClass = false; return rr(); }
      if (a === "cls-del") { db.setup.classes = db.setup.classes.filter((c) => c.id !== v); return rr(); }
      if (a === "save-tt") return busy(async () => { await api(() => { db.setup.updated = "Today"; }); toast("Saved"); });
      if (a === "busy-day") { const [id, d] = v.split(":"); const bb = db.setup.busy.find((x) => x.id === id); bb.days = bb.days.includes(+d) ? bb.days.filter((x) => x !== +d) : [...bb.days, +d]; return rr(); }
      if (a === "busy-add") { db.setup.busy.push({ id: "b" + seq++, days: [1], start: "18:00", end: "19:00" }); return rr(); }
      if (a === "busy-del") { db.setup.busy = db.setup.busy.filter((x) => x.id !== v); delete busyLabels[v]; return rr(); }
      if (a === "save-busy") return busy(async () => { LS.set("socratix-busy-labels", busyLabels); await api(() => { /* server receives days + times only */ db.setup.updated = "Today"; }); toast("Saved"); });

      // exams & assignments (v6 §6–§8)
      if (a === "ms-tab") { st.msTab = v; st.msDeadline = null; st.msEdit = null; st.msAdd = false; st.preview = null; return rr(); }
      if (a === "ms-dl") { st.msDeadline = v; st.msEdit = null; return rr(); }
      if (a === "ms-add") { st.msAdd = !st.msAdd; st.readMsg = null; return rr(); }
      if (a === "ms-set") {
        const [k, x] = v.split("|"), [kind, i] = k.split(":"), E = st.msEdit;
        if (kind === "topic") E.topics[+i].confidence = x; else if (kind === "part") E.parts[+i].size = x; else if (kind === "subtype") E.subtype = x;
        return rr();
      }
      if (a === "ms-topic-add") { st.msEdit.topics.push({ name: "", confidence: "ok" }); return rr(); }
      if (a === "ms-topic-del") { st.msEdit.topics.splice(+v, 1); return rr(); }
      if (a === "ms-part-add") { st.msEdit.parts.push({ name: "", size: "m" }); return rr(); }
      if (a === "ms-part-del") { st.msEdit.parts.splice(+v, 1); return rr(); }
      if (a === "ms-find") return busy(async () => {
        const E = st.msEdit, exam = st.msTab === "exam";
        if (!E.paste.trim()) { toast("Paste the text first."); return; }
        st.finding = true; rr();
        try {
          const r = await e1(E.paste, exam ? "topics" : "parts");
          const have = new Set((exam ? E.topics : E.parts).map((x) => x.name.trim().toLowerCase()));
          const add = (r.found ? r.items : []).filter((x) => x.name && !have.has(x.name.trim().toLowerCase()));
          if (exam) E.topics.push(...add.map((x) => ({ name: x.name, confidence: "ok" }))); else E.parts.push(...add.map((x) => ({ name: x.name, size: ["s", "m", "l"].includes(x.size) ? x.size : "m" })));
          toast(add.length ? `Found ${add.length}. Check them, then set ${exam ? "your confidence" : "the sizes"}.` : "Couldn't read that. Add them yourself instead.");
          if (add.length) E.paste = "";
        } finally { st.finding = false; rr(); }
      });
      if (a === "ms-build") {
        const E = st.msEdit, dl = deadlineById(E.deadline), exam = dl.kind === "exam";
        const items = (exam ? E.topics : E.parts).filter((x) => x.name.trim());
        if (!items.length) { toast(exam ? "Add at least one topic first." : "Add at least one part first."); return; }
        const r = buildStages({ ...dl, topics: exam ? items : dl.topics, parts: exam ? dl.parts : items, subtype: E.subtype, papers: E.papers, paperMin: E.paperMin });
        const old = E.rows.filter((m) => m.saved && m.doneHours);
        E.rows = r.milestones.map((m) => { const o = old.find((x) => x.stage === m.stage && x.name === m.name); return o ? { ...m, doneHours: o.doneHours } : m; });
        E.notes = r.notes; toast("Stages placed in your free time. Check them, then save."); return rr();
      }
      if (a === "ms-row-add") { st.msEdit.rows.push({ id: "m" + seq++, deadline: st.msEdit.deadline, stage: "custom", name: "", done: "", date: "", hours: 1, doneHours: 0, status: "open", redateCount: 0, saved: false }); rr(); const ins = box.ownerDocument.querySelectorAll('[data-f="name"][data-ms-in]'); ins[ins.length - 1]?.focus(); return; }
      if (a === "ms-del") { st.msEdit.rows.splice(+v, 1); return rr(); }
      if (a === "ms-done") {
        const m = st.msEdit.rows[+v]; m.status = m.status === "done" ? "open" : "done"; m.doneAt = m.status === "done" ? F.today : null;
        if (m.status === "done") toast(`Planned ${m.hours} h, took ${r1(m.doneHours || 0)} h.`); // v6 §8.3: planned vs actual on close
        return rr();
      }
      if (a === "skip") { st.skip = { k: +v }; rr(); box.ownerDocument.querySelector('[data-pl-in="skip-reason"]')?.focus(); return; }
      if (a === "skip-save") { const r = val('[data-pl-in="skip-reason"]').trim().split(/\s+/)[0]; if (!r) { toast("Add a one-word reason."); return; } Object.assign(st.msEdit.rows[+v], { status: "skipped", skipReason: r }); st.skip = null; return rr(); }
      if (a === "redate") { st.redate = { k: +v, reason: null }; return rr(); }
      if (a === "redate-reason") { st.redate.reason = v; return rr(); }
      if (a === "redate-x") { st.redate = null; return rr(); }
      if (a === "redate-save") { const m = st.msEdit.rows[+v], d = val('[data-pl-in="redate-date"]'); if (!d) return; Object.assign(m, { date: d, redateCount: (m.redateCount || 0) + 1, redateReason: st.redate.reason }); st.msEdit.rows.sort((x, y) => (x.date || "9").localeCompare(y.date || "9")); st.redate = null; toast(`Re-dated to ${fmtDate(d)}.`); return rr(); }
      if (a === "ms-save") return busy(async () => {
        const E = st.msEdit, dl = deadlineById(E.deadline);
        const rows = E.rows.filter((m) => m.name.trim() && m.date).sort((x, y) => x.date.localeCompare(y.date)).map((m) => ({ ...m, saved: true })); // v6 C6: always in date order
        const R = msWarnings({ [dl.id]: rows });
        await api(() => { Object.assign(dl, { topics: E.topics.filter((x) => x.name.trim()), parts: E.parts.filter((x) => x.name.trim()), subtype: dl.kind === "assignment" ? E.subtype : null, papers: E.papers, paperMin: E.paperMin }); db.milestones = [...db.milestones.filter((m) => m.deadline !== dl.id), ...rows]; });
        E.rows = rows.map((m) => ({ ...m }));
        toast(R.cramming.length || R.atRisk.length ? "Saved, with a warning to look at." : "Saved"); rr();
      });

      // wizard step 1
      if (a === "q1-read") return busy(async () => {
        W.reading = true; rr();
        try { const r = await e1(W.q1, "deadlines"); W.extracted = r; W.extractEdit = false; W.extractSaved = false; }
        finally { W.reading = false; rr(); }
      });
      if (a === "q1-save") return busy(async () => { await api(() => upsertDeadline(W.extracted.items[0])); W.extractSaved = true; saveDraft(); rr(); });
      if (a === "q1-edit") { W.extractEdit = true; return rr(); }
      if (a === "q1-save-form") { const d = readDl("q1"); if (!d.course || !d.item || !d.date) { toast("Fill in course, item and date."); return; } return busy(async () => { await api(() => upsertDeadline(d)); W.extracted = { found: true, items: [d] }; W.extractEdit = false; W.extractSaved = true; saveDraft(); rr(); }); }
      if (a === "to2") { if (!W.priority.trim()) return; location.hash = "#/plan/today/2"; return; }

      // rest day (session decision; replaces Off day). The UI never says whether the day counts.
      if (a === "rest-no") { W.restAsked = true; saveDraft(); return rr(); }
      if (a === "rest-yes") return busy(async () => {
        W.restLoading = true; rr();
        try {
          const free = SERVER.slots(W.date).filter((x) => x.free).map((x) => ({ start: fromMin(x.start), end: fromMin(x.end) }));
          const next = db.milestones.filter((m) => m.status === "open" && m.date >= W.date && m.hours > 0).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 3).map((m) => ({ id: m.id, name: m.name, date: m.date }));
          const r = await elm("e6", { date: W.date, now: st.now, free_slots: free, next_milestones: next });
          const ok = r && Array.isArray(r.tasks) ? r.tasks.filter((t) => t.text && toMin(t.start) != null && +t.minutes > 0 && +t.minutes <= 30).slice(0, 2) : null;
          W.restPlan = ok && ok.reduce((n, t) => n + +t.minutes, 0) <= 60 ? ok.map((t) => ({ text: t.text, time: t.start, mins: +t.minutes, milestoneId: t.milestone_id || null })) : restPlanRules();
          W.dayKind = restWeekCount() >= CFG.REST_DAYS_PER_WEEK ? "rest_over_cap" : "rest"; // silent cap
        } finally { W.restLoading = false; saveDraft(); rr(); }
      });
      if (a === "rest-use" || a === "rest-edit" || a === "rest-none") {
        W.restAsked = true;
        W.tasks = a === "rest-none" ? [] : W.restPlan.map((t) => ({ ...blankTask(), text: t.text, time: t.time, mins: t.mins, milestoneId: t.milestoneId }));
        if (a === "rest-edit") { saveDraft(); location.hash = "#/plan/today/2"; return; }
        W.tasks.forEach((t) => { t.verdict = SERVER.ruleVerdict(t); t.changedSinceReview = false; });
        const R = SERVER.rules(W.tasks, W.date, extraBusy()); W.quality = W.tasks.length ? SERVER.quality(W, R) : 0;
        W.submitted = true; W.evaluated = true; LS.del("socratix-plan-draft");
        if (a === "rest-none") { location.hash = "#/"; return; }
        location.hash = "#/plan/today/4"; return;
      }
      if (a === "rest-undo") { W.submitted = false; W.evaluated = false; W.restAsked = true; W.restPlan = null; W.dayKind = "normal"; W.tasks = [blankTask()]; W.quality = null; location.hash = competent() ? "#/plan/today/2" : "#/plan/today/1"; return; }

      // wizard step 2: stages from the exam & assignment plans (v6 §8.4)
      if (a === "fp-accept") { const x = planTargets().find((y) => y.id === v); if (x) { W.tasks = W.tasks.filter((t) => t.text.trim() || t.time); W.tasks.push({ ...blankTask(), text: x.text, time: x.time, mins: x.mins, milestoneId: x.id }); saveDraft(); toast("Added to your tasks."); } return rr(); }
      if (a === "fp-skip") { st.fromPlanDone[W.date + v] = true; return rr(); }

      // wizard step 2: suggestions from the independence check (C4, both paths)
      if (a === "fc-edit") { st.fromCheck.find((x) => x.id === v).editing = true; return rr(); }
      if (a === "fc-skip") { st.fromCheck.find((x) => x.id === v).done = true; toast("Skipped."); return rr(); }
      if (a === "fc-accept") { const x = st.fromCheck.find((y) => y.id === v); x.done = true; W.tasks.push({ ...blankTask(), text: x.text, time: x.time, mins: x.mins, link: x.link || null }); saveDraft(); toast("Added to your tasks."); return rr(); }
      if (a === "tk-add") { W.tasks.push(blankTask()); saveDraft(); rr(); const ins = document.querySelectorAll('[data-f="text"][data-tk]'); ins[ins.length - 1]?.focus(); return; }
      if (a === "tk-del") { W.tasks = W.tasks.filter((t) => t.id !== v); saveDraft(); return rr(); }
      if (a === "where") { W.showWhere = !W.showWhere; return rr(); }
      if (a === "template") { W.template = !W.template; return rr(); }
      if (a === "ask-open") { W.ask.open = true; rr(); document.getElementById("ask")?.focus(); return; }
      if (a === "ask") return busy(async () => {
        if (!W.ask.q.trim()) return;
        W.ask.loading = true; rr();
        try {
          if (db.askLeft <= 0) { W.ask.answer = "You've used today's questions; try the template."; return; }
          db.askLeft--;
          const r = await elm("e5", { question: W.ask.q, top_priority: W.priority, free_minutes: SERVER.freeMinutes(W.date, extraBusy()), tasks: W.tasks.map((t) => ({ text: t.text, start: t.time, minutes: +t.mins })) });
          W.ask.answer = r && r.answer ? r.answer : "I can't answer right now. Try the template: [finish] + [what, with a number or name].";
        }
        finally { W.ask.loading = false; rr(); }
      });
      if (a === "check") return busy(async () => {
        W.tasks = W.tasks.filter((t) => t.text.trim() || t.time);
        if (!W.tasks.length) { toast("Add at least one task."); return; }
        W.evaluating = true; location.hash = "#/plan/today/3";
        try { await api(() => null); await evaluate(); }
        catch { location.hash = "#/plan/today/2"; throw new Error("net"); }
        finally { W.evaluating = false; }
        saveDraft(); rr();
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
      if (a === "full") return busy(async () => { W.fullFeedback = true; const r = await e3(W.tasks, true); if (r) W.tasks.forEach((t) => { if (!t.overridden && !t.accepted && r.verdicts[t.id]) t.verdict = r.verdicts[t.id]; }); rr(); });
      if (a === "submit") return busy(async () => {
        W.submitting = true; rr();
        try { await api(() => { const R = SERVER.rules(W.tasks, W.date, extraBusy()); W.quality = SERVER.quality(W, R); W.submitted = true; db.oneOffBusy[W.date] = W.busy.map((x) => ({ ...x })); }); }
        finally { W.submitting = false; }
        LS.del("socratix-plan-draft"); location.hash = "#/plan/today/4";
      });

      // wizard step 4 + Today checklist (optimistic, rollback on error)
      if (a === "link-yes") { const t = W.tasks.find((x) => x.id === v); W.links[v] = t.verdict.milestoneId; if (t.status === "done") creditMilestone(t, 1); W.linkAsked = true; toast("Linked."); return rr(); }
      if (a === "link-no") { W.linkAsked = true; return rr(); }
      if (a === "tick") { const t = W.tasks.find((x) => x.id === v); const prev = t.status; return optimistic(() => { t.status = prev === "done" ? "planned" : "done"; creditMilestone(t, t.status === "done" ? 1 : -1); }, () => { creditMilestone(t, t.status === "done" ? -1 : 1); t.status = prev; }); }
      if (a === "move") { W.moving = v; return rr(); }
      if (a === "move-save") { const t = W.tasks.find((x) => x.id === v), to = val('[data-pl-in="move-time"]'); const prev = [t.status, t.movedTo]; W.moving = null; return optimistic(() => { t.status = "moved"; t.movedTo = to; toast(`Moved to ${to}`); }, () => { [t.status, t.movedTo] = prev; }); }
      if (a === "add-open") { W.adding = !W.adding; return rr(); }
      if (a === "add-save") { const text = val('[data-pl-in="add-text"]').trim(); if (!text) { toast("Write the task first."); return; } const t = { ...blankTask(), text, time: val('[data-pl-in="add-time"]'), mins: +val('[data-pl-in="add-mins"]'), added: true }; W.adding = false; return optimistic(() => W.tasks.push(t), () => { W.tasks = W.tasks.filter((x) => x !== t); }); }
      if (a === "ics") return downloadIcs();


      // settings
      if (a === "notify") {
        if (!("Notification" in window)) { toast("This browser doesn't support notifications."); return; }
        try { st.notif = await Notification.requestPermission(); } catch { st.notif = "denied"; }
        toast(st.notif === "granted" ? "Notifications on. Reminders at 08:00 and 20:00." : "Notifications are blocked in your browser settings."); return rr();
      }
      if (a === "del-open") { const dlg = box.querySelector("[data-del-dialog]"); dlg && dlg.showModal && dlg.showModal(); return; }
      if (a === "del-go") { const dlg = box.querySelector("[data-del-dialog]"); dlg && dlg.close(); LS.del("socratix-plan-draft"); LS.del("socratix-busy-labels"); toast("All your plans, ticks and ratings were deleted."); location.hash = "#/login"; return; }
    });

    async function evaluate() {
      const rulesOnly = W.reviewsUsed >= CFG.MAX_REVIEWS_PER_PLAN;
      const send = W.evaluated ? W.tasks.filter((t) => t.changedSinceReview) : W.tasks;   // Check again sends only changed tasks
      const r = rulesOnly || !send.length ? null : await e3(send, !competent());
      send.forEach((t) => {
        t.verdict = r && r.verdicts[t.id] ? r.verdicts[t.id] : rulesOnly ? SERVER.ruleVerdict(t) : { finishable: "unsure", scopeOk: true, issue: "unchecked", note: "", type: SERVER.typeOf(t.text) };
        t.changedSinceReview = false; t.accepted = false;
      });
      if (r) { W.priorityCovered = r.priorityCovered; W.coveredBy = r.coveredBy; }   // ELM down: coverage stays unknown, no cap
      // the worked example is ELM's rewrite of the weakest task (Path 1 only); without ELM there is none
      W.rewrite = r && r.rewrite && !competent() && W.tasks.some((t) => t.id === r.rewrite.taskId) ? r.rewrite : W.rewrite && W.tasks.some((t) => t.id === W.rewrite.taskId) ? W.rewrite : null;
      if (!rulesOnly) W.reviewsUsed++;
      W.rulesOnly = W.reviewsUsed >= CFG.MAX_REVIEWS_PER_PLAN && W.evaluated;
      W.evaluated = true;
    }
    // a Step 3 action changed one task: re-check it with the rules right away (an ELM re-check would use up one of the 2 reviews)
    function reviewLocal(t) {
      t.verdict = { ...SERVER.ruleVerdict(t), milestoneId: t.verdict && t.verdict.milestoneId }; t.changedSinceReview = false;
      if (W.rewrite && W.rewrite.taskId === t.id) W.rewrite = null;
      saveDraft();
    }
    // v6 §8.3: hours done = minutes of done tasks linked to the milestone
    function creditMilestone(t, sign) {
      const m = db.milestones.find((x) => x.id === (t.milestoneId || W.links[t.id]));
      if (m) m.doneHours = Math.max(0, Math.round(((m.doneHours || 0) + (sign * (+t.mins || 0)) / 60) * 100) / 100);
    }
    async function optimistic(apply, rollback) {
      apply(); rr();
      try { await api(() => null); } catch { rollback(); rr(); netToast(null); }
    }
    function readDl(key) { const g = (f) => (box.querySelector(`[data-dl="${key}"][data-f="${f}"]`) || {}).value || ""; return { course: g("course").trim().toUpperCase(), item: g("item").trim(), date: g("date"), time: g("time") || "23:59" }; }
    function upsertDeadline(d) {
      const ex = db.setup.deadlines.find((x) => x.course.toLowerCase() === d.course.toLowerCase() && x.item.toLowerCase() === d.item.toLowerCase());
      if (ex) Object.assign(ex, { date: d.date, time: d.time }); else db.setup.deadlines.push({ id: "d" + seq++, course: d.course, item: d.item, kind: d.kind === "exam" ? "exam" : "assignment", subtype: d.kind === "exam" ? null : d.subtype || "code", date: d.date, time: d.time, topics: [], parts: [] });
    }
    function downloadIcs() {
      const stamp = (date, t) => `${date.replace(/-/g, "")}T${t.replace(":", "")}00`;
      const ev = W.tasks.map((t) => { const s = t.status === "moved" ? t.movedTo : t.time, e = fromMin(toMin(s) + (+t.mins || 30)); return `BEGIN:VEVENT\r\nUID:${t.id}-${W.date}@socratix\r\nDTSTAMP:${stamp(W.date, "00:00")}\r\nDTSTART:${stamp(W.date, s)}\r\nDTEND:${stamp(W.date, e)}\r\nSUMMARY:${t.text.replace(/[,;]/g, "\\$&")}\r\nEND:VEVENT`; }).join("\r\n");
      const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Socratix//Plan//EN\r\n${ev}\r\nEND:VCALENDAR\r\n`], { type: "text/calendar" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `plan-${W.date}.ics`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast("Calendar file downloaded.");
      if (SX.offerOutlookGuide) SX.offerOutlookGuide(); // first download only
    }
  }

  function nextDay(fromPlanTomorrow) {
    const date = addDays(W.date, 1);
    if (W.submitted && !W.closed && !fromPlanTomorrow) { db.history.push({ date: W.date, kind: W.dayKind, completion: W.dayKind === "rest" ? null : Math.round((W.tasks.filter((t) => !t.added && t.status !== "planned").length / Math.max(1, W.tasks.filter((t) => !t.added).length)) * 100) }); db.history = db.history.slice(-14); }
    W = newWizard(date, false); st.suggestion = { skipped: false, editing: false }; st.now = "09:30";
    F.today = date; LS.del("socratix-plan-draft");
  }

  // Practice → Planning: an activity_completed with plan_task_id ticks the task
  SX.on && SX.on("activity_completed", (ev) => { const t = W.tasks.find((x) => x.id === ev.plan_task_id); if (t && t.status !== "done") { t.status = "done"; toast(`Plan task "${t.text}" ticked.`); } });
  const planTask = (id) => { const t = W.tasks.find((x) => x.id === id); return t ? { id: t.id, title: t.text } : null; };

  // ---------- API used by Project and Reflection ----------
  function addTask(task) {
    const t = { ...blankTask(), ...task, changedSinceReview: true, added: W.submitted };
    W.tasks.push(t); saveDraft(); return t;
  }
  function closePlan(took) {
    const r = SERVER.checkin(W, took, null); W.closed = true; return r;
  }
  function addTomorrowSuggestion(x) {
    const date = addDays(W.date, 1), free = SERVER.slots(date).filter((sl) => sl.free && sl.end - sl.start >= x.mins);
    const time = free.length ? fromMin(free[Math.min(1, free.length - 1)].start) : "16:00";
    const item = { id: "fc" + seq++, date, time, ...x }; st.fromCheck.push(item); return item;
  }
  function freeHoursOn(date) { return SERVER.freeMinutes(date) / 60; }

  return {
    meta, render, bind, today: todayPage, progress: progressPage, settingsSection, planTask,
    plan: () => W, competent, pathLine, onTargetCount, addTask, closePlan, addTomorrowSuggestion, freeHoursOn,
    milestoneRules: (rows, deadline) => SERVER.milestoneRules(rows, deadline), conceptsOf: SERVER.conceptsOf, typeName: (t) => SERVER.TYPE_NAME[t] || "Other", typeOf: SERVER.typeOf,
    dateLabel: fmtDate, today_: () => F.today, nowTime: () => st.now, elmDown: () => st.sim.elm, proto,
    _server: SERVER, _db: db,
  };
};
