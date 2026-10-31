// Socratix — Project: list, 3-step wizard (Idea → Questions → Plan) and the accepted plan page.
// Built from demo_features_spec.md §2. Sample data only. J1/J2 are mocked ELM calls; the tool drafts,
// the student edits and accepts. Dates are never taken from ELM: rules place them (§2.4, §2.7).
window.ProjectModule = (SX, PL) => {
  "use strict";
  const { D, esc, icon, toast, sleep } = SX;
  const F = D.projects;
  const SKILLS = D.skills;
  const skillName = (id) => (SKILLS.find((s) => s.skill_id === id) || {}).name;

  // ---------- dates ----------
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const fmt = (s) => (s ? PL.dateLabel(s) : "—");
  const mondayOf = (s) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));

  // ---------- simulated server ----------
  const db = { projects: F.seed.map((p) => JSON.parse(JSON.stringify(p))), j1Left: F.caps.J1_PER_DAY, j2Left: F.caps.J2_PER_DAY, weeklyDone: {} };
  const title = (p) => p.title || shortTitle(p.idea);
  function shortTitle(idea) {
    const t = idea.replace(/^(a|an|the)\s+/i, "").split(/[.,:;—-]/)[0].split(/\s+/).slice(0, 6).join(" ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // J1 questions: 3–5, specific to the idea (mock)
  function j1(w) {
    if (PL.elmDown() || db.j1Left <= 0) return { questions: F.genericQuestions.map((q) => ({ ...q })), fallback: true };
    db.j1Left--;
    const l = w.idea.toLowerCase(); let qs;
    if (/gym|fitness|workout|exercise|run|training/.test(l)) qs = [
      { id: "q1", text: "Which features must the first version have?", kind: "choice", multi: true, options: ["Log a session", "Charts", "Reminders", "Login"] },
      { id: "q2", text: "Which stack?", kind: "choice", multi: false, options: ["Python + Flask", "React", "Not sure"] },
      { id: "q3", text: "How will you know it's done?", kind: "text" },
    ];
    else if (/game|play|level|score/.test(l)) qs = [
      { id: "q1", text: "Which parts must the first version have?", kind: "choice", multi: true, options: ["Movement", "Scoring", "Levels", "Sound"] },
      { id: "q2", text: "Which language or engine?", kind: "choice", multi: false, options: ["Python + pygame", "JavaScript", "Not sure"] },
      { id: "q3", text: "How will you know it's done?", kind: "text" },
    ];
    else if (/web|app|site|tracker|dashboard|bot|tool/.test(l)) qs = [
      { id: "q1", text: "Which features must the first version have?", kind: "choice", multi: true, options: ["Add and edit entries", "A list or overview", "Charts", "Login"] },
      { id: "q2", text: "Which stack?", kind: "choice", multi: false, options: ["Python + Flask", "Python script (terminal)", "React", "Not sure"] },
      { id: "q3", text: "How will you know it's done?", kind: "text" },
    ];
    else qs = [
      { id: "q1", text: "What is the one thing the first version must do?", kind: "text" },
      { id: "q2", text: "Which tools or language will you use?", kind: "choice", multi: false, options: ["Python", "Haskell", "Paper and pen first", "Not sure"] },
      { id: "q3", text: "How will you know it's done?", kind: "text" },
    ];
    qs.push({ id: "q4", text: "What do you already know that will help?", kind: "text" });
    if (w.type === "Team") qs.push({ id: "q5", text: "Who does what in the team?", kind: "text" });
    return { questions: qs.slice(0, 5) };
  }

  // J2 plan (draft) or review comments (mock). Returns order + hours only, never dates.
  const VARIANT = {
    goal: (w, a, v) => [`Ship a first version of ${lower(shortTitle(w.idea))} by ${w.deadline ? fmt(w.deadline) : "your deadline"}.`, `Have ${lower(shortTitle(w.idea))} working end to end by ${w.deadline ? fmt(w.deadline) : "your deadline"}, with ${a.features[0] ? lower(a.features[0]) : "the core feature"} done.`, `By ${w.deadline ? fmt(w.deadline) : "your deadline"}, someone else can use ${lower(shortTitle(w.idea))} without your help.`][v % 3],
    minimum: (w, a, v) => [`${a.features[0] || "The core feature"} working end to end. ${a.features.slice(1).join(" and ") || "Extras"} can wait.`, `One complete path through the app: ${lower(a.features[0] || "the core feature")}, then a simple result on screen.`, `A version you can demo in two minutes: ${lower(a.features[0] || "the core feature")} only.`][v % 3],
  };
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  function answersOf(w) {
    const q = (id) => w.answers[id] || {};
    const choice = w.questions.find((x) => x.kind === "choice" && x.multi);
    const features = choice ? [...(q(choice.id).chips || []), ...(q(choice.id).other ? [q(choice.id).other] : [])] : [];
    const textCore = w.questions.find((x) => x.id === "q1" && x.kind === "text");
    if (!features.length && textCore && q("q1").text) features.push(q("q1").text);
    const stackQ = w.questions.find((x) => x.kind === "choice" && !x.multi);
    const stack = stackQ ? (q(stackQ.id).chips || [])[0] || q(stackQ.id).other || "" : "";
    const done = (w.questions.find((x) => /done/i.test(x.text)) && q(w.questions.find((x) => /done/i.test(x.text)).id).text) || "";
    return { features, stack, done, choice };
  }
  function j2Draft(w, v = 0) {
    const a = answersOf(w);
    const feats = a.features.length ? a.features : ["The core feature"];
    const notChosen = a.choice ? a.choice.options.filter((o) => !a.features.includes(o)) : [];
    const ms = [{ name: "Set-up and a first screen that runs", done_when: `A ${a.stack && a.stack !== "Not sure" ? a.stack : "starter"} project opens and shows something`, est_hours: 3 }]
      .concat(feats.slice(0, 3).map((f) => ({ name: `${f} works`, done_when: `${f} works for 3 cases you wrote down`, est_hours: 5 })))
      .concat([{ name: "Test with a friend and fix", done_when: a.done || "A friend uses it without help", est_hours: 3 }]);
    const skillHints = [["python.functions", /app|tool|tracker|program|bot|game/], ["python.lists", /list|log|track|history|session|entries|cart/], ["python.loops", /chart|repeat|every|track|game/], ["python.input_validation", /input|form|login|log a|enter|user/], ["python.conditionals", /reminder|rule|if|score|level/], ["python.variables", /./]];
    const l = (w.idea + " " + a.features.join(" ")).toLowerCase();
    const skills = skillHints.filter(([, re]) => re.test(l)).map(([id]) => id).filter((id) => skillName(id)).slice(0, 4); // closed list only
    const risks = [];
    if (/not sure/i.test(a.stack) || !a.stack) risks.push({ risk: "Choosing tools takes too long", mitigation: "Decide by the end of the first week; a simple stack is enough for a first version" });
    risks.push({ risk: "Features grow while you build", mitigation: "Keep the \"Out for now\" list and add nothing until the minimum version works" });
    if (w.type === "Team") risks.push({ risk: "Unclear who does what", mitigation: "Agree an owner for each milestone in the first meeting" });
    else risks.push({ risk: "Other deadlines squeeze the project", mitigation: `Protect ${w.hours} h a week in your plan and re-date milestones early, not late` });
    return {
      goal: VARIANT.goal(w, a, v),
      scope_in: feats.slice(0, 4),
      scope_out: notChosen.length ? notChosen : ["Polish and extras"],
      minimum_version: VARIANT.minimum(w, a, v),
      milestones: ms,
      first_step: { text: v % 2 ? `List the ${feats.length} feature${feats.length === 1 ? "" : "s"} and sketch the first screen` : `Set up the project folder and a first file that runs`, minutes: v % 2 ? 25 : 35 },
      risks: risks.slice(0, 3),
      skills,
    };
  }
  function j2Review(w, plan) {
    const c = [];
    if (!plan.goal.trim()) c.push({ section: "goal", note: "Add one sentence with the outcome and the deadline." });
    if (!plan.scope_out.filter(Boolean).length) c.push({ section: "scope", note: "Say what is out for now, so the scope can't grow quietly." });
    if (!plan.minimum_version.trim()) c.push({ section: "minimum", note: "Name what you'd ship if time runs short." });
    if (plan.milestones.length < 3) c.push({ section: "milestones", note: "Three or more milestones make progress easier to see." });
    if (plan.milestones.some((m) => !m.done_when.trim())) c.push({ section: "milestones", note: "Some milestones don't say what \"done\" means." });
    const total = plan.milestones.reduce((s, m) => s + (+m.est_hours || 0), 0), weeks = w.deadline ? Math.max(1, (toDate(w.deadline) - toDate(PL.today_())) / DAY / 7) : 4;
    if (total > w.hours * weeks) c.push({ section: "milestones", note: `${total} h of milestones but about ${Math.round(w.hours * weeks)} h before the deadline at ${w.hours} h a week. Cut scope or add hours.` });
    if (!plan.risks.filter((r) => r.risk.trim()).length) c.push({ section: "risks", note: "Name at least one risk and what you'd do about it." });
    return c.length ? c : [{ section: "goal", note: "This plan covers every section. Check the hours once more after the first week." }];
  }
  const emptyPlan = () => ({ goal: "", scope_in: [""], scope_out: [""], minimum_version: "", milestones: [{ name: "", done_when: "", est_hours: 2 }], first_step: { text: "", minutes: 30 }, risks: [{ risk: "", mitigation: "" }], skills: [] });

  // Rules: dates backward from the deadline; last milestone ≥ 2 days before; hours spread over free time
  function placeDates(milestones, deadline, hoursPerWeek) {
    if (!deadline) return { rows: milestones.map((m) => ({ ...m, date: "" })), tight: false };
    const today = PL.today_();
    const weekFree = (d) => { let f = 0; const m = mondayOf(d); for (let k = 0; k < 7; k++) f += PL.freeHoursOn(addDays(m, k)); return f || 1; };
    const cap = (d) => (hoursPerWeek * PL.freeHoursOn(d)) / weekFree(d);
    let cursor = addDays(deadline, -2), tight = false;
    const out = milestones.map((m) => ({ ...m }));
    for (let i = out.length - 1; i >= 0; i--) {
      if (cursor < today) { cursor = today; tight = true; }
      out[i].date = cursor;
      let need = +out[i].est_hours || 0, day = cursor;
      while (need > 0.001) { need -= cap(day); if (need > 0.001) { day = addDays(day, -1); if (day < today) { tight = true; break; } } }
      cursor = addDays(day, -1);
    }
    return { rows: out, tight };
  }

  // ---------- state ----------
  const newWizard = () => ({ step: 1, idea: "", type: "Personal", deadline: "", hours: 4, learn: "", questions: null, answers: {}, plan: null, regenLeft: F.caps.REGEN_PER_PLAN, variant: {}, comments: null, mode: PL.competent() ? "write" : "draft", loading: false });
  let W = newWizard();
  const st = { reDate: null };

  // ---------- render ----------
  function meta(parts) {
    const [a] = parts.path;
    if (!a) return { title: "Project" };
    if (a === "new") return { title: `Step ${W.step} of 3`, parent: "Project" };
    const p = db.projects.find((x) => x.id === a);
    return { title: p ? title(p) : "Project", parent: "Project" };
  }
  function render(parts) {
    const [a] = parts.path;
    let body;
    if (!a) body = list();
    else if (a === "new") body = wizard();
    else body = page(a);
    return `<div class="project" data-project>${body}</div>`;
  }

  function list() {
    return `<div class="page-head"><div><h1>Project</h1><p>Describe an idea; Socratix asks a few questions and drafts a plan with milestones. You change anything and accept it.</p></div>
        <div class="page-actions"><a class="btn btn-primary" href="#/project/new" data-pj="start" data-tour="project-start">${icon("plus")}Start a project plan</a></div></div>
      <div class="pj-list">${db.projects.map((p) => {
        const done = p.plan.milestones.filter((m) => m.done).length, next = p.plan.milestones.find((m) => !m.done);
        return `<a class="panel pj-card" href="#/project/${p.id}">
          <div class="row between"><h2>${esc(title(p))}</h2><span class="ptag ${p.status === "active" ? "ok" : "neutral"}">${p.status === "active" ? "Active" : p.status === "done" ? "Done" : "Draft"}</span></div>
          <p class="small muted">${esc(p.plan.goal)}</p>
          <div class="pj-meta small"><span class="chip">${esc(p.type)}</span><span class="mono">${p.hours_per_week} h/week</span>${next ? `<span>Next: <b>${esc(next.name)}</b> <span class="mono faint">${fmt(next.date)}</span></span>` : ""}</div>
          <div class="seg-bar pj-bar" style="grid-template-columns:repeat(${p.plan.milestones.length},1fr)" role="img" aria-label="${done} of ${p.plan.milestones.length} milestones done">${p.plan.milestones.map((m) => `<span class="${m.done ? "on" : ""}"></span>`).join("")}</div>
        </a>`; }).join("")}</div>
      ${PL.proto()}`;
  }

  const STEPS = ["Your idea", "A few questions", "Your plan"];
  function stepper(n) { return `<ol class="stepper three" aria-label="Project steps">${STEPS.map((s, k) => `<li ${k + 1 === n ? 'aria-current="step"' : ""} class="${k + 1 < n ? "done" : ""}"><span class="sn">${k + 1 < n ? icon("check") : k + 1}</span><span class="sl-t">${s}</span></li>`).join("")}</ol>`; }
  function wizard() {
    const n = W.step;
    return `<div class="page-head"><div><h1>New project plan</h1><p class="path-line">${PL.pathLine()}</p></div></div>
      ${stepper(n)}<div class="wiz" data-step="${n}">${n === 1 ? step1() : n === 2 ? step2() : step3()}</div>${PL.proto()}`;
  }

  function step1() {
    const len = W.idea.trim().length, ok = len >= 20 && len <= 1000;
    return `<div class="step-label"><span class="label-up">Step 1 of 3 · Your idea</span></div>
      <section class="panel"><div class="panel-body stack" style="gap:20px">
        <div class="field"><label for="pj-idea">What do you want to build or do? <span class="faint" style="font-weight:400">(required)</span></label>
          <textarea class="textarea" id="pj-idea" rows="4" maxlength="1000" data-pj-in="idea" placeholder="e.g. A web app that tracks my gym sessions and shows progress charts." aria-describedby="pj-count">${esc(W.idea)}</textarea>
          <span class="hint-text" id="pj-count" data-pj-count>${len} / 1,000 characters${len < 20 ? ` · at least 20` : ""}</span></div>
        <div class="field"><span class="label" id="pj-type">Type</span><div class="chips" role="group" aria-labelledby="pj-type">${["Coursework", "Personal", "Team"].map((t) => `<button type="button" class="qchip" data-pj="type" data-v="${t}" aria-pressed="${W.type === t}">${t}</button>`).join("")}</div></div>
        <div class="pj-row">
          <label class="field"><span class="label">Deadline <span class="faint" style="font-weight:400">(optional)</span></span><input class="input mono" type="date" data-pj-in="deadline" value="${W.deadline}" min="${PL.today_()}"></label>
          <label class="field"><span class="label">Hours per week you can give it</span><input class="input mono" type="number" min="1" max="40" data-pj-in="hours" value="${W.hours}"></label>
        </div>
        <label class="field"><span class="label">What do you want to learn from it? <span class="faint" style="font-weight:400">(optional)</span></span><input class="input" data-pj-in="learn" value="${esc(W.learn)}" placeholder="e.g. Structure a bigger Python program"></label>
      </div></section>
      <div class="wiz-foot"><a class="btn" href="#/project">${icon("arrow-left")}Cancel</a><button class="btn btn-primary" type="button" data-pj="to2" ${ok && !W.loading ? "" : "disabled"} aria-describedby="pj-why">${W.loading ? "Thinking…" : `Next ${icon("arrow-right")}`}</button></div>
      <p class="tiny faint right" id="pj-why" data-pj-why>${ok ? "" : "Describe the idea in at least 20 characters."}</p>`;
  }

  function step2() {
    const qs = W.questions || [];
    const needDeadline = !W.deadline;
    return `<div class="step-label"><span class="label-up">Step 2 of 3 · A few questions</span>${W.fallback ? `<span class="small muted">General questions (the assistant is unavailable)</span>` : ""}</div>
      <div class="stack" style="gap:12px">
      ${needDeadline ? qCard({ id: "deadline", text: "When does it need to be done?", kind: "date" }) : ""}
      ${qs.map(qCard).join("")}
      </div>
      ${W.loading ? `<div class="drafting" role="status">${icon("loader")}Drafting your plan… (about 10 seconds)</div>` : ""}
      <div class="wiz-foot"><button class="btn" type="button" data-pj="back1">${icon("arrow-left")}Back</button><button class="btn btn-primary" type="button" data-pj="build" ${W.loading ? "disabled" : ""}>${W.loading ? "Drafting…" : "Build my plan"}</button></div>`;
  }
  function qCard(q) {
    const a = W.answers[q.id] || {};
    return `<section class="panel qcard ${a.skipped ? "skipped" : ""}" aria-labelledby="q-${q.id}"><div class="panel-body stack-sm">
      <div class="row between"><h3 id="q-${q.id}">${esc(q.text)}</h3><button class="btn btn-sm btn-ghost" type="button" data-pj="skip" data-v="${q.id}" aria-pressed="${!!a.skipped}">${a.skipped ? "Skipped · undo" : "Skip"}</button></div>
      ${a.skipped ? "" : q.kind === "choice" ? `<div class="chips" role="group" aria-label="${esc(q.text)}">${q.options.map((o) => `<button type="button" class="qchip" data-pj="chip" data-v="${q.id}::${esc(o)}" aria-pressed="${(a.chips || []).includes(o)}">${esc(o)}</button>`).join("")}</div>
          <input class="input" data-pj-ans="${q.id}" data-f="other" value="${esc(a.other || "")}" placeholder="Other (optional)" aria-label="Other answer">${q.multi ? `<span class="tiny faint">Choose any that apply.</span>` : ""}`
        : q.kind === "date" ? `<input class="input mono" type="date" data-pj-ans="${q.id}" data-f="text" value="${esc(a.text || "")}" min="${PL.today_()}" aria-labelledby="q-${q.id}" style="max-width:220px">`
        : `<input class="input" data-pj-ans="${q.id}" data-f="text" value="${esc(a.text || "")}" aria-labelledby="q-${q.id}" placeholder="A short answer">`}
    </div></section>`;
  }

  function step3() {
    const P = W.plan;
    if (!P) return `<section class="panel"><div class="empty"><p>Answer the questions first.</p></div></section>`;
    const placed = placeDates(P.milestones, W.deadline, W.hours);
    const rules = W.deadline ? PL.milestoneRules(placed.rows.map((m, k) => ({ id: "pm" + k, name: m.name, date: m.date, hours: m.est_hours })), { id: "pj-new", date: W.deadline }) : null;
    const cm = (sec) => (W.comments || []).filter((c) => c.section === sec).map((c) => `<p class="pj-comment">${icon("message-square")} ${esc(c.note)}</p>`).join("");
    const regen = (sec) => (W.mode === "write" && !W.drafted) ? "" : `<button class="btn btn-sm btn-ghost" type="button" data-pj="regen" data-v="${sec}" ${W.regenLeft > 0 && !W.loading ? "" : "disabled"} title="${W.regenLeft} left for this plan">${icon("refresh-cw")}Regenerate this section</button>`;
    const sec = (key, h, body) => `<section class="panel pj-sec" aria-labelledby="ps-${key}"><div class="panel-head"><h2 id="ps-${key}">${h}</h2>${regen(key)}</div><div class="panel-body stack-sm">${cm(key)}${body}</div></section>`;
    const bullets = (field) => `${P[field].map((b, k) => `<div class="bl"><span aria-hidden="true">•</span><input class="input" data-pj-p="${field}" data-k="${k}" value="${esc(b)}" aria-label="${field === "scope_in" ? "In scope" : "Out for now"} item ${k + 1}"><button class="icon-btn" type="button" data-pj="bl-del" data-v="${field}:${k}" aria-label="Remove">${icon("x")}</button></div>`).join("")}<button class="linkish" type="button" data-pj="bl-add" data-v="${field}">${icon("plus")}Add</button>`;
    return `<div class="step-label"><span class="label-up">Step 3 of 3 · Your plan (draft)</span><span class="small muted">${W.regenLeft} regeneration${W.regenLeft === 1 ? "" : "s"} left</span></div>
      ${W.mode === "write" && !W.drafted ? `<div class="note">${icon("pencil-line")}<div>You plan well already, so this starts empty. Write your milestones first, then press <b>Review my plan</b> for comments. <b>Show me a draft</b> is always there.</div></div>` : ""}
      ${W.fallback2 ? `<div class="note warn">${icon("triangle-alert")}<div>The assistant is unavailable, so here's an empty plan to fill in. Nothing is blocked.</div></div>` : ""}
      ${sec("goal", "Goal", `<input class="input" data-pj-p="goal" value="${esc(P.goal)}" aria-label="Goal" placeholder="One sentence: outcome + deadline">`)}
      ${sec("scope", "Scope", `<div class="pj-two"><div><div class="label-up">In</div>${bullets("scope_in")}</div><div><div class="label-up">Out for now</div>${bullets("scope_out")}</div></div>`)}
      ${sec("minimum", "Minimum version", `<input class="input" data-pj-p="minimum_version" value="${esc(P.minimum_version)}" aria-label="Minimum version" placeholder="What to ship if time runs short">`)}
      ${sec("milestones", "Milestones", `<div class="table-wrap"><table class="data pj-ms"><thead><tr><th>Name</th><th>What "done" means</th><th>Est. hours</th><th>Target date</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>
          ${placed.rows.map((m, k) => `<tr><td><input class="input" data-pj-m="${k}" data-f="name" value="${esc(m.name)}" aria-label="Milestone ${k + 1} name"></td><td><input class="input" data-pj-m="${k}" data-f="done_when" value="${esc(m.done_when)}" aria-label="Milestone ${k + 1}: what done means"></td><td><input class="input mono hrs" type="number" min="0.5" step="0.5" data-pj-m="${k}" data-f="est_hours" value="${m.est_hours}" aria-label="Milestone ${k + 1} hours"></td><td class="mono small" data-pj-date="${k}" data-date="${m.date}">${fmt(m.date)}</td><td><button class="icon-btn" type="button" data-pj="m-del" data-v="${k}" aria-label="Remove milestone">${icon("trash-2")}</button></td></tr>`).join("")}
        </tbody></table></div>
        <div class="row"><button class="btn btn-sm" type="button" data-pj="m-add">${icon("plus")}Add milestone</button><span class="tiny faint">Dates are set by rules, backward from ${W.deadline ? `the deadline (${fmt(W.deadline)})` : "a deadline"}: the last milestone at least 2 days before it, hours spread over your free time at ${W.hours} h a week.</span></div>
        <div data-pj-rules>${msRules(placed, rules)}</div>`)}
      ${sec("first", "First step today", `<div class="pj-first"><input class="input" data-pj-p="first_step.text" value="${esc(P.first_step.text)}" aria-label="First step"><span class="mins"><input class="input mono" type="number" min="25" max="45" data-pj-p="first_step.minutes" value="${P.first_step.minutes}" aria-label="Minutes"><span class="tiny faint">min</span></span><button class="btn btn-sm" type="button" data-pj="first-add" ${W.firstAdded ? "disabled" : ""}>${W.firstAdded ? `${icon("check")}Added` : `${icon("calendar-plus")}Add to today's plan`}</button></div>`)}
      ${sec("risks", "Risks", `${P.risks.map((r, k) => `<div class="pj-risk"><input class="input" data-pj-r="${k}" data-f="risk" value="${esc(r.risk)}" aria-label="Risk ${k + 1}" placeholder="Risk"><input class="input" data-pj-r="${k}" data-f="mitigation" value="${esc(r.mitigation)}" aria-label="Mitigation ${k + 1}" placeholder="What you'll do about it"></div>`).join("")}${P.risks.length < 3 ? `<button class="linkish" type="button" data-pj="risk-add">${icon("plus")}Add a risk</button>` : ""}`)}
      ${sec("skills", "Skills you'll practise", `<div class="chips">${P.skills.map((id) => `<a class="chip" href="#/skills">${esc(skillName(id))}</a>`).join("") || `<span class="small faint">None yet.</span>`}</div>`)}
      <p class="small muted pj-note">${icon("info")} This is a draft. Change anything; it's your project.</p>
      <div class="wiz-foot"><button class="btn" type="button" data-pj="back2">${icon("arrow-left")}Back</button>
        <span class="row">${W.mode === "write" ? `<button class="btn" type="button" data-pj="review" ${W.loading ? "disabled" : ""}>${icon("message-square")}Review my plan</button>${W.drafted ? "" : `<button class="btn btn-ghost" type="button" data-pj="show-draft" ${W.loading ? "disabled" : ""}>Show me a draft</button>`}` : ""}
        <button class="btn btn-primary" type="button" data-pj="accept" ${W.loading ? "disabled" : ""}>${icon("check")}Accept plan</button></span></div>`;
  }
  function msRules(placed, rules) {
    const out = [];
    if (!W.deadline) out.push(`<div class="rule-panel"><span class="ptag warn">Deadline</span><span>Add a deadline in step 2 so the dates can be placed.</span></div>`);
    if (placed.tight) out.push(`<div class="rule-panel"><span class="ptag warn">Tight</span><span>At ${W.hours} h a week these milestones don't fit before the deadline. Add hours, cut scope or move the deadline.</span></div>`);
    (rules ? rules.cramming : []).forEach((c) => out.push(`<div class="rule-panel"><span class="ptag warn">Cramming</span><span>Week of ${PL.dateLabel(c.week).slice(4)}: ${c.planned} h planned, ${c.free} h free. Spread it out?</span></div>`));
    return out.join("") || `<div class="rule-panel ok"><span class="ptag ok">Looks good</span><span>The last milestone is at least 2 days before the deadline and every week fits your free time.</span></div>`;
  }

  function page(id) {
    const p = db.projects.find((x) => x.id === id);
    if (!p) return `<section class="panel"><div class="empty"><p>Project not found.</p><a class="btn" href="#/project">Back to projects</a></div></section>`;
    const ms = p.plan.milestones, next = ms.find((m) => !m.done);
    const planned = ms.reduce((s, m) => s + m.est_hours, 0), doneH = Math.round(p.hours_done * 10) / 10;
    const monday = new Date(PL.today_() + "T00:00:00Z").getUTCDay() === 1 && next && !db.weeklyDone[p.id];
    return `<div class="page-head"><div><div class="row"><a class="btn btn-ghost btn-sm back" href="#/project">${icon("arrow-left")}Projects</a></div><h1 style="margin-top:6px">${esc(title(p))}</h1><p>${esc(p.plan.goal)}</p></div>
        <div class="page-actions"><button class="btn btn-sm" type="button" data-pj="ics" data-v="${p.id}">${icon("calendar-plus")}Export .ics</button><button class="btn btn-sm" type="button" data-pj="md" data-v="${p.id}">${icon("file-text")}Export Markdown</button></div></div>
      ${monday ? `<div class="banner info" role="status">${icon("calendar-check")}<span>Still on track for "${esc(next.name)}"?</span>${st.reDate === p.id ? `<input class="input mono" type="date" data-pj-in="redate" value="${next.date}" style="max-width:170px" aria-label="New date"><button class="btn btn-sm btn-primary" type="button" data-pj="redate-save" data-v="${p.id}">Save</button>` : `<button class="btn btn-sm btn-primary" type="button" data-pj="ontrack" data-v="${p.id}">Yes</button><button class="btn btn-sm" type="button" data-pj="redate" data-v="${p.id}">Re-date</button>`}</div>` : ""}
      <div class="pj-page">
        <section class="panel" aria-labelledby="pm-h"><div class="panel-head"><h2 id="pm-h">Milestones</h2><span class="sub">${ms.filter((m) => m.done).length} of ${ms.length} done</span></div>
          <div class="panel-body checklist">${ms.map((m, k) => `<div class="crow ${m.done ? "is-done" : ""}"><button class="tick" type="button" data-pj="ms-tick" data-v="${p.id}:${k}" aria-pressed="${!!m.done}" aria-label="${m.done ? "Done" : "Mark done"}: ${esc(m.name)}">${m.done ? icon("check") : ""}</button><span class="mono small ct-time">${fmt(m.date).slice(4)}</span><span class="ct-text"><span class="ct-name">${esc(m.name)}</span><span class="tiny faint">${esc(m.done_when)} · ${m.est_hours} h</span></span></div>`).join("")}</div></section>
        <div class="stack" style="gap:16px">
          ${next ? `<section class="panel next-ms" aria-labelledby="nm-h"><div class="panel-body stack-sm"><div class="label-up" id="nm-h">Next milestone</div><h2>${esc(next.name)}</h2><p class="small muted">${esc(next.done_when)} · due <span class="mono">${fmt(next.date)}</span></p>
            <div><button class="btn btn-primary btn-sm" type="button" data-pj="plan-task" data-v="${p.id}">${icon("calendar-plus")}Plan a task for it</button></div></div></section>` : `<section class="panel"><div class="panel-body"><p class="small">${icon("party-popper")} Every milestone is done.</p></div></section>`}
          <section class="panel" aria-labelledby="hr-h"><div class="panel-head"><h2 id="hr-h">Hours</h2><span class="sub">planned vs done</span></div>
            <div class="panel-body"><ul class="wk-bars"><li title="${doneH} of ${planned} h done"><span class="wk-l mono small">done</span><span class="wk-track"><span class="wk-fill" style="width:${Math.min(100, (doneH / planned) * 100)}%"></span></span><span class="wk-v small"><b>${doneH} h</b> <span class="faint">of ${planned} h planned</span></span></li></ul>
              <p class="tiny faint">Done hours come from ticked plan tasks linked to this project.</p></div></section>
          <section class="panel" aria-labelledby="sk-h"><div class="panel-head"><h2 id="sk-h">Skills you'll practise</h2></div><div class="panel-body chips">${p.plan.skills.map((id) => `<a class="chip" href="#/skills">${esc(skillName(id))}</a>`).join("")}</div></section>
        </div>
      </div>${PL.proto()}`;
  }

  // ---------- behaviour ----------
  function bind(root, parts) {
    const box = root.querySelector("[data-project]"); if (!box) return;
    const gen = SX.gen(), alive = () => SX.stillOn(gen);
    const rr = () => { const a = document.activeElement, id = a && a.id; SX.render(); if (id) document.getElementById(id)?.focus({ preventScroll: true }); };
    const [route] = parts.path;
    if (route === "new" && W.step === 3 && !W.plan) W.step = 2;

    box.addEventListener("input", (e) => {
      const t = e.target, d = t.dataset;
      if (d.pjIn === "idea") { W.idea = t.value; const len = t.value.trim().length, ok = len >= 20 && len <= 1000; box.querySelector("[data-pj-count]").textContent = `${len} / 1,000 characters${len < 20 ? " · at least 20" : ""}`; const b = box.querySelector('[data-pj="to2"]'); if (b) b.disabled = !ok; box.querySelector("[data-pj-why]").textContent = ok ? "" : "Describe the idea in at least 20 characters."; }
      if (d.pjIn === "deadline") W.deadline = t.value;
      if (d.pjIn === "hours") W.hours = Math.max(1, +t.value || 1);
      if (d.pjIn === "learn") W.learn = t.value;
      if (d.pjAns) { const a = (W.answers[d.pjAns] = W.answers[d.pjAns] || {}); a[d.f] = t.value; if (d.pjAns === "deadline") W.deadline = t.value; }
      if (d.pjP) { if (d.pjP.startsWith("first_step.")) W.plan.first_step[d.pjP.split(".")[1]] = d.pjP.endsWith("minutes") ? +t.value : t.value; else if (d.k !== undefined) W.plan[d.pjP][+d.k] = t.value; else W.plan[d.pjP] = t.value; }
      if (d.pjR) W.plan.risks[+d.pjR][d.f] = t.value;
      if (d.pjM) {
        W.plan.milestones[+d.pjM][d.f] = d.f === "est_hours" ? +t.value : t.value;
        if (d.f === "est_hours") { // dates are recomputed by the rules as hours change
          const placed = placeDates(W.plan.milestones, W.deadline, W.hours);
          placed.rows.forEach((m, k) => { const c = box.querySelector(`[data-pj-date="${k}"]`); if (c) { c.textContent = fmt(m.date); c.dataset.date = m.date; } });
          const rules = W.deadline ? PL.milestoneRules(placed.rows.map((m, k) => ({ id: "pm" + k, name: m.name, date: m.date, hours: m.est_hours })), { id: "pj-new", date: W.deadline }) : null;
          box.querySelector("[data-pj-rules]").innerHTML = msRules(placed, rules); SX.icons();
        }
      }
      if (d.pjIn === "redate") st.reDateValue = t.value;
    });

    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-pj]"); if (!b) return;
      const a = b.dataset.pj, v = b.dataset.v;
      if (a === "start") { W = newWizard(); }
      if (a === "type") { W.type = v; return rr(); }
      if (a === "to2") {
        W.loading = true; rr();
        await sleep(700); if (!alive()) { W.loading = false; return; }
        const r = j1(W); W.questions = r.questions; W.fallback = !!r.fallback; W.loading = false; W.step = 2;
        if (r.fallback && db.j1Left <= 0 && !PL.elmDown()) toast("You've used today's questions; here are general ones.");
        return rr();
      }
      if (a === "back1") { W.step = 1; return rr(); }
      if (a === "skip") { const x = (W.answers[v] = W.answers[v] || {}); x.skipped = !x.skipped; return rr(); }
      if (a === "chip") { const [qid, opt] = v.split("::"); const q = W.questions.find((x) => x.id === qid), x = (W.answers[qid] = W.answers[qid] || {}); const cur = new Set(x.chips || []); if (cur.has(opt)) cur.delete(opt); else { if (!q.multi) cur.clear(); cur.add(opt); } x.chips = [...cur]; return rr(); }
      if (a === "build") {
        if (PL.competent()) { W.plan = emptyPlan(); W.mode = "write"; W.drafted = false; W.step = 3; return rr(); }
        W.mode = "draft"; W.loading = true; rr();
        await sleep(1600); if (!alive()) { W.loading = false; return; }
        draft(); W.loading = false; W.step = 3; return rr();
      }
      if (a === "show-draft") { W.loading = true; rr(); await sleep(1200); if (!alive()) { W.loading = false; return; } draft(); W.drafted = true; W.loading = false; return rr(); }
      if (a === "review") {
        W.loading = true; rr(); await sleep(900); if (!alive()) { W.loading = false; return; }
        if (PL.elmDown() || db.j2Left <= 0) { W.comments = [{ section: "goal", note: PL.elmDown() ? "Comments are unavailable right now. Your plan is saved as you write it." : "You've used today's plan reviews." }]; }
        else { db.j2Left--; W.comments = j2Review(W, W.plan); }
        W.loading = false; return rr();
      }
      if (a === "regen") {
        if (W.regenLeft <= 0) return;
        if (PL.elmDown() || db.j2Left <= 0) { toast(PL.elmDown() ? "Regenerating is unavailable right now. Edit the section instead." : "You've used today's plan drafts."); return; }
        db.j2Left--; W.regenLeft--; W.variant[v] = (W.variant[v] || 0) + 1;
        const fresh = j2Draft(W, W.variant[v]);
        const map = { goal: ["goal"], scope: ["scope_in", "scope_out"], minimum: ["minimum_version"], milestones: ["milestones"], first: ["first_step"], risks: ["risks"], skills: ["skills"] };
        if (v === "milestones" && W.variant[v] % 2) fresh.milestones = fresh.milestones.map((m, k) => ({ ...m, est_hours: Math.max(1, m.est_hours + (k % 2 ? 1 : -1)) }));
        map[v].forEach((k) => (W.plan[k] = fresh[k]));
        toast("Section regenerated."); return rr();
      }
      if (a === "back2") { W.step = 2; return rr(); }
      if (a === "bl-add") { W.plan[v].push(""); return rr(); }
      if (a === "bl-del") { const [f, k] = v.split(":"); W.plan[f].splice(+k, 1); if (!W.plan[f].length) W.plan[f].push(""); return rr(); }
      if (a === "m-add") { W.plan.milestones.push({ name: "", done_when: "", est_hours: 2 }); return rr(); }
      if (a === "m-del") { W.plan.milestones.splice(+v, 1); return rr(); }
      if (a === "risk-add") { W.plan.risks.push({ risk: "", mitigation: "" }); return rr(); }
      if (a === "first-add") {
        const f = W.plan.first_step; if (!f.text.trim()) { toast("Write the first step first."); return; }
        PL.addTask({ text: f.text, mins: Math.min(45, Math.max(25, +f.minutes || 30)), time: "16:00" }); W.firstAdded = true; toast("Added to today's plan."); return rr();
      }
      if (a === "accept") {
        const P = W.plan;
        const ms = placeDates(P.milestones.filter((m) => m.name.trim()), W.deadline, W.hours).rows;
        if (!ms.length) { toast("Add at least one milestone."); return; }
        const id = "pj-" + Date.now().toString(36);
        const deadline = W.deadline ? { course: "Project", item: shortTitle(W.idea), date: W.deadline, time: "17:00" } : null;
        db.projects.unshift({ id, status: "active", type: W.type, hours_per_week: W.hours, created: PL.today_(), idea: W.idea, learn_goal: W.learn, deadline, plan: { ...P, milestones: ms.map((m) => ({ ...m, done: false })), scope_in: P.scope_in.filter(Boolean), scope_out: P.scope_out.filter(Boolean), risks: P.risks.filter((r) => r.risk.trim()) }, hours_planned: ms.reduce((s, m) => s + m.est_hours, 0), hours_done: 0 });
        SX.emit && SX.emit("project_accepted", { id, milestones: ms.length });
        toast(deadline ? "Plan accepted. Its milestones show on Today under Project targets." : "Plan accepted. Add a deadline to date the milestones.");
        W = newWizard(); location.hash = `#/project/${id}`; return;
      }
      // project page
      if (a === "ms-tick") { const [pid, k] = v.split(":"); const p = db.projects.find((x) => x.id === pid), m = p.plan.milestones[+k]; m.done = !m.done; p.hours_done = Math.max(0, p.hours_done + (m.done ? m.est_hours : -m.est_hours)); return rr(); }
      if (a === "plan-task") { const p = db.projects.find((x) => x.id === v), next = p.plan.milestones.find((m) => !m.done); PL.addTask({ text: `${next.name}: work for 45 min`, mins: 45, time: "16:00", project: p.id }); toast(`Added to today's plan: "${next.name}".`); return; }
      if (a === "ontrack") { db.weeklyDone[v] = true; toast("Great. See you next Monday."); return rr(); }
      if (a === "redate") { st.reDate = v; return rr(); }
      if (a === "redate-save") { const p = db.projects.find((x) => x.id === v), next = p.plan.milestones.find((m) => !m.done); if (st.reDateValue) next.date = st.reDateValue; st.reDate = null; db.weeklyDone[v] = true; toast(`Re-dated to ${fmt(next.date)}.`); return rr(); }
      if (a === "ics") return exportIcs(db.projects.find((x) => x.id === v));
      if (a === "md") return exportMd(db.projects.find((x) => x.id === v));
    });

    function draft() {
      if (PL.elmDown() || db.j2Left <= 0) { W.plan = emptyPlan(); W.fallback2 = true; if (!PL.elmDown()) toast("You've used today's plan drafts; here's an empty plan to fill in."); return; }
      db.j2Left--; W.fallback2 = false; W.plan = j2Draft(W, 0);
    }
  }

  function download(name, type, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportIcs(p) {
    const ev = p.plan.milestones.filter((m) => m.date).map((m, k) => `BEGIN:VEVENT\r\nUID:${p.id}-${k}@socratix\r\nDTSTAMP:${PL.today_().replace(/-/g, "")}T000000\r\nDTSTART;VALUE=DATE:${m.date.replace(/-/g, "")}\r\nSUMMARY:${(title(p) + ": " + m.name).replace(/[,;]/g, "\\$&")}\r\nEND:VEVENT`).join("\r\n");
    download(`${p.id}-milestones.ics`, "text/calendar", `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Socratix//Project//EN\r\n${ev}\r\nEND:VCALENDAR\r\n`);
    toast("Milestones exported (.ics).");
  }
  function exportMd(p) {
    const P = p.plan;
    const md = `# ${title(p)}\n\n**Goal:** ${P.goal}\n\n## Scope\n**In**\n${P.scope_in.map((x) => `- ${x}`).join("\n")}\n\n**Out for now**\n${P.scope_out.map((x) => `- ${x}`).join("\n")}\n\n## Minimum version\n${P.minimum_version}\n\n## Milestones\n| Milestone | Done when | Hours | Target |\n|---|---|---|---|\n${P.milestones.map((m) => `| ${m.done ? "✓ " : ""}${m.name} | ${m.done_when} | ${m.est_hours} | ${m.date || "—"} |`).join("\n")}\n\n## First step\n${P.first_step.text} (${P.first_step.minutes} min)\n\n## Risks\n${P.risks.map((r) => `- **${r.risk}**: ${r.mitigation}`).join("\n")}\n\n## Skills\n${P.skills.map((id) => `- ${skillName(id)}`).join("\n")}\n`;
    download(`${p.id}.md`, "text/markdown", md); toast("Plan exported (Markdown).");
  }

  // v6 C9: project milestones stay in Project; Today lists the ones due within 7 days as "Project targets"
  SX.projectTargets = (date) => {
    const end = addDays(date, 7);
    return db.projects.filter((p) => p.status === "active").flatMap((p) => p.plan.milestones.filter((m) => !m.done && m.date && m.date >= date && m.date <= end)
      .map((m) => ({ name: m.name, date: m.date, project: p.deadline ? p.deadline.item : shortTitle(p.idea) }))).sort((a, b) => a.date.localeCompare(b.date));
  };
  return { meta, render, bind, _db: db, placeDates };
};
