// Socratix — milestone rules (planning_methodology.md v6 §6–§8). Pure: no DOM, no ELM; runs in node (strategy.test.js).
// Time is measured as STUDY time from the student's real calendar (session decision): a busy week moves dates later.
// All numbers are design choices to tune with a pilot (v6 §11), not research-derived.
(function (root) {
  "use strict";
  const DAY = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * DAY));
  const diffDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  const mondayOf = (s) => addDays(s, -((new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7));
  const r1 = (x) => Math.round(x * 10) / 10;

  const DEFAULTS = {
    WEEKLY_STUDY_HOURS: 20, DAILY_STUDY_CAP_MIN: 240, BUFFER_MIN: 0.15, MIN_GAP_MIN: 25,
    MILESTONE_BUFFER_DAYS: 2, FIRST_MILESTONE_WITHIN_DAYS: 2, MILESTONES_OPTIONAL_UNDER_DAYS: 7,
    EXAM_HOURS: { low: 2, ok: 1, high: 0.5 }, EXAM_MAP_H: 0.75, EXAM_MIXED_H: 2.5, EXAM_REVISIT_ITEM_H: 0.5,
    EXAM_ERROR_ITEMS_GUESS: 2, EXAM_FINAL_H_PER_DAY: 1.5, PAPER_MIN: 120,
    ASSIGN_PART_H: { s: 1, m: 3, l: 6 }, ASSIGN_UNDERSTAND_SHARE: 0.10, ASSIGN_CHECK_SHARE: 0.15, ASSIGN_PLAN_SHARE: 0,
  };

  // ---------- §5.1 capacity ----------
  // gapsOf(date) → free gaps [[startMin, endMin], …] inside the day window; isRest(date) → bool.
  // Returns a function C(date) → study minutes, with the weekly cap spread over the week by each day's free time.
  function capacity({ gapsOf, isRest = () => false, today, cfg = DEFAULTS }) {
    const c = new Map(), C = new Map();
    const raw = (d) => {
      if (!c.has(d)) {
        const usable = isRest(d) ? 0 : gapsOf(d).filter(([a, b]) => b - a >= cfg.MIN_GAP_MIN).reduce((s, [a, b]) => s + b - a, 0);
        c.set(d, Math.min(usable * (1 - cfg.BUFFER_MIN), cfg.DAILY_STUDY_CAP_MIN));
      }
      return c.get(d);
    };
    return (d) => {
      if (d < today) return 0;
      if (!C.has(d)) {
        const w = mondayOf(d), days = [...Array(7)].map((_, k) => addDays(w, k)).filter((x) => x >= today);
        const sum = days.reduce((s, x) => s + raw(x), 0);
        const cap = Math.min(cfg.WEEKLY_STUDY_HOURS * 60 * (days.length / 7), sum); // a part week gets a pro-rata share
        days.forEach((x) => C.set(x, sum ? (cap * raw(x)) / sum : 0));
      }
      return C.get(d);
    };
  }
  const studyMin = (C, from, to) => { let s = 0; for (let d = from; d <= to; d = addDays(d, 1)) s += C(d); return s; };
  // first day t in [from, to] where Q(t) ≥ share × Q(to); `to` if the period has no study time
  function dateAtShare(C, from, to, share) {
    const total = studyMin(C, from, to);
    if (to < from) return to;
    if (!total) return addDays(from, Math.round(diffDays(from, to) * share));
    let q = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { q += C(d); if (q >= share * total - 1e-9) return d; }
    return to;
  }
  const firstStudyDay = (C, from, to) => { for (let d = from; d <= to; d = addDays(d, 1)) if (C(d) > 0) return d; return from; };

  // ---------- §5.2 exam template ----------
  // topics: [{name, confidence: "low"|"ok"|"high", gap?: bool}]; gapsOf for the contiguous past-paper slot
  function examPlan({ today, examDate, topics, paperMin, C, gapsOf, cfg = DEFAULTS }) {
    const paper = paperMin || cfg.PAPER_MIN, notes = [];
    const lows = topics.filter((t) => t.confidence === "low" || t.gap);
    const last = addDays(examDate, -(cfg.MILESTONE_BUFFER_DAYS + 1)), finalStart = addDays(examDate, -cfg.MILESTONE_BUFFER_DAYS);
    const revisitItems = lows.length + cfg.EXAM_ERROR_ITEMS_GUESS; // the error list is unknown until the paper is marked
    const fits = (d) => gapsOf(d).some(([a, b]) => b - a >= paper);
    const compressed = diffDays(today, examDate) < cfg.MILESTONES_OPTIONAL_UNDER_DAYS;
    const order = [...topics].sort((a, b) => (b.gap || b.confidence === "low") - (a.gap || a.confidence === "low"));
    const coverH = order.reduce((s, t) => s + cfg.EXAM_HOURS[t.confidence || "ok"], 0);
    const ms = [];
    const add = (stage, name, done, date, hours) => ms.push({ stage, name, done, date: date < today ? today : date, hours: r1(hours) });
    add("map", "Map", "Topics confirmed, confidence set, past papers found", firstStudyDay(C, today, last), cfg.EXAM_MAP_H);

    if (compressed) {
      // v6 compressed version; window per stage in proportion to its hours (not specified in v6)
      const st = [
        ["cover", "Low topics tested from memory", "Each Low topic summarised without notes, then 3–5 questions", lows.reduce((s, t) => s + cfg.EXAM_HOURS[t.confidence || "ok"], 0) || cfg.EXAM_HOURS.ok],
        ["paper", "Timed past paper", "1 paper under exam conditions, marked, with an error list", paper / 60 + 1],
        ["revisit", "Revisit", "Error list and Low topics retested", revisitItems * cfg.EXAM_REVISIT_ITEM_H],
      ];
      const tot = st.reduce((s, x) => s + x[3], 0); let cum = 0;
      st.forEach(([stage, name, done, h]) => { cum += h; add(stage, name, done, dateAtShare(C, today, last, cum / tot), h); });
    } else {
      const cover = dateAtShare(C, today, last, 0.5);
      add("cover", "Cover by testing", `Every topic done once from memory (Low first: ${order.slice(0, 3).map((t) => t.name).join(", ")}${order.length > 3 ? ", …" : ""})`, cover, coverH);
      add("mixed", "Mixed practice", "2 sessions with questions from different topics mixed", dateAtShare(C, today, last, 0.65), cfg.EXAM_MIXED_H);
      const p0 = dateAtShare(C, today, last, 0.65), p1 = dateAtShare(C, today, last, 0.75);
      let pd = null;
      for (let d = p1; d >= p0; d = addDays(d, -1)) if (fits(d)) { pd = d; break; }
      if (!pd) for (let d = addDays(p1, 1); d <= last; d = addDays(d, 1)) if (fits(d)) { pd = d; break; }
      if (!pd) { pd = p1; notes.push({ code: "no_paper_slot", text: `No free block of ${paper / 60} h before ${last}. Free one up for the timed paper.` }); }
      add("paper", "Timed past paper", "≥ 1 paper under exam conditions, marked, with an error list", pd, paper / 60 + 1);
      let rv = dateAtShare(C, today, last, 0.9);
      if (diffDays(cover, rv) < 2) rv = addDays(cover, 2); // spacing: retest ≥ 2 days after first cover
      if (rv > last) rv = last;
      add("revisit", "Revisit", "Error list and Low topics retested, ≥ 2 days after first cover", rv, revisitItems * cfg.EXAM_REVISIT_ITEM_H);
    }
    add("final", "Final review", "Light self-testing only; no new material", finalStart, cfg.EXAM_FINAL_H_PER_DAY * cfg.MILESTONE_BUFFER_DAYS);
    return { milestones: sortMs(ms), compressed, optional: compressed, notes };
  }

  // ---------- §5.3 assignment template ----------
  const STAGES = {
    code: { understand: "Requirements checklist from the spec; starter code runs", plan: "Functions/parts listed; test cases written first", build: (p) => `${p} passes its tests`, check: "All tests pass; spec checklist ticked" },
    written: { understand: "Question + marking criteria → checklist", plan: "Notes + outline (one point per section)", build: (p) => `${p} drafted`, check: "Revised against criteria; proofread" },
    maths: { understand: "List all questions", plan: "Attempt every question once; mark the stuck ones", build: (p) => `${p} solved`, check: "Write-up checked; answers verified" },
  };
  function assignmentPlan({ today, due, subtype = "code", parts, C, cfg = DEFAULTS }) {
    const S = STAGES[subtype] || STAGES.code;
    const ready = addDays(due, -cfg.MILESTONE_BUFFER_DAYS);
    const P = parts.reduce((s, p) => s + cfg.ASSIGN_PART_H[p.size || "m"], 0);
    const T = P / (1 - cfg.ASSIGN_UNDERSTAND_SHARE - cfg.ASSIGN_CHECK_SHARE - cfg.ASSIGN_PLAN_SHARE);
    const rows = [
      ["understand", "Understand", S.understand, cfg.ASSIGN_UNDERSTAND_SHARE * T],
      ["plan", "Plan", S.plan, cfg.ASSIGN_PLAN_SHARE * T],
      ...parts.map((p) => ["build", `Build: ${p.name}`, S.build(p.name), cfg.ASSIGN_PART_H[p.size || "m"]]),
      ["check", "Check", S.check, cfg.ASSIGN_CHECK_SHARE * T],
    ];
    const end = addDays(ready, -1); // work finishes the day before "Ready to submit"
    let cum = 0, prev = today;
    const ms = rows.map(([stage, name, done, h], k) => {
      cum += h;
      let d = dateAtShare(C, today, end < today ? today : end, cum / T);
      if (k === 0 && diffDays(today, d) > cfg.FIRST_MILESTONE_WITHIN_DAYS) d = addDays(today, cfg.FIRST_MILESTONE_WITHIN_DAYS); // start at once
      if (d < prev) d = prev; prev = d;
      return { stage, name, done, date: d, hours: r1(h) };
    });
    ms.push({ stage: "ready", name: "Ready to submit", done: "Submitted version saved; nothing left but uploading", date: ready < today ? today : ready, hours: 0 });
    return { milestones: ms, totalHours: r1(T), optional: diffDays(today, due) < cfg.MILESTONES_OPTIONAL_UNDER_DAYS, notes: [] };
  }

  const sortMs = (ms) => [...ms].sort((a, b) => a.date.localeCompare(b.date)); // v6 C6: always in date order

  // ---------- §5.4 warnings ----------
  // deadlines: [{id, due (date), milestones: [{id, name, date, hours, doneHours?, status?}]}]
  function warnings({ today, deadlines, C, cfg = DEFAULTS }) {
    const out = { buffer: [], cramming: [], atRisk: [], weeks: [] };
    deadlines.forEach((dl) => {
      const ms = sortMs(dl.milestones.filter((m) => m.date));
      if (ms.length && diffDays(ms[ms.length - 1].date, dl.due) < cfg.MILESTONE_BUFFER_DAYS) out.buffer.push({ deadline: dl.id });
    });
    // cramming: each milestone's hours spread from the previous milestone (or today) to its date, in proportion to study time
    const perWeek = {};
    deadlines.forEach((dl) => {
      let prev = null;
      sortMs(dl.milestones.filter((m) => m.date)).forEach((m) => {
        if (m.date < today || m.status === "done") { prev = m.date; return; }
        const from = prev && prev >= today ? addDays(prev, 1) : today, to = m.date < from ? from : m.date;
        const total = studyMin(C, from, to), n = diffDays(from, to) + 1;
        for (let d = from; d <= to; d = addDays(d, 1)) { const w = mondayOf(d); perWeek[w] = (perWeek[w] || 0) + (+m.hours || 0) * (total ? C(d) / total : 1 / n); }
        prev = m.date;
      });
    });
    Object.keys(perWeek).sort().forEach((w) => {
      const study = studyMin(C, w < today ? today : w, addDays(w, 6)) / 60;
      const row = { week: w, planned: Math.round(perWeek[w]), study: Math.round(study) };
      out.weeks.push(row);
      if (perWeek[w] > study + 0.5) out.cramming.push(row);
    });
    // at risk (earliest due date first): hours still needed up to each milestone vs study time before it
    const open = deadlines.flatMap((dl) => dl.milestones.filter((m) => m.date && m.status !== "done" && m.date >= today).map((m) => ({ ...m, deadline: dl.id })))
      .sort((a, b) => a.date.localeCompare(b.date));
    let need = 0;
    open.forEach((m) => {
      const left = Math.max(0, (+m.hours || 0) - (+m.doneHours || 0)), avail = studyMin(C, today, m.date) / 60;
      if (left > 0 && need + left > avail + 1e-9) out.atRisk.push({ id: m.id, deadline: m.deadline, name: m.name, date: m.date, left: r1(left), free: r1(Math.max(0, avail - need)) });
      need += left;
    });
    return out;
  }

  const api = { DEFAULTS, capacity, studyMin, dateAtShare, examPlan, assignmentPlan, warnings, addDays, diffDays, mondayOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SXstrategy = api;
})(this);
