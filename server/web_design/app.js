// Socratix — clickable design prototype. Hash-routed, sample data only, no network calls.
(() => {
  "use strict";

  const D = window.SAMPLE;

  // ---------- state (would come from the API in the real app) ----------
  const state = {
    role: "student",
    navOpen: false,
    plan: {
      text: D.plan.text,
      horizon: D.plan.time_horizon,
      proposed: true,
      loading: false,
      selected: new Set(D.plan.confirmed_skill_ids),
      added: [],
      confirmed: false,
    },
    dash: { generating: null },
    skills: { view: "graph", selected: "python.conditionals", challenged: false },
    learn: {
      code: D.starterCode,
      explanation: "I used == 0 for sold out, then < 3 for low.",
      job: "done",           // idle | queued | running | done
      outcome: "fail",       // fail | pass | unavailable | uncertain
      attempt: 1,
      hintsUsed: 2,
      revealArmed: false,
      revealed: false,
      revealAck: false,
    },
    project: { tab: "design", milestone: "M3", hintsUsed: 1 },
    reflection: { step: "write", confidence: 40, difficulty: "hard", evidence: true, tags: new Set(["python.conditionals"]) },
    review: { filter: "all", selected: "rv-1", decisions: {} },
    settings: { evidence: true, research: false },
    theme: (() => { try { return localStorage.getItem("socratix-theme") === "light" ? "light" : "dark"; } catch { return "dark"; } })(),
  };
  document.documentElement.dataset.theme = state.theme;

  // ---------- helpers ----------
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n, extra = "") => `<i data-lucide="${n}" ${extra}></i>`;
  const skill = (id) => D.skills.find((s) => s.skill_id === id) || { skill_id: id, name: id.replace("python.", "").replace(/_/g, " ") };
  const chip = (id, cls = "") => `<span class="chip ${cls}">${esc(id)}</span>`;
  const themeToggle = () => `<div class="theme-toggle" role="group" aria-label="Colour mode">${[["dark", "moon", "Dark mode"], ["light", "sun", "Light mode"]].map(([m, ic, l]) => `<button type="button" data-theme-set="${m}" aria-pressed="${state.theme === m}" aria-label="${l}" title="${l}">${icon(ic)}</button>`).join("")}</div>`;
  const idx = (v) => (v == null ? "—" : v.toFixed(2));
  const ACTIVITY = { single_skill_exercise: "Single-skill exercise", multi_skill_exercise: "Multi-skill exercise", project: "Project" };
  const STAGE = { recall: "Recall", understanding: "Understanding", transfer: "Transfer" };
  const STAGE_CLS = { recall: "b-recall", understanding: "b-understand", transfer: "b-transfer" };
  const stageBadge = (s) => `<span class="badge ${STAGE_CLS[s]}">${STAGE[s]}</span>`;
  const conf = (l) => `<span class="conf" data-l="${l}" title="Uncalibrated label"><i><b></b><b></b><b></b></i>${l}</span>`;

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function hlPy(src) {
    const re = /(#.*$)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(\d+)\b|\b(def|return|if|elif|else|for|while|in|not|and|or|None|True|False|import|from)\b|\b([A-Za-z_]\w*)(?=\()/gm;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const cls = m[1] ? "tok-com" : m[2] ? "tok-str" : m[3] ? "tok-num" : m[4] ? "tok-kw" : "tok-fn";
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }

  // ---------- routing ----------
  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "#/dashboard" },
    { id: "plan", label: "Plan", icon: "target", href: "#/plan" },
    { id: "skills", label: "Skills", icon: "network", href: "#/skills" },
    { id: "learn", label: "Exercise", icon: "book-open-check", href: "#/learn/stock-status", count: "1" },
    { id: "projects", label: "Project", icon: "folder-kanban", href: "#/projects/cafe-terminal" },
    { id: "reflection", label: "Reflection", icon: "notebook-pen", href: "#/reflection" },
  ];

  const ROUTES = {
    dashboard: { title: "Dashboard", render: pageDashboard },
    plan: { title: "Plan", render: pagePlan },
    skills: { title: "Skills", render: pageSkills },
    learn: { title: "Stock classifier", parent: "Exercise", render: pageLearn },
    projects: { title: "Campus Café Terminal", parent: "Project", render: pageProject },
    reflection: { title: "Reflection", render: pageReflection },
    review: { title: "Review queue", parent: "Instructor", render: pageReview },
    settings: { title: "Settings", render: pageSettings },
  };

  function currentRoute() {
    const seg = (location.hash.replace(/^#\/?/, "").split("/")[0] || "dashboard");
    if (seg === "login") return "login";
    return ROUTES[seg] ? seg : "dashboard";
  }

  function render(focus = false) {
    const id = currentRoute();
    if (id === "login") {
      app.innerHTML = pageLogin();
    } else {
      const r = ROUTES[id];
      app.innerHTML = shell(id, r, r.render());
    }
    bind(id);
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    if (focus) {
      const h = app.querySelector("h1");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener("hashchange", () => { routeGen++; state.navOpen = false; render(true); });

  // ---------- shell ----------
  function shell(id, r, body) {
    const person = state.role === "instructor" ? D.instructor : D.student;
    const pending = D.reviewQueue.filter((q) => !state.review.decisions[q.id]).length;
    const link = (n) => `<a href="${n.href}" ${n.id === id ? 'aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span>${n.count ? `<span class="count">${n.count}</span>` : ""}</a>`;
    return `
    <div class="shell">
      <aside class="rail ${state.navOpen ? "open" : ""}" aria-label="Main">
        <div class="brand">
          <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="none" style="stroke:var(--line-2)"/><circle cx="10" cy="11" r="3.5" fill="none" style="stroke:var(--ink)" stroke-width="1.6"/><circle cx="22" cy="11" r="3.5" fill="none" style="stroke:var(--ink)" stroke-width="1.6"/><circle cx="16" cy="22" r="3.5" style="fill:var(--ink)"/><path d="M12.3 13.6 14.5 19M19.7 13.6 17.5 19" style="stroke:var(--ink)" stroke-width="1.6"/></svg>
          <span class="brand-name">Socratix</span>
        </div>
        <nav class="nav">
          <div class="nav-group">${NAV.map(link).join("")}</div>
          ${state.role === "instructor" ? `<div class="nav-group"><div class="nav-title">Instructor</div>${link({ id: "review", label: "Review queue", icon: "shield-check", href: "#/review", count: String(pending) })}</div>` : ""}
          <div class="nav-group"><div class="nav-title">Account</div>${link({ id: "settings", label: "Settings & privacy", icon: "settings", href: "#/settings" })}</div>
        </nav>
        <div class="rail-foot">
          <div class="field">
            <span class="label tiny faint" id="role-l">Prototype: view as</span>
            <div class="seg" role="group" aria-labelledby="role-l">
              <button type="button" data-role="student" aria-pressed="${state.role === "student"}">Student</button>
              <button type="button" data-role="instructor" aria-pressed="${state.role === "instructor"}">Instructor</button>
            </div>
          </div>
          <div class="who">
            <span class="avatar" aria-hidden="true">${person.initials}</span>
            <div><div class="small">${esc(person.name)}</div><small>${state.role === "instructor" ? "Instructor" : esc(D.student.course)}</small></div>
          </div>
          <a class="btn btn-ghost btn-sm" href="#/login" style="justify-content:flex-start;padding-left:0">${icon("log-out")}Sign out</a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-sm menu-btn" type="button" data-act="nav" aria-label="Open navigation" aria-expanded="${state.navOpen}">${icon("menu")}</button>
          <div class="crumbs">${r.parent ? `<span class="hide-sm">${r.parent}</span>${icon("chevron-right", 'class="hide-sm"')}` : ""}<b>${r.title}</b></div>
          <span class="spacer"></span>
          <span class="sample-pill" title="All names, numbers and activity on these screens are synthetic.">${icon("flask-conical")}<span>Sample data<span class="long"> · design prototype</span></span></span>
          ${themeToggle()}
        </header>
        <main id="content" class="page fade-in">${body}</main>
      </div>
    </div>`;
  }

  // ---------- dashboard ----------
  function scoreDiagram(t, weights) {
    const rows = [
      { k: "Planning", w: weights.planning, v: t.features.P, why: "Matches your confirmed plan" },
      { k: "Knowledge gap", w: weights.gap, v: t.features.G, why: "Recent transfer difficulty" },
      { k: "Retention", w: weights.retention, v: t.features.R, why: "Loops check due today" },
    ];
    return `
    <div class="score-diagram" role="group" aria-label="How the priority index is computed">
      <div class="score-inputs">
        ${rows.map((r) => `<div class="node"><span>${r.k} <span class="w">× ${r.w.toFixed(2)}</span></span><span class="v">${r.v.toFixed(2)}</span><span class="why">${r.why}</span></div>`).join("")}
      </div>
      <svg class="score-wires" viewBox="0 0 64 210" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 35 C 32 35, 32 105, 64 105"/><path d="M0 105 L 64 105"/><path d="M0 175 C 32 175, 32 105, 64 105"/>
      </svg>
      <div class="node score-out">
        <div class="big">${t.priority_score.toFixed(2)}</div>
        <div class="lbl">priority index<br>uncalibrated heuristic,<br>not a mastery probability</div>
      </div>
    </div>`;
  }

  function pageDashboard() {
    const sel = D.selection;
    const top = sel.ranked_targets[0];
    const gen = state.dash.generating;
    const steps = ["queued", "running", "succeeded"];
    const genIdx = gen ? steps.indexOf(gen) : -1;
    const attention = Object.entries(D.estimates).filter(([, e]) => e.gap_priority_index != null && e.gap_priority_index > 0.5);
    return `
    <div class="page-head">
      <div>
        <h1>Good afternoon, Sam</h1>
        <p>One retention check is due today and your stock classifier attempt is waiting for a resubmit.</p>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/plan">${icon("target")}Edit plan</a>
        <a class="btn" href="#/learn/stock-status">${icon("book-open-check")}Resume exercise</a>
      </div>
    </div>

    <div class="grid-dash">
      <div class="stack">
        <section class="panel" aria-labelledby="rec-h">
          <div class="panel-head">
            <h2 id="rec-h">Recommended next</h2>
            <span class="row"><span class="chip dashed" title="Selector policy version">${sel.policy_version}</span></span>
          </div>
          <div class="panel-body">
            <div class="rec-title">
              <h2>${top.skill_ids.map((s) => skill(s).name).join(" + ")}</h2>
              <span class="badge b-neutral plain">${ACTIVITY[top.activity_type]}</span>
              <span class="badge b-transfer">Transfer</span>
            </div>
            <p class="muted" style="margin-top:6px">${esc(top.explanation)}</p>
            <div class="row" style="margin-top:10px">${top.skill_ids.map((s) => chip(s)).join("")}</div>
            ${scoreDiagram(top, sel.weights)}
            <div class="row between">
              <div class="row">
                <button class="btn btn-primary ${gen && gen !== "succeeded" ? "is-loading" : ""}" type="button" data-act="generate" ${gen && gen !== "succeeded" ? "disabled" : ""}>${gen ? (gen === "succeeded" ? `${icon("play")}Open exercise` : "Generating") : `${icon("play")}Start this exercise`}</button>
                <button class="btn btn-ghost" type="button" data-act="toggle-override" aria-expanded="false" aria-controls="override">${icon("git-branch")}Choose something else</button>
              </div>
              ${gen ? `<div class="job" role="status" aria-live="polite"><span class="faint">Generation job</span><span class="job-steps">${steps.map((s, i) => `<span class="${i < genIdx || gen === "succeeded" ? "done" : i === genIdx ? "on" : ""}">${s}</span>`).join("")}</span></div>` : `<span class="tiny faint">Weights 0.40 / 0.35 / 0.25 are a configurable default, not a validated policy.</span>`}
            </div>
            <div class="override" id="override" hidden style="margin-top:16px">
              <div class="label">You decide what to study. Pick a different target:</div>
              <div class="row" style="margin-top:8px">
                <select class="select" style="max-width:280px" aria-label="Different target skill">
                  ${D.skills.map((s) => `<option ${s.skill_id === "python.lists" ? "selected" : ""}>${s.skill_id}</option>`).join("")}
                </select>
              </div>
              <p class="small muted" style="margin-top:8px">If prerequisites look missing, Socratix offers support instead of blocking you.</p>
              <div class="override-opts">
                <button class="btn btn-sm" type="button" data-toast="Override saved. Starting your choice anyway.">Start anyway</button>
                <button class="btn btn-sm" type="button" data-toast="Integrated prep added: a short warm-up joins the task.">Integrated prep</button>
                <button class="btn btn-sm" type="button" data-toast="Quick diagnostic queued (3 questions).">Quick diagnostic</button>
              </div>
            </div>
            <div class="alts" style="margin-top:18px">
              <div class="small faint" style="padding-bottom:8px">Other ranked options</div>
              ${sel.ranked_targets.slice(1).map((t) => `
                <div class="alt">
                  <div><div class="small" style="font-weight:500">${t.skill_ids.map((s) => skill(s).name).join(" + ")} <span class="faint" style="font-weight:400">· ${ACTIVITY[t.activity_type]}</span></div><div class="tiny faint">${t.reasons.join(" · ")}</div></div>
                  <span class="mono small muted alt-score" title="Uncalibrated priority index">${t.priority_score.toFixed(3)}</span>
                  <button class="btn btn-sm" type="button" data-toast="Override recorded. The selector logs your choice.">Choose</button>
                </div>`).join("")}
            </div>
          </div>
        </section>

        <section class="panel" aria-labelledby="recent-h">
          <div class="panel-head"><h2 id="recent-h">Recent work</h2><span class="sub">Correctness, help and independence are recorded separately</span></div>
          <div class="panel-body table-wrap">
            <table class="data">
              <thead><tr><th>Activity</th><th class="hide-sm">Stage</th><th>Result</th><th class="hide-sm">Help used</th><th>Evidence</th></tr></thead>
              <tbody>
                ${D.recent.map((r) => `
                <tr>
                  <td><a href="${r.href}">${esc(r.title)}</a><div class="tiny faint">${ACTIVITY[r.activity]} · ${r.when}</div></td>
                  <td class="hide-sm">${stageBadge(r.stage)}</td>
                  <td><span class="badge ${r.status === "pass" ? "b-pass" : r.status === "fail" ? "b-fail" : "b-neutral"}">${r.result}</span></td>
                  <td class="hide-sm muted nw">${r.help}</td>
                  <td>${r.independent === true ? `<span class="small inline-ic">${icon("circle-check")}Independent</span>` : r.independent === false ? `<span class="small muted">Assisted</span>` : `<span class="small faint">Pending</span>`}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="panel" aria-labelledby="goal-h">
          <div class="panel-head"><h2 id="goal-h">Current goal</h2><span class="badge b-neutral plain">This week</span></div>
          <div class="panel-body stack-sm">
            <p class="goal-text">“${esc(D.plan.text)}”</p>
            <div class="row">${D.plan.confirmed_skill_ids.map((s) => chip(s)).join("")}</div>
            <p class="tiny faint">Confirmed by you on 23 Oct. Only confirmed tags reach the selector.</p>
          </div>
          <div class="panel-foot"><a class="btn btn-sm" href="#/plan">Edit goal and tags</a></div>
        </section>

        <section class="panel" aria-labelledby="due-h">
          <div class="panel-head"><h2 id="due-h">Unaided checks due</h2><span class="sub">No hints on these</span></div>
          <div class="panel-body">
            ${D.retentionDue.map((d) => `
              <div class="due">
                <span class="due-dot ${d.kind === "later" ? "later" : ""}" aria-hidden="true"></span>
                <div><div class="small" style="font-weight:500">${skill(d.skill_id).name} <span class="faint" style="font-weight:400">· ${d.due}</span></div><div class="tiny faint">${d.reason}</div></div>
                ${d.kind === "now" ? `<button class="btn btn-sm" type="button" data-toast="Reassessment job queued: independent transfer check.">Start</button>` : `<span class="tiny faint">Scheduled</span>`}
              </div>`).join("")}
          </div>
        </section>

        <section class="panel" aria-labelledby="att-h">
          <div class="panel-head"><h2 id="att-h">Worth a look</h2><a class="small" href="#/skills">All skills</a></div>
          <div class="panel-body stack-sm">
            ${attention.map(([id, e]) => `
              <div class="stack-sm" style="gap:8px">
                <div class="row between"><span class="small" style="font-weight:500">${skill(id).name}</span>${conf(e.confidence_label)}</div>
                ${meter("Transfer", e.transfer_index, "var(--transfer)")}
                ${e.hypotheses.map((h) => `<div class="tiny muted">${icon("circle-help")} <b style="font-weight:500;color:var(--ink)">${h.label}</b> · ${h.status}, not a diagnosis</div>`).join("")}
              </div>`).join('<hr class="divider" style="margin:4px 0">')}
          </div>
        </section>
      </div>
    </div>`;
  }

  function meter(label, v, color) {
    return `<div class="meter ${v == null ? "none" : ""}"><span class="muted">${label}</span><span class="track" role="img" aria-label="${label} index ${v == null ? "insufficient evidence" : idx(v)}"><span class="fill" style="width:${v == null ? 0 : v * 100}%;background:${color}"></span></span><span class="val">${v == null ? "n/a" : idx(v)}</span></div>`;
  }

  // ---------- plan ----------
  function pagePlan() {
    const p = state.plan;
    const tags = [...D.planProposal.candidate_tags, ...p.added.map((id) => ({ skill_id: id, confidence_label: "high", provenance: "student_explicit", reason: "Added by you" }))];
    const n = p.selected.size;
    const notInList = D.skills.filter((s) => !tags.some((t) => t.skill_id === s.skill_id));
    return `
    <div class="page-head">
      <div>
        <h1>Plan</h1>
        <p>Say what you want to work on in your own words. Socratix suggests matching skills from the approved catalogue; you confirm, edit or reject every one.</p>
      </div>
      <div class="flow" aria-label="Planning flow">
        <span class="node on">Your goal</span><span class="wire"></span><span class="node ${p.proposed ? "on" : ""}">Suggested tags</span><span class="wire"></span><span class="node ${p.confirmed ? "on" : ""}">You confirm</span><span class="wire"></span><span class="node ${p.confirmed ? "on" : ""}">Selector</span>
      </div>
    </div>

    <div class="plan-layout">
      <section class="panel" aria-labelledby="goal-in">
        <div class="panel-head"><h2 id="goal-in">Your goal</h2></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <div class="field">
            <label for="plan-text">What do you want to be able to do?</label>
            <textarea class="textarea" id="plan-text" rows="4" placeholder="e.g. I want to understand why my loops stop too early">${esc(p.text)}</textarea>
            <span class="hint-text">Plain language is fine. This is your plan, not a test.</span>
          </div>
          <div class="field">
            <span class="label" id="hz">Time horizon</span>
            <div class="seg" role="group" aria-labelledby="hz">
              ${["today", "week", "later"].map((h) => `<button type="button" data-horizon="${h}" aria-pressed="${p.horizon === h}">${h === "week" ? "This week" : h[0].toUpperCase() + h.slice(1)}</button>`).join("")}
            </div>
          </div>
          <div class="row">
            <button class="btn btn-primary ${p.loading ? "is-loading" : ""}" type="button" data-act="suggest">${p.loading ? "Matching skills" : `${icon("wand-sparkles")}Suggest skill tags`}</button>
            <span class="tiny faint">Suggestions never change your profile on their own.</span>
          </div>
          <hr class="divider">
          <div class="stack-sm">
            <h3>Active plan</h3>
            <dl class="kv">
              <dt>Saved</dt><dd>${p.confirmed ? "Just now" : "Thu 23 Oct, 12:00"}</dd>
              <dt>Horizon</dt><dd>${p.horizon === "week" ? "This week" : p.horizon}</dd>
              <dt>Confirmed</dt><dd class="row">${[...(p.confirmed ? p.selected : D.plan.confirmed_skill_ids)].map((s) => chip(s)).join("") || '<span class="faint">None</span>'}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="tags-h" aria-busy="${p.loading}">
        <div class="panel-head"><h2 id="tags-h">Suggested skill tags</h2><span class="sub">${tags.length} candidates · ${n} selected</span></div>
        <div class="panel-body">
          ${p.loading ? `<div class="empty"><p>Matching your goal against approved skills…</p></div>` : !p.proposed ? `<div class="empty">${icon("list-checks")}<p>Write a goal and press <b>Suggest skill tags</b>. You will see why each skill was suggested before anything is saved.</p></div>` : `
          <fieldset style="border:0;padding:0;margin:0">
            <legend class="sr-only">Choose which tags to confirm</legend>
            ${tags.map((t) => `
            <div class="tag-row ${p.selected.has(t.skill_id) ? "" : "rejected"}">
              <label class="check"><input type="checkbox" data-tag="${t.skill_id}" ${p.selected.has(t.skill_id) ? "checked" : ""} aria-label="Confirm ${t.skill_id}"></label>
              <div>
                <div class="row">${chip(t.skill_id)}<span class="small">${skill(t.skill_id).name}</span></div>
                <div class="why">${esc(t.reason)}${t.quote ? `, from your words <q>${esc(t.quote)}</q>` : ""}</div>
              </div>
              <div class="stack-sm" style="gap:4px;align-items:flex-end">${conf(t.confidence_label)}<span class="tiny faint">${t.provenance.replace("_", " ")}</span></div>
            </div>`).join("")}
          </fieldset>
          <div class="note" style="margin-top:12px">${icon("circle-help")}<div><b style="color:var(--ink);font-weight:500">Not matched:</b> ${D.planProposal.unmapped_phrases.map((u) => chip(u, "dashed")).join(" ")}<div style="margin-top:4px">This isn't a skill in the approved catalogue, so nothing new was invented. The skills above are the closest approved matches.</div></div></div>
          <div class="field" style="margin-top:16px">
            <label for="add-skill">Add a skill yourself</label>
            <div class="row">
              <select class="select" id="add-skill" style="max-width:260px">${notInList.map((s) => `<option value="${s.skill_id}">${s.skill_id}</option>`).join("")}</select>
              <button class="btn btn-sm" type="button" data-act="add-skill" ${notInList.length ? "" : "disabled"}>Add</button>
            </div>
          </div>`}
        </div>
        ${p.proposed && !p.loading ? `
        <div class="panel-foot">
          <button class="btn btn-primary" type="button" data-act="confirm-plan" ${n ? "" : "disabled"}>${icon("check")}Confirm ${n} tag${n === 1 ? "" : "s"}</button>
          <button class="btn btn-ghost" type="button" data-act="reject-all">Reject all</button>
          ${p.confirmed ? `<span class="small" role="status" style="color:var(--pass)">${icon("circle-check")} Plan saved. The selector now uses these ${n} tags.</span>` : `<span class="tiny faint">Unchecked tags are recorded as rejected.</span>`}
        </div>` : ""}
      </section>
    </div>`;
  }

  // ---------- skills ----------
  const NW = 178, NH = 74, OY = 52, GH = 300 + NH + OY + 24;
  function graphSvg() {
    const sel = state.skills.selected;
    const pos = Object.fromEntries(D.skills.map((s) => [s.skill_id, { x: s.x + 20, y: s.y + OY }]));
    const due = new Set(D.retentionDue.filter((d) => d.kind === "now").map((d) => d.skill_id));
    const edges = D.relations.map((r) => {
      const a = pos[r.to_skill_id], b = pos[r.from_skill_id];
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x - 6, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const hl = r.from_skill_id === sel || r.to_skill_id === sel;
      return `<path class="edge ${r.approval_status !== "approved" ? "proposed" : ""} ${hl ? "hl" : ""}" d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" marker-end="url(#${r.approval_status !== "approved" ? "arrow-p" : hl ? "arrow-h" : "arrow"})"><title>${r.from_skill_id} requires ${r.to_skill_id} (${r.approval_status})</title></path>`;
    }).join("");
    const nodes = D.skills.map((s) => {
      const p = pos[s.skill_id], e = D.estimates[s.skill_id];
      const bars = [["recall_index", "var(--recall)"], ["understanding_index", "var(--understand)"], ["transfer_index", "var(--transfer)"]].map(([k, c], i) => {
        const v = e[k], bx = p.x + 14 + i * 50, by = p.y + NH - 18;
        return `<rect class="bar-bg" x="${bx}" y="${by}" width="44" height="5" rx="2.5"/>${v == null ? `<rect class="bar-none" x="${bx}" y="${by}" width="44" height="5" rx="2.5"/>` : `<rect x="${bx}" y="${by}" width="${44 * v}" height="5" rx="2.5" fill="${c}"/>`}`;
      }).join("");
      const label = `${s.name}. ${s.skill_id}. Recall ${idx(e.recall_index)}, understanding ${idx(e.understanding_index)}, transfer ${idx(e.transfer_index)}.${due.has(s.skill_id) ? " Check due today." : ""}`;
      return `<g class="gnode ${s.skill_id === sel ? "sel" : ""}" tabindex="0" role="button" aria-pressed="${s.skill_id === sel}" data-skill="${s.skill_id}" aria-label="${label}">
        <rect class="box" x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="6"/>
        <text class="gname" x="${p.x + 14}" y="${p.y + 24}">${s.name}</text>
        <text class="gid" x="${p.x + 14}" y="${p.y + 40}">${s.skill_id}</text>
        ${due.has(s.skill_id) ? `<circle class="due-ring" cx="${p.x + NW - 16}" cy="${p.y + 18}" r="5"/>` : ""}
        ${bars}
      </g>`;
    }).join("");
    return `
    <svg class="graph" viewBox="0 0 880 ${GH}" role="group" aria-label="Skill graph: prerequisite edges between approved skills">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" style="stroke:var(--line-3)" stroke-width="1.4"/></marker>
        <marker id="arrow-h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" style="stroke:var(--ink)" stroke-width="1.6"/></marker>
        <marker id="arrow-p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" style="stroke:var(--warn)" stroke-width="1.4"/></marker>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="transparent"/><line x1="0" y1="0" x2="0" y2="5" style="stroke:rgba(var(--ink-rgb),.28)" stroke-width="1.5"/></pattern>
      </defs>
      <rect class="area" x="6" y="6" width="868" height="${GH - 12}" rx="10"/>
      <text class="area-label" x="22" y="32">Fundamental programming concepts · part_of grouping</text>
      ${edges}${nodes}
    </svg>`;
  }

  function skillDetail() {
    const id = state.skills.selected, s = skill(id), e = D.estimates[id];
    const reqs = D.relations.filter((r) => r.from_skill_id === id);
    const by = D.relations.filter((r) => r.to_skill_id === id);
    return `
    <section class="panel" aria-labelledby="sd-h" aria-live="polite">
      <div class="panel-head"><div><h2 id="sd-h">${s.name}</h2><div class="tiny faint mono" style="margin-top:2px">${id}</div></div><span class="badge b-pass">${s.approval_status}</span></div>
      <div class="panel-body stack-sm" style="gap:14px">
        <p class="muted">${esc(s.description)}</p>
        <div class="stack-sm" style="gap:8px">
          ${meter("Recall", e.recall_index, "var(--recall)")}
          ${meter("Understanding", e.understanding_index, "var(--understand)")}
          ${meter("Transfer", e.transfer_index, "var(--transfer)")}
        </div>
        <dl class="kv">
          <dt>Gap priority</dt><dd class="mono">${e.gap_priority_index == null ? '<span class="faint">insufficient evidence</span>' : idx(e.gap_priority_index)}</dd>
          <dt>Evidence</dt><dd>${e.evidence_count} valid event${e.evidence_count === 1 ? "" : "s"}</dd>
          <dt>Confidence</dt><dd>${conf(e.confidence_label)}</dd>
          <dt>Policy</dt><dd class="mono">gap-v1</dd>
        </dl>
        <p class="tiny faint">Indices summarise your unaided evidence and are uncalibrated. They are not a probability that you have mastered the skill.</p>
        ${e.hypotheses.length ? `<div class="stack-sm"><h3>Possible gaps</h3>${e.hypotheses.map((h) => `
          <div class="hyp">
            <div class="row between"><b style="font-weight:500">${h.label}</b><span class="badge b-warn">${h.status}</span></div>
            <p class="small muted">${esc(h.note)}</p>
            <div class="row">${h.supporting_evidence_ids.map((x) => chip(x, "dashed")).join("")}</div>
            <div class="row" style="margin-top:4px">
              <button class="btn btn-sm" type="button" data-act="challenge" ${state.skills.challenged ? "disabled" : ""}>${state.skills.challenged ? `${icon("check")}Diagnostic requested` : "Prove it with a new diagnostic"}</button>
            </div>
          </div>`).join("")}</div>` : ""}
        <div class="stack-sm">
          <h3>Prerequisites</h3>
          <div class="row">${reqs.length ? reqs.map((r) => `<button class="chip ${r.approval_status !== "approved" ? "dashed" : ""}" style="cursor:pointer" type="button" data-skill="${r.to_skill_id}">${r.to_skill_id}${r.approval_status !== "approved" ? " · under review" : ""}</button>`).join("") : '<span class="small faint">None</span>'}</div>
          <h3 style="margin-top:6px">Needed by</h3>
          <div class="row">${by.length ? by.map((r) => `<button class="chip" style="cursor:pointer" type="button" data-skill="${r.from_skill_id}">${r.from_skill_id}</button>`).join("") : '<span class="small faint">None</span>'}</div>
        </div>
        <dl class="kv">
          <dt>Outcomes</dt><dd class="mono tiny">${["recall", "understanding", "transfer"].map((st) => `${id}.${st}.v1`).join("<br>")}</dd>
          <dt>Source</dt><dd class="small">CS2023 · section to confirm</dd>
        </dl>
      </div>
    </section>`;
  }

  function pageSkills() {
    const v = state.skills.view;
    return `
    <div class="page-head">
      <div><h1>Skills</h1><p>Approved skills for ${esc(D.student.course)}, how they depend on each other, and what your evidence says so far.</p></div>
      <div class="seg" role="group" aria-label="View">
        <button type="button" data-view="graph" aria-pressed="${v === "graph"}">Graph</button>
        <button type="button" data-view="list" aria-pressed="${v === "list"}">List</button>
      </div>
    </div>
    <div class="skills-layout">
      <section class="panel" aria-label="${v === "graph" ? "Skill graph" : "Skill list"}">
        <div class="panel-body" style="padding-top:20px">
          ${v === "graph" ? `<div class="graph-wrap">${graphSvg()}</div>
          <div class="legend" style="margin-top:14px">
            <span><svg viewBox="0 0 28 10" aria-hidden="true"><path d="M0 5 H24" style="stroke:var(--line-3)"/><path d="M20 1 L25 5 L20 9" fill="none" style="stroke:var(--line-3)"/></svg>prerequisite → skill (requires)</span>
            <span><svg viewBox="0 0 28 10" aria-hidden="true"><path d="M0 5 H24" style="stroke:var(--warn)" stroke-dasharray="4 3"/></svg>proposed, under review</span>
            <span><i class="sw" style="background:var(--recall)"></i>recall</span>
            <span><i class="sw" style="background:var(--understand)"></i>understanding</span>
            <span><i class="sw" style="background:var(--transfer)"></i>transfer</span>
            <span><i class="sw" style="background:repeating-linear-gradient(135deg,rgba(var(--ink-rgb),.35) 0 2px,transparent 2px 4px)"></i>insufficient evidence</span>
            <span><svg viewBox="0 0 10 10" style="width:10px" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" style="stroke:var(--warn)" stroke-width="1.5"/></svg>check due</span>
          </div>` : `
          <div class="table-wrap"><table class="data skill-list">
            <thead><tr><th>Skill</th><th>Prerequisites</th><th>Recall</th><th>Understanding</th><th>Transfer</th><th>Evidence</th><th>Confidence</th></tr></thead>
            <tbody>${D.skills.map((s) => { const e = D.estimates[s.skill_id]; return `
              <tr><td><button class="linkish" type="button" data-skill="${s.skill_id}">${s.name}</button><div class="tiny faint mono">${s.skill_id}</div></td>
              <td class="small muted">${D.relations.filter((r) => r.from_skill_id === s.skill_id).map((r) => skill(r.to_skill_id).name + (r.approval_status !== "approved" ? "*" : "")).join(", ") || "—"}</td>
              <td class="mono">${idx(e.recall_index)}</td><td class="mono">${idx(e.understanding_index)}</td><td class="mono">${idx(e.transfer_index)}</td>
              <td class="num">${e.evidence_count}</td><td>${conf(e.confidence_label)}</td></tr>`; }).join("")}
            </tbody></table></div>
          <p class="tiny faint" style="margin-top:10px">* proposed prerequisite, under instructor review. “—” means insufficient evidence, not zero.</p>`}
        </div>
      </section>
      ${skillDetail()}
    </div>`;
  }

  // ---------- learn ----------
  function editor(code, file, meta) {
    const lines = code.split("\n").length;
    return `
    <div class="editor-bar">${icon("file-code")}<span class="file">${file}</span><span class="spacer" style="flex:1"></span>${meta}</div>
    <div class="code-area">
      <div class="gutter" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<span>${i + 1}</span>`).join("")}</div>
      <div class="code-stack">
        <pre aria-hidden="true"><code data-hl>${hlPy(code)}\n</code></pre>
        <textarea data-code spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off" aria-label="Code editor, ${file}">${esc(code)}</textarea>
      </div>
    </div>`;
  }

  function evaluationBlock() {
    const L = state.learn, ev = D.evaluation;
    const steps = ["queued", "running", "succeeded"];
    if (L.job === "idle") return `<div class="results"><div class="results-head"><span class="small faint">Not submitted yet. Tests run on an isolated grader, never in your browser.</span></div></div>`;
    if (L.job === "queued" || L.job === "running") {
      const i = steps.indexOf(L.job);
      return `<div class="results" aria-busy="true"><div class="results-head" role="status" aria-live="polite"><span class="job">Grading attempt ${L.attempt}</span><span class="job-steps">${steps.map((s, k) => `<span class="${k < i ? "done" : k === i ? "on" : ""}">${s}</span>`).join("")}</span></div></div>`;
    }
    if (L.outcome === "unavailable") return `<div class="results"><div class="results-body" style="padding-top:14px"><div class="note fail" role="alert">${icon("server-crash")}<div><b>Grader unavailable (503).</b> Your attempt was saved but not graded, and nothing was recorded against your skills. Try again in a minute.</div></div></div></div>`;
    if (L.outcome === "uncertain") return `<div class="results"><div class="results-body" style="padding-top:14px"><div class="note warn" role="status">${icon("triangle-alert")}<div><b>Grading uncertain.</b> A test for this task has been flagged for instructor review. This result will not change your skill estimate.</div></div></div></div>`;
    const pass = L.outcome === "pass";
    const tests = pass ? ev.tests.map((t) => ({ ...t, ok: true })) : ev.tests;
    const passed = tests.filter((t) => t.ok).length;
    return `
    <div class="results">
      <div class="results-head" role="status" aria-live="polite">
        <b class="small">Attempt ${L.attempt}</b>
        <span class="badge ${pass ? "b-pass" : "b-fail"}">${passed} / ${tests.length} tests passed</span>
        <span class="badge b-neutral plain" title="grading_validity">grading valid</span>
        <span class="job-steps hide-sm">${steps.map((s) => `<span class="done">${s}</span>`).join("")}</span>
      </div>
      <div class="results-body">
        ${tests.map((t) => `
          <div class="test-row">${t.ok ? `<span class="ok">${icon("check")}</span>` : `<span class="bad">${icon("x")}</span>`}<span>${t.test_id}</span><span class="faint">${t.requirement_id}</span>
          <span class="${t.ok ? "faint" : ""}">${t.ok ? (t.label || "passed") : `stock_status(${t.input_repr}) → expected ${esc(t.expected_repr)}, got ${esc(t.actual_repr)}`}</span></div>`).join("")}
        ${pass ? `<div class="note pass" style="margin-top:6px">${icon("circle-check")}<div>All requirements met. ${L.revealed ? "Because the answer was revealed, this counts as an assisted solution, not independent mastery." : L.hintsUsed ? `Recorded as <b>assisted progress</b> (hint level ${L.hintsUsed} used). An unaided transfer check is scheduled for Mon 27 Oct.` : "Recorded as independent evidence."}<div class="row" style="margin-top:8px"><a class="btn btn-sm btn-primary" href="#/reflection">${icon("notebook-pen")}Reflect on this attempt</a></div></div></div>` : ""}
      </div>
    </div>`;
  }

  function hintLadder() {
    const L = state.learn;
    return D.hints.map((h) => {
      const used = h.level <= L.hintsUsed || (h.level === 4 && L.revealed);
      const next = !used && h.level === L.hintsUsed + 1;
      const reveal = h.level === 4;
      return `
      <div class="rung ${used ? "used" : ""} ${next ? "next" : ""} ${reveal ? "reveal" : ""}">
        <span class="rung-node" aria-hidden="true">${h.level}</span>
        <div class="rung-body">
          <div class="rung-title">${h.title}<small>level ${h.level}</small></div>
          ${used ? `<div class="hint-bubble">${esc(h.hint_text).replace(/`([^`]+)`/g, "<code>$1</code>")}<div class="act">${icon("corner-down-right")}${esc(h.student_action)}</div></div>`
          : next && !reveal ? `<div><button class="btn btn-sm" type="button" data-act="hint">${icon("lightbulb")}Ask for a level ${h.level} hint</button></div>`
          : reveal && next ? (L.revealArmed ? `
            <div class="reveal-box" role="group" aria-labelledby="rv-warn">
              <p class="small" id="rv-warn"><b>Revealing the answer ends this attempt's independent credit.</b> Passing afterwards is recorded as an assisted solution, and you'll get a new unaided task later.</p>
              <label class="check small"><input type="checkbox" data-act="ack" ${L.revealAck ? "checked" : ""}> I understand this attempt won't count as independently solved</label>
              <div class="row"><button class="btn btn-sm btn-danger" type="button" data-act="reveal" ${L.revealAck ? "" : "disabled"}>${icon("eye")}Reveal answer</button><button class="btn btn-sm btn-ghost" type="button" data-act="unarm">Keep trying</button></div>
            </div>` : `<div><button class="btn btn-sm btn-danger" type="button" data-act="arm">${icon("eye")}Show answer + explanation</button></div>`)
          : `<span class="tiny faint">${reveal ? "Available after level 3" : "Locked until the previous level"}</span>`}
        </div>
      </div>`;
    }).join("");
  }

  function pageLearn() {
    const t = D.task, L = state.learn;
    const busy = L.job === "queued" || L.job === "running";
    return `
    <div class="page-head">
      <div>
        <h1>${t.title}</h1>
        <div class="row" style="margin-top:8px">
          <span class="badge b-neutral plain">${ACTIVITY[t.activity_type]}</span>${stageBadge(t.assessment_stage)}
          <span class="badge b-pass" title="Passed QA checks: the reference solution passes and the tests catch faulty versions. Not proof of perfect teaching quality.">verified</span>${t.target_skill_ids.map((s) => chip(s)).join("")}
        </div>
      </div>
      <div class="page-actions"><span class="small faint mono">task v${t.task_version} · ${t.outcome_ids[0]}</span></div>
    </div>

    <div class="work3">
      <section class="panel" aria-labelledby="task-h">
        <div class="panel-head"><h2 id="task-h">Task</h2><span class="sub">~15 min</span></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <nav class="stage-track" aria-label="Assessment stages">
            ${t.stages.map((s) => `<button type="button" style="--stage-c:var(--${s.stage === "understanding" ? "understand" : s.stage})" ${s.state === "current" ? 'aria-current="step"' : ""} data-toast="${s.state === "done" ? `${s.label} stage completed on Thu 23 Oct, graded with a rubric.` : "You are on the transfer stage: code and explanation, checked by automatic tests."}"><span><span class="sdot"></span>${s.label}</span><span class="st-state">${s.state === "done" ? "Done" : "Now"}</span><small style="grid-column:1/-1">${s.detail} · ${s.grading}</small></button>`).join("")}
          </nav>
          <p>${esc(t.student_brief)}</p>
          <div class="sig">${hlPy(`def ${t.function_contract.name}(${t.function_contract.parameters.map((p) => `${p.name}: ${p.type}`).join(", ")}) -> ${t.function_contract.returns}:`)}</div>
          <div><h3 style="margin-bottom:6px">Requirements</h3>
            ${t.requirements.map((r) => `<div class="req"><span class="rid">${r.requirement_id}</span><span>${esc(r.description)}</span><span></span></div>`).join("")}
          </div>
          <div><h3 style="margin-bottom:6px">Examples</h3>
            <table class="data"><thead><tr><th>Call</th><th>Returns</th></tr></thead><tbody>${t.public_examples.map((e) => `<tr><td class="mono">stock_status(${e.args.join(", ")})</td><td class="mono">"${e.expected}"</td></tr>`).join("")}</tbody></table>
          </div>
          <dl class="kv"><dt>Inputs</dt><dd>${t.input_constraints.join("; ")}</dd><dt>Allowed</dt><dd>Comparisons, conditionals</dd></dl>
          <div class="note">${icon("lock")}<div>More tests run on the grader. They're never shown, but each failure tells you which requirement it checks.</div></div>
        </div>
      </section>

      <section class="stack" style="gap:16px" aria-labelledby="ws-h">
        <h2 id="ws-h" class="sr-only">Your workspace</h2>
        <div class="editor">
          ${editor(L.code, "stock_status.py", `<span class="tiny">Draft for attempt ${L.attempt + (L.job === "done" ? 1 : 0)} · saved locally</span>`)}
          ${evaluationBlock()}
        </div>
        <div class="panel"><div class="panel-body stack-sm" style="padding-top:16px">
          <div class="field">
            <label for="expl">${esc(t.explanation_questions[0])}</label>
            <textarea class="textarea" id="expl" rows="3" data-expl>${esc(L.explanation)}</textarea>
            <span class="hint-text">Your explanation is part of the evidence, but writing style is never scored as mastery.</span>
          </div>
          <div class="row between">
            <div class="evidence" style="flex:1;min-width:260px">
              <div><span class="k">Correctness</span><span class="v">${L.job === "done" && (L.outcome === "pass" || L.outcome === "fail") ? (L.outcome === "pass" ? "4 / 4" : "3 / 4") : "—"}</span></div>
              <div><span class="k">Help used</span><span class="v">${L.revealed ? "Answer revealed" : L.hintsUsed ? `Hint level ${L.hintsUsed}` : "None"}</span></div>
              <div><span class="k">Independent evidence</span><span class="v ${L.hintsUsed || L.revealed ? "muted" : ""}">${L.hintsUsed || L.revealed ? "Not this attempt" : "Yes, if passed"}</span></div>
            </div>
          </div>
          <div class="row">
            <button class="btn ${L.outcome === "pass" && L.job === "done" ? "" : "btn-primary"} ${busy ? "is-loading" : ""}" type="button" data-act="submit" ${busy ? "disabled" : ""}>${busy ? "Grading" : `${icon("send")}Submit attempt ${L.attempt + (L.job === "done" ? 1 : 0)}`}</button>
            <button class="btn btn-ghost" type="button" data-act="reset-code">${icon("rotate-ccw")}Reset to last submission</button>
          </div>
        </div></div>
      </section>

      <aside class="panel tutor-col" aria-labelledby="hint-h">
        <div class="panel-head"><h2 id="hint-h">Hints</h2><span class="sub">${L.hintsUsed} of 4 used</span></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <p class="small muted">Help goes up one level at a time, and every level you use is recorded. Try editing and resubmitting between hints.</p>
          <div class="ladder">${hintLadder()}</div>
          <hr class="divider" style="margin:0">
          <div class="stack-sm" style="gap:8px">
            <h3>Your responses</h3>
            <div class="small"><span class="faint mono">L1 · 10:44</span> “It's the elif that returns low.”</div>
            <div class="small"><span class="faint mono">L2 · 10:51</span> “3 should be low because R2 says 1–3.”</div>
          </div>
        </div>
      </aside>
    </div>

    <details class="panel" style="padding:12px 20px">
      <summary class="small muted" style="cursor:pointer">Prototype only: preview other grading states</summary>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-sm" type="button" data-outcome="fail">Boundary failure (T4)</button>
        <button class="btn btn-sm" type="button" data-outcome="pass">All pass</button>
        <button class="btn btn-sm" type="button" data-outcome="unavailable">Grader unavailable</button>
        <button class="btn btn-sm" type="button" data-outcome="uncertain">Uncertain test</button>
      </div>
    </details>`;
  }

  // ---------- project ----------
  function designCanvas() {
    const box = (x, y, w, t, s) => `<g class="dc-box"><rect x="${x}" y="${y}" width="${w}" height="52" rx="6"/><text x="${x + 12}" y="${y + 22}">${t}</text><text class="s" x="${x + 12}" y="${y + 39}">${s}</text></g>`;
    return `
    <div class="design-canvas"><svg viewBox="0 0 640 320" role="img" aria-label="Your design: main loop calls show_menu, read_choice, add_to_cart and checkout; cart is two parallel lists">
      <defs><marker id="dc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" style="stroke:var(--warn)" stroke-width="1.4"/></marker></defs>
      <path class="dc-wire" d="M150 60 C 200 60, 200 40, 250 40"/><path class="dc-wire" d="M150 60 C 200 60, 200 120, 250 120"/>
      <path class="dc-wire" d="M150 60 C 200 60, 200 200, 250 200"/><path class="dc-wire" d="M150 60 C 200 60, 200 280, 250 280"/>
      <path class="dc-wire" d="M420 200 L 470 200"/><path class="dc-wire" d="M420 280 C 445 280, 445 220, 470 220"/>
      ${box(20, 34, 130, "main loop", "while not done")}
      ${box(250, 14, 170, "show_menu()", "PR1")}
      ${box(250, 94, 170, "read_choice(text)", "PR3, PR4 · M3")}
      ${box(250, 174, 170, "add_to_cart(i, qty)", "PR5 · M4")}
      ${box(250, 254, 170, "checkout()", "M5")}
      ${box(470, 184, 150, "cart", "items[], qtys[]")}
      <path class="dc-wire" d="M462 106 H 428" style="stroke:var(--warn)" marker-end="url(#dc-arrow)"/><g class="dc-note"><text x="468" y="110">validate before int()?</text></g>
    </svg></div>`;
  }

  function pageProject() {
    const P = D.project, S = state.project;
    const ms = P.milestones.find((m) => m.milestone_id === S.milestone);
    const reqs = P.requirements.filter((r) => r.milestone === S.milestone);
    const tab = S.tab;
    return `
    <div class="page-head">
      <div>
        <h1>${P.title}</h1>
        <div class="row" style="margin-top:8px"><span class="badge b-neutral plain">Project</span><span class="badge b-pass">verified</span><span class="small faint">v${P.project_version} · M3 of 6</span></div>
      </div>
      <div class="page-actions"><button class="btn" type="button" data-toast="Milestone attempt submitted (JobRef queued).">${icon("send")}Submit M3</button></div>
    </div>

    <div class="work3">
      <section class="panel" aria-labelledby="brief-h">
        <div class="panel-head"><h2 id="brief-h">Brief</h2></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <p>${esc(P.student_brief)}</p>
          <div class="stack-sm" style="gap:8px"><span class="small faint">Practises</span><div class="row">${P.target_skill_ids.map((s) => chip(s)).join("")}</div></div>
          <dl class="kv">
            <dt>Not allowed</dt><dd class="small muted">${P.excluded.join(", ")}</dd>
            <dt>Engineering</dt><dd class="small">requirements, testing</dd>
          </dl>
          <div>
            <h3 style="margin-bottom:10px">Milestones</h3>
            <div class="milestones">
              ${P.milestones.map((m) => `
              <div class="ms ${m.status} ${m.change_request ? "cr" : ""}">
                <span class="ms-node" aria-hidden="true">${m.status === "done" ? icon("check") : m.status === "locked" ? icon("lock") : m.milestone_id}</span>
                <button type="button" data-ms="${m.milestone_id}" aria-current="${m.milestone_id === S.milestone ? "step" : "false"}" ${m.status === "locked" ? 'aria-disabled="true"' : ""}>
                  <span class="t">${m.milestone_id} · ${m.title}</span>
                  <span class="d">${m.status === "done" ? "Complete · " : m.status === "locked" ? `After ${m.depends_on.join(", ")} · ` : "In progress · "}${m.assessment_method}${m.review ? " · rubric reviewed" : ""}</span>
                </button>
              </div>`).join("")}
            </div>
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="pw-h">
        <div class="panel-head" style="padding-bottom:0"><h2 id="pw-h" class="sr-only">Workspace</h2>
          <div class="tabs" role="tablist" aria-label="Workspace" style="flex:1">
            ${[["design", "Design", "workflow"], ["code", "Code", "code-xml"], ["tests", "Tests", "flask-conical"]].map(([k, l, ic]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${icon(ic)}${l}</button>`).join("")}
          </div>
        </div>
        <div class="panel-body stack-sm" style="gap:14px;padding-top:16px" role="tabpanel">
          ${tab === "design" ? `
            <div class="note">${icon("info")}<div><b style="color:var(--ink);font-weight:500">Your design, not ours.</b> M1 asked you to propose components and explain trade-offs. Only the command-line protocol below is fixed, because grading needs it.</div></div>
            ${designCanvas()}
            <div><h3 style="margin-bottom:6px">Command-line protocol (fixed for grading)</h3><div class="sig">${esc(P.cli_protocol)}</div></div>`
          : tab === "code" ? `<div class="editor">${editor(D.projectCode, "cafe.py", `<span class="tiny">M3 draft</span>`)}</div>`
          : `
            <div class="row"><b class="small">Last run · M3</b><span class="badge b-fail">2 / 4 passed</span><span class="badge b-neutral plain">grading valid</span></div>
            <div class="stack-sm" style="gap:6px">
              <div class="test-row"><span class="bad">${icon("x")}</span><span>T1</span><span class="faint">PR3</span><span>input "abc" → program crashed (ValueError)</span></div>
              <div class="test-row"><span class="ok">${icon("check")}</span><span>T2</span><span class="faint">PR3</span><span class="faint">out-of-range item rejected</span></div>
              <div class="test-row"><span class="bad">${icon("x")}</span><span>T3</span><span class="faint">PR4</span><span>"2 x0" → cart changed, expected unchanged</span></div>
              <div class="test-row"><span class="ok">${icon("check")}</span><span>T4</span><span class="faint">PR3</span><span class="faint">valid selection accepted</span></div>
            </div>
            <p class="tiny faint">M2 tests still run on every M3 submission so a change can't silently break earlier behaviour.</p>`}
        </div>
      </section>

      <aside class="stack tutor-col" style="gap:16px">
        <section class="panel" aria-labelledby="msr-h">
          <div class="panel-head"><h2 id="msr-h">${ms.milestone_id} · ${ms.title}</h2></div>
          <div class="panel-body stack-sm">
            <p class="small muted">${ms.detail}</p>
            ${reqs.length ? reqs.map((r) => `<div class="req"><span class="rid">${r.requirement_id}</span><span>${esc(r.description)}</span><span></span></div>`).join("") : `<p class="small faint">${ms.status === "locked" ? `Unlocks after ${ms.depends_on.join(", ")}.` : "Requirements were assessed by rubric."}</p>`}
            ${ms.change_request ? `<div class="note warn">${icon("git-pull-request-arrow")}<div>A change request arrives after M5. Your earlier behaviour must keep passing.</div></div>` : ""}
          </div>
        </section>
        <section class="panel" aria-labelledby="ph-h">
          <div class="panel-head"><h2 id="ph-h">Hints for M3</h2><span class="sub">${S.hintsUsed} of 4 used</span></div>
          <div class="panel-body">
            <div class="ladder">
              <div class="rung used"><span class="rung-node" aria-hidden="true">1</span><div class="rung-body"><div class="rung-title">Where is the error?</div><div class="hint-bubble">Test T1 sends <code>abc</code>. Which line runs on that text before any range check happens?</div></div></div>
              <div class="rung ${S.hintsUsed >= 2 ? "used" : "next"}"><span class="rung-node" aria-hidden="true">2</span><div class="rung-body"><div class="rung-title">What should this code do?</div>${S.hintsUsed >= 2 ? `<div class="hint-bubble">PR3 says malformed selections are rejected and asked again. What should <code>read_choice</code> return for text that isn't a number?</div>` : `<div><button class="btn btn-sm" type="button" data-act="phint">${icon("lightbulb")}Ask for a level 2 hint</button></div>`}</div></div>
              <div class="rung ${S.hintsUsed >= 2 ? "next" : ""}"><span class="rung-node" aria-hidden="true">3</span><div class="rung-body"><div class="rung-title">What if you changed it?</div><span class="tiny faint">${S.hintsUsed >= 2 ? "Available next" : "Locked until level 2"}</span></div></div>
              <div class="rung reveal"><span class="rung-node" aria-hidden="true">4</span><div class="rung-body"><div class="rung-title">Answer + explanation</div><span class="tiny faint">Asks for confirmation first</span></div></div>
            </div>
          </div>
        </section>
      </aside>
    </div>`;
  }

  // ---------- reflection ----------
  function pageReflection() {
    const R = state.reflection;
    const proposal = [
      { skill_id: "python.conditionals", confidence_label: "medium", reason: "You mention the 3 vs 4 boundary" },
      { skill_id: "python.comparisons", confidence_label: "low", reason: "“< vs <=” is a comparison operator choice" },
    ];
    return `
    <div class="page-head">
      <div><h1>Reflection</h1><p>A few honest sentences about the attempt. Reflections are private to you and count only as a light signal, never as proof of what you know.</p></div>
      <span class="badge b-neutral plain">${icon("lock")} Private</span>
    </div>
    <div class="two">
      <section class="panel" aria-labelledby="rf-h">
        <div class="panel-head"><h2 id="rf-h">Stock classifier · latest attempt</h2><span class="sub">Assisted · hint level 2</span></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <div class="field"><label for="r1">What changed in how you think about it?</label><textarea class="textarea" id="r1" rows="3">I assumed "less than 3" included 3. Writing out 2, 3 and 4 made the boundary obvious.</textarea></div>
          <div class="field"><label for="r2">What was hard?</label><textarea class="textarea" id="r2" rows="2">Reading "1–3" and turning it into a condition.</textarea></div>
          <div class="field"><label for="r3">What will you revisit?</label><textarea class="textarea" id="r3" rows="2" placeholder="Optional"></textarea></div>
          <div class="field">
            <label for="conf-r">How confident are you now? <span class="mono faint" id="conf-v">${R.confidence}%</span></label>
            <input type="range" id="conf-r" min="0" max="100" step="10" value="${R.confidence}" aria-describedby="conf-h">
            <span class="hint-text" id="conf-h">Self-reported. It helps pick what to practise; it never raises your skill indices.</span>
          </div>
          <div class="field"><span class="label" id="dif">How hard did it feel?</span>
            <div class="seg" role="group" aria-labelledby="dif">${["easy", "ok", "hard"].map((d) => `<button type="button" data-diff="${d}" aria-pressed="${R.difficulty === d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join("")}</div>
          </div>
        </div>
        <div class="panel-foot"><button class="btn btn-primary" type="button" data-act="reflect" ${R.step !== "write" ? "disabled" : ""}>${icon("wand-sparkles")}Suggest related skills</button><span class="tiny faint">Nothing is saved as evidence until you confirm.</span></div>
      </section>

      <div class="stack">
        <section class="panel" aria-labelledby="rt-h" aria-live="polite">
          <div class="panel-head"><h2 id="rt-h">Related skills</h2></div>
          <div class="panel-body">
            ${R.step === "write" ? `<div class="empty" style="padding:32px 12px">${icon("notebook-pen")}<p class="small">After you write, Socratix suggests which skills your reflection is about and may ask one or two questions. You choose what to keep.</p></div>`
            : R.step === "proposed" ? `
              ${proposal.map((t) => `<div class="tag-row"><label class="check"><input type="checkbox" data-rtag="${t.skill_id}" ${R.tags.has(t.skill_id) ? "checked" : ""} aria-label="Keep ${t.skill_id}"></label><div><div class="row">${chip(t.skill_id)}</div><div class="why">${esc(t.reason)}</div></div>${conf(t.confidence_label)}</div>`).join("")}
              <div class="field" style="margin-top:12px"><label for="q1">Which result did you expect for 3 before the hint?</label><input class="input" id="q1" placeholder="Optional answer"></div>
              <label class="check small" style="margin-top:14px"><input type="checkbox" data-act="evtoggle" ${R.evidence ? "checked" : ""}> Use this reflection as self-report evidence (low weight, kept separate from graded results)</label>
              <div class="row" style="margin-top:14px"><button class="btn btn-primary" type="button" data-act="confirm-reflection">${icon("check")}Confirm ${R.tags.size} tag${R.tags.size === 1 ? "" : "s"}</button><button class="btn btn-ghost" type="button" data-act="dismiss-reflection">Dismiss all</button></div>`
            : `<div class="note pass">${icon("circle-check")}<div><b>Reflection saved.</b> ${R.evidence && R.tags.size ? `${R.tags.size} self-report event${R.tags.size === 1 ? "" : "s"} recorded at 14:06 for ${[...R.tags].join(", ")}.` : "Kept as a private note only; no evidence recorded."}</div></div>`}
          </div>
        </section>
        <section class="panel" aria-labelledby="past-h">
          <div class="panel-head"><h2 id="past-h">Earlier reflections</h2></div>
          <div class="panel-body">
            <div class="due"><span class="due-dot later" aria-hidden="true"></span><div><div class="small">“I couldn't explain why my loop stopped.”</div><div class="tiny faint">Thu 23 Oct · Loop recall check · confirmed python.loops</div></div><span class="tiny faint">Private</span></div>
            <div class="due"><span class="due-dot later" aria-hidden="true"></span><div><div class="small">“Predicting output was easier when I traced on paper.”</div><div class="tiny faint">Wed 22 Oct · Comparisons · no tags kept</div></div><span class="tiny faint">Private</span></div>
          </div>
        </section>
      </div>
    </div>`;
  }

  // ---------- review ----------
  function pageReview() {
    if (state.role !== "instructor") {
      return `<section class="panel"><div class="empty">${icon("shield-alert")}<h1 style="font-size:1.125rem">Instructor access required</h1><p class="small" style="max-width:52ch">This page needs the instructor role. In the real app the server checks your role on every request, so changing the URL doesn't grant access.</p><button class="btn" type="button" data-role="instructor">Switch prototype view to Instructor</button></div></section>`;
    }
    const R = state.review;
    const groups = { all: "All", skill_relations: "Skills & edges", activities: "Tasks", gap_hypotheses: "Gaps", projects: "Projects" };
    const items = D.reviewQueue.filter((q) => R.filter === "all" || q.resource_type === R.filter);
    const q = D.reviewQueue.find((x) => x.id === R.selected) || items[0];
    const dec = q && R.decisions[q.id];
    return `
    <div class="page-head">
      <div><h1>Review queue</h1><p>AI-proposed content waits here until a person approves it. Nothing below reaches students until you decide.</p></div>
    </div>
    <div class="tabs" role="tablist" aria-label="Filter queue">
      ${Object.entries(groups).map(([k, l]) => `<button role="tab" type="button" data-filter="${k}" aria-selected="${R.filter === k}">${l}<span class="mono faint tiny">${D.reviewQueue.filter((x) => k === "all" || x.resource_type === k).length}</span></button>`).join("")}
    </div>
    <div class="review-layout">
      <section class="panel" aria-label="Queue">
        <div class="panel-body stack-sm" style="gap:4px;padding:10px">
          ${items.map((x) => { const d = R.decisions[x.id]; return `
            <button class="queue-item" type="button" data-q="${x.id}" aria-selected="${x.id === q.id}">
              <span style="font-weight:500">${esc(x.title)}</span>
              <span class="badge ${d ? (d.decision === "approved" ? "b-pass" : "b-fail") : x.status === "review_required" ? "b-warn" : "b-info"}">${d ? d.decision : x.status.replace("_", " ")}</span>
              <span class="meta"><span>${x.kind}</span><span>·</span><span class="mono">${x.source_kind}</span><span>·</span><span>v${x.resource_version}</span></span>
            </button>`; }).join("")}
        </div>
      </section>
      ${q ? `
      <section class="panel" aria-labelledby="rd-h">
        <div class="panel-head"><div><h2 id="rd-h">${esc(q.title)}</h2><div class="tiny faint" style="margin-top:2px">${q.kind} · resource_version ${q.resource_version}</div></div></div>
        <div class="panel-body stack-sm" style="gap:16px">
          <div class="note warn">${icon("flag")}<div>${esc(q.why)}</div></div>
          <div class="stack-sm" style="gap:6px"><h3>Automated checks</h3>
            ${q.checks.map((c) => `<div class="row small">${c.ok ? `<span style="color:var(--pass)">${icon("check")}</span>` : `<span style="color:var(--fail)">${icon("x")}</span>`}<span>${c.label}</span></div>`).join("")}
            <p class="tiny faint">Passing checks don't make content correct; two model calls agreeing isn't proof.</p>
          </div>
          <div class="stack-sm" style="gap:6px"><h3>Provenance</h3><div class="prov">${esc(q.provenance)}</div></div>
          ${dec ? `<div class="note ${dec.decision === "approved" ? "pass" : "fail"}">${icon(dec.decision === "approved" ? "circle-check" : "circle-x")}<div><b>${dec.decision === "approved" ? "Approved" : "Rejected"}</b> by ${D.instructor.name} at ${dec.at}. “${esc(dec.reason)}”<div class="tiny" style="margin-top:4px">Decisions are append-only. Changing this later records a new decision.</div></div></div>` : `
          <div class="field"><label for="reason">Reason (required, saved with the decision)</label><textarea class="textarea" id="reason" rows="3" data-reason placeholder="e.g. Range loops don't need lists; keep as related_to instead."></textarea></div>
          <div class="row"><button class="btn btn-primary" type="button" data-decide="approved" disabled>${icon("check")}Approve</button><button class="btn btn-danger" type="button" data-decide="rejected" disabled>${icon("x")}Reject</button></div>`}
        </div>
      </section>` : `<section class="panel"><div class="empty">${icon("inbox")}<p>Nothing waiting in this group.</p></div></section>`}
    </div>`;
  }

  // ---------- settings ----------
  function pageSettings() {
    const S = state.settings;
    return `
    <div class="page-head"><div><h1>Settings & privacy</h1><p>What Socratix stores about your learning, who can see it, and what you can change.</p></div></div>
    <div class="two">
      <section class="panel" aria-labelledby="pv-h">
        <div class="panel-head"><h2 id="pv-h">Privacy</h2></div>
        <div class="panel-body">
          <div class="setting"><div><b class="small" style="font-weight:500">Reflections are private</b><p class="tiny faint">Only you can read them. They're never shown to other students or published. Blog export isn't available.</p></div><span class="badge b-neutral plain">${icon("lock")} Always on</span></div>
          <div class="setting"><div><label class="small" for="s-ev" style="font-weight:500">Use confirmed reflections as learning evidence</label><p class="tiny faint">Self-reports are low-weight hints for what to practise. They never count as mastery.</p></div><input type="checkbox" class="switch" id="s-ev" data-set="evidence" ${S.evidence ? "checked" : ""}></div>
          <div class="setting"><div><label class="small" for="s-rs" style="font-weight:500">Share anonymised evidence for research</label><p class="tiny faint">Off unless you consent. Covered by the institution's retention policy (to be confirmed).</p></div><input type="checkbox" class="switch" id="s-rs" data-set="research" ${S.research ? "checked" : ""}></div>
        </div>
      </section>
      <div class="stack">
        <section class="panel" aria-labelledby="st-h">
          <div class="panel-head"><h2 id="st-h">What's stored</h2></div>
          <div class="panel-body">
            <table class="data"><tbody>
              <tr><td>Plans and confirmed tags</td><td class="muted small">Until you delete them</td></tr>
              <tr><td>Attempts, code and test results</td><td class="muted small">Append-only evidence</td></tr>
              <tr><td>Hints used and answer reveals</td><td class="muted small">Append-only evidence</td></tr>
              <tr><td>Reflections</td><td class="muted small">Private</td></tr>
              <tr><td>Skill estimates</td><td class="muted small">Recomputed from evidence</td></tr>
            </tbody></table>
          </div>
          <div class="panel-foot"><button class="btn btn-sm" type="button" data-toast="Export request sent. You'll be notified when it's ready.">${icon("download")}Request my data</button></div>
        </section>
        <section class="panel" aria-labelledby="ac-h">
          <div class="panel-head"><h2 id="ac-h">Account</h2></div>
          <div class="panel-body"><dl class="kv"><dt>Name</dt><dd>${D.student.name}</dd><dt>Role</dt><dd>${state.role}</dd><dt>Course</dt><dd>${D.student.course}</dd></dl></div>
        </section>
      </div>
    </div>`;
  }

  // ---------- login ----------
  function pageLogin() {
    const steps = ["Plan", "Practise", "Hint", "Reflect", "Reassess"];
    return `
    <div class="login">
      <div class="login-theme">${themeToggle()}</div>
      <section class="login-art">
        <div class="brand"><span class="brand-name" style="font-size:1.25rem">Socratix</span></div>
        <div class="stack-sm" style="gap:20px">
          <h1 style="font-size:2rem;max-width:16ch">Learn to solve it yourself.</h1>
          <p class="muted" style="max-width:48ch">Practice that adapts to your goals, hints that ask before they tell, and evidence of what you can now do without help.</p>
          <svg class="loop" viewBox="0 0 520 120" role="img" aria-label="Learning loop: plan, practise, hint, reflect, reassess">
            ${steps.map((s, i) => `<rect x="${i * 104 + 2}" y="40" width="86" height="36" rx="6"/><text x="${i * 104 + 45}" y="63" text-anchor="middle">${s}</text>${i < 4 ? `<path d="M${i * 104 + 88} 58 H ${i * 104 + 104}"/>` : ""}`).join("")}
            <path d="M458 76 V 100 H 45 V 76" stroke-dasharray="4 4"/>
          </svg>
        </div>
        <p class="tiny faint">Design prototype · sample data</p>
      </section>
      <section class="login-form">
        <form data-login>
          <h2 style="font-size:1.25rem">Sign in</h2>
          <div class="field"><label for="em">University email</label><input class="input" id="em" type="email" autocomplete="username" value="sam.rivera@example.ac.uk"></div>
          <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="current-password" value="prototype"></div>
          <div class="field"><span class="label" id="sr-l">Prototype role</span><div class="seg" role="group" aria-labelledby="sr-l"><button type="button" data-lrole="student" aria-pressed="${state.role === "student"}">Student</button><button type="button" data-lrole="instructor" aria-pressed="${state.role === "instructor"}">Instructor</button></div></div>
          <button class="btn btn-primary" type="submit">Sign in</button>
          <p class="tiny faint">The sign-in provider hasn't been chosen yet. In the real app your role comes from the server and decides where you land.</p>
        </form>
      </section>
    </div>`;
  }

  // ---------- behaviour ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let routeGen = 0; // bumps on navigation so pending simulated jobs stop updating other screens
  const stillOn = (gen) => gen === routeGen;

  function bind(id) {
    app.querySelectorAll("[data-toast]").forEach((b) => b.addEventListener("click", () => toast(b.dataset.toast)));
    app.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
      state.theme = b.dataset.themeSet;
      document.documentElement.dataset.theme = state.theme;
      try { localStorage.setItem("socratix-theme", state.theme); } catch {}
      render();
      const f = app.querySelector(`[data-theme-set="${state.theme}"]`); f && f.focus();
    }));
    app.querySelectorAll("[data-role]").forEach((b) => b.addEventListener("click", () => { state.role = b.dataset.role; render(); }));
    const nb = app.querySelector('[data-act="nav"]');
    if (nb) nb.addEventListener("click", () => { state.navOpen = !state.navOpen; app.querySelector(".rail").classList.toggle("open", state.navOpen); nb.setAttribute("aria-expanded", state.navOpen); });

    const codeTa = app.querySelector("[data-code]");
    if (codeTa) {
      const hl = app.querySelector("[data-hl]"), gutter = app.querySelector(".gutter");
      const sync = () => {
        hl.innerHTML = hlPy(codeTa.value) + "\n";
        const n = codeTa.value.split("\n").length;
        if (gutter.children.length !== n) gutter.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join("");
        if (id === "learn") state.learn.code = codeTa.value;
      };
      codeTa.addEventListener("input", sync);
      codeTa.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const s = codeTa.selectionStart; codeTa.setRangeText("    ", s, codeTa.selectionEnd, "end"); sync(); }
      });
    }

    const on = (sel, fn, ev = "click") => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));

    if (id === "dashboard") {
      on('[data-act="toggle-override"]', (b) => { const o = app.querySelector("#override"); o.hidden = !o.hidden; b.setAttribute("aria-expanded", String(!o.hidden)); });
      on('[data-act="generate"]', async () => {
        if (state.dash.generating === "succeeded") { location.hash = "#/learn/stock-status"; return; }
        const gen = routeGen;
        for (const s of ["queued", "running", "succeeded"]) {
          if (!stillOn(gen)) { state.dash.generating = null; return; }
          state.dash.generating = s; render(); await sleep(s === "succeeded" ? 0 : 900);
        }
        if (stillOn(gen)) toast("Exercise verified and published. Ready when you are.");
      });
    }

    if (id === "plan") {
      const P = state.plan;
      on("#plan-text", (t) => { P.text = t.value; }, "input");
      on("[data-horizon]", (b) => { P.horizon = b.dataset.horizon; render(); });
      on('[data-act="suggest"]', async () => { const gen = routeGen; P.loading = true; P.confirmed = false; render(); await sleep(1100); P.loading = false; P.proposed = true; if (stillOn(gen)) render(); });
      on("[data-tag]", (c) => { c.checked ? P.selected.add(c.dataset.tag) : P.selected.delete(c.dataset.tag); P.confirmed = false; render(); }, "change");
      on('[data-act="add-skill"]', () => { const v = app.querySelector("#add-skill").value; P.added.push(v); P.selected.add(v); P.confirmed = false; render(); });
      on('[data-act="reject-all"]', () => { P.selected.clear(); P.confirmed = false; render(); toast("All suggestions rejected. Your plan has no tags."); });
      on('[data-act="confirm-plan"]', () => { P.confirmed = true; render(); toast(`Plan confirmed with ${P.selected.size} tags.`); });
    }

    if (id === "skills") {
      on("[data-view]", (b) => { state.skills.view = b.dataset.view; render(); });
      const pick = (el) => { state.skills.selected = el.dataset.skill; state.skills.challenged = false; render(); const f = app.querySelector(`.gnode[data-skill="${el.dataset.skill}"]`) || app.querySelector("#sd-h"); f && f.focus && f.focus({ preventScroll: true }); };
      on("[data-skill]", pick);
      on(".gnode", (g, e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(g); } }, "keydown");
      on('[data-act="challenge"]', () => { state.skills.challenged = true; render(); toast("Reassessment job queued: a new diagnostic in a fresh context."); });
    }

    if (id === "learn") {
      const L = state.learn;
      on("[data-expl]", (t) => { L.explanation = t.value; }, "input");
      on('[data-act="submit"]', async () => {
        const fixed = /elif\s+quantity\s*(<=\s*3|<\s*4)\b/.test(L.code);
        L.attempt += L.job === "done" ? 1 : 0;
        const gen = routeGen;
        for (const s of ["queued", "running"]) { L.job = s; if (stillOn(gen)) render(); await sleep(800); }
        L.job = "done"; L.outcome = fixed ? "pass" : "fail";
        if (!stillOn(gen)) return;
        render(); toast(fixed ? "All 4 tests passed." : "3 of 4 tests passed. T4 (R2) still fails.");
      });
      on('[data-act="reset-code"]', () => { L.code = D.starterCode; render(); });
      on('[data-act="hint"]', () => { L.hintsUsed = Math.min(3, L.hintsUsed + 1); render(); toast(`Level ${L.hintsUsed} hint recorded for attempt ${L.attempt}.`); });
      on('[data-act="arm"]', () => { L.revealArmed = true; render(); });
      on('[data-act="unarm"]', () => { L.revealArmed = false; L.revealAck = false; render(); });
      on('[data-act="ack"]', (c) => { L.revealAck = c.checked; render(); }, "change");
      on('[data-act="reveal"]', () => { L.revealed = true; L.revealArmed = false; render(); toast("Answer revealed. This attempt is marked assisted."); });
      on("[data-outcome]", (b) => { L.job = "done"; L.outcome = b.dataset.outcome; render(); });
    }

    if (id === "projects") {
      on("[data-tab]", (b) => { state.project.tab = b.dataset.tab; render(); });
      on("[data-ms]", (b) => { if (b.getAttribute("aria-disabled") === "true") { toast(`Locked until ${D.project.milestones.find((m) => m.milestone_id === b.dataset.ms).depends_on.join(", ")} is complete.`); } state.project.milestone = b.dataset.ms; render(); });
      on('[data-act="phint"]', () => { state.project.hintsUsed = 2; render(); });
    }

    if (id === "reflection") {
      const R = state.reflection;
      on("#conf-r", (r) => { R.confidence = +r.value; app.querySelector("#conf-v").textContent = `${r.value}%`; }, "input");
      on("[data-diff]", (b) => { R.difficulty = b.dataset.diff; render(); });
      on('[data-act="reflect"]', async (b) => { const gen = routeGen; b.classList.add("is-loading"); await sleep(900); R.step = "proposed"; if (stillOn(gen)) render(); });
      on("[data-rtag]", (c) => { c.checked ? R.tags.add(c.dataset.rtag) : R.tags.delete(c.dataset.rtag); render(); }, "change");
      on('[data-act="evtoggle"]', (c) => { R.evidence = c.checked; }, "change");
      on('[data-act="confirm-reflection"]', () => { R.step = "saved"; render(); });
      on('[data-act="dismiss-reflection"]', () => { R.tags.clear(); R.step = "saved"; render(); });
    }

    if (id === "review") {
      const R = state.review;
      on("[data-filter]", (b) => { R.filter = b.dataset.filter; const first = D.reviewQueue.find((x) => R.filter === "all" || x.resource_type === R.filter); if (first) R.selected = first.id; render(); });
      on("[data-q]", (b) => { R.selected = b.dataset.q; render(); });
      on("[data-reason]", (t) => { app.querySelectorAll("[data-decide]").forEach((b) => (b.disabled = t.value.trim().length < 5)); }, "input");
      on("[data-decide]", (b) => {
        const reason = app.querySelector("[data-reason]").value.trim();
        R.decisions[R.selected] = { decision: b.dataset.decide, reason, at: new Date().toISOString().slice(11, 16) + " UTC" };
        render(); toast(`Decision recorded: ${b.dataset.decide}.`);
      });
    }

    if (id === "settings") {
      on("[data-set]", (c) => { state.settings[c.dataset.set] = c.checked; toast("Preference saved."); }, "change");
    }

    if (id === "login") {
      on("[data-lrole]", (b) => { state.role = b.dataset.lrole; render(); });
      on("[data-login]", (f, e) => { e.preventDefault(); location.hash = state.role === "instructor" ? "#/review" : "#/dashboard"; }, "submit");
    }
  }

  render();
})();
