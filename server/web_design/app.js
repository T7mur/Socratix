// Socratix — clickable design prototype. Hash-routed, sample data; ELM calls go through our server only when a dev token is set.
(() => {
  "use strict";

  const D = window.SAMPLE;
  // The sample data is written for Mon 26 Oct 2026; move every date so the demo runs on the real today.
  (() => {
    const n = new Date(), real = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const shift = Math.round((Date.parse(real) - Date.parse(D.planning.today)) / 86400000);
    const mv = (s) => new Date(Date.parse(s + "T00:00:00Z") + shift * 86400000).toISOString().slice(0, 10);
    const walk = (o) => Object.keys(o).forEach((k) => { const v = o[k]; if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) o[k] = mv(v); else if (v && typeof v === "object") walk(v); });
    if (shift) walk(D);
  })();

  // ---------- state (would come from the API in the real app) ----------
  const state = {
    role: "student",
    navOpen: false,
    skills: { view: "graph", selected: "python.conditionals", challenged: false },
    moreOpen: false,
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
    { id: "today", label: "Today", icon: "house", href: "#/" },
    { id: "plan", label: "Plan", icon: "calendar-range", href: "#/plan" },
    { id: "practice", label: "Practice", icon: "book-open-check", href: "#/practice" },
    { id: "reflection", label: "Reflection", icon: "notebook-pen", href: "#/reflection" },
    { id: "progress", label: "Progress", icon: "chart-column", href: "#/progress" },
    { id: "skills", label: "Skills", icon: "network", href: "#/skills" },
    { id: "project", label: "Project", icon: "folder-kanban", href: "#/project" },
  ];

  const ROUTES = {
    today: { title: "Today", render: () => PL.today(hashParts()) },
    plan: { title: "Plan", render: () => PL.render(hashParts()) },
    progress: { title: "Progress", render: () => PL.progress() },
    skills: { title: "Skills", render: pageSkills },
    practice: { title: "Practice", render: () => PR.render(hashParts()) },
    project: { title: "Project", render: () => PJ.render(hashParts()) },
    reflection: { title: "Reflection", render: () => RF.render() },
    review: { title: "Review queue", parent: "Instructor", render: pageReview },
    settings: { title: "Settings", render: pageSettings },
  };

  let PR, PL, PJ, RF, TU; // Practice, Planning, Project, Reflection and Tutorial modules, created once the helpers below exist
  function hashParts() {
    const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
    return { path: path.split("/").filter(Boolean).slice(1), query: Object.fromEntries(new URLSearchParams(qs || "")) };
  }

  function currentRoute() {
    const seg = (location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0] || "today");
    if (seg === "dashboard") return "today";
    if (seg === "learn") { location.replace("#/practice/list-total"); return "practice"; }
    if (seg === "projects") { location.replace("#/project"); return "project"; }
    if (seg === "today" && /checkin=1/.test(location.hash)) { location.replace("#/reflection"); return "reflection"; } // C3: the check-in lives in Reflection
    if (seg === "login") return "login";
    return ROUTES[seg] ? seg : "today";
  }

  // quiet: re-render in place (no page fade), used for interactions; navigation fades in
  function render(focus = false, quiet = false) {
    const id = currentRoute();
    if (id === "login") {
      app.innerHTML = pageLogin();
    } else {
      const r = id === "practice" ? { ...ROUTES.practice, ...PR.meta(hashParts()) } : id === "plan" ? { ...ROUTES.plan, ...PL.meta(hashParts()) } : id === "project" ? { ...ROUTES.project, ...PJ.meta(hashParts()) } : ROUTES[id];
      app.innerHTML = shell(id, r, r.render(), quiet);
    }
    bind(id);
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    if (focus) {
      const h = app.querySelector("[data-autofocus]") || app.querySelector("h1");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener("hashchange", () => { routeGen++; state.navOpen = false; state.moreOpen = false; render(true); });

  // ---------- phone bottom bar (C2): Today · Plan · Practice · Reflect · More ----------
  function bottomBar(id) {
    const more = [["progress", "Progress", "chart-column", "#/progress"], ["skills", "Skills", "network", "#/skills"], ["project", "Project", "folder-kanban", "#/project"], ["settings", "Settings", "settings", "#/settings"]];
    if (state.role === "instructor") more.push(["review", "Review queue", "shield-check", "#/review"]);
    const inMore = more.some(([k]) => k === id);
    const a = (k, l, ic, h) => `<a href="${h}" ${k === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`;
    return `<nav class="bottombar" aria-label="Main (phone)">
      ${a("today", "Today", "house", "#/")}${a("plan", "Plan", "calendar-range", "#/plan")}${a("practice", "Practice", "book-open-check", "#/practice")}${a("reflection", "Reflect", "notebook-pen", "#/reflection")}
      <button type="button" data-act="more" aria-expanded="${state.moreOpen}" aria-controls="more-sheet" ${inMore ? 'aria-current="page"' : ""}>${icon("ellipsis")}<span>More</span></button>
    </nav>
    <div class="more-sheet ${state.moreOpen ? "open" : ""}" id="more-sheet" ${state.moreOpen ? "" : "hidden"}><div class="more-inner" role="menu" aria-label="More">${more.map(([k, l, ic, h]) => `<a role="menuitem" href="${h}" ${k === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${l}</span></a>`).join("")}</div></div>`;
  }

  // ---------- shell ----------
  function shell(id, r, body, quiet) {
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
          ${TU.helpButton()}
          ${themeToggle()}
        </header>
        <main id="content" class="page ${quiet ? "" : "fade-in"}">${body}</main>
      </div>
      ${bottomBar(id)}
    </div>`;
  }

  // ---------- shared ----------
  function meter(label, v, color) {
    return `<div class="meter ${v == null ? "none" : ""}"><span class="muted">${label}</span><span class="track" role="img" aria-label="${label} index ${v == null ? "insufficient evidence" : idx(v)}"><span class="fill" style="width:${v == null ? 0 : v * 100}%;background:${color}"></span></span><span class="val">${v == null ? "n/a" : idx(v)}</span></div>`;
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
      <section class="panel" aria-label="${v === "graph" ? "Skill graph" : "Skill list"}" data-tour="skills-map">
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
    </div>
    ${(() => { const R = D.reflection, tr = R.depthTrend.slice(-5), avg = Math.round(tr.reduce((a, b) => a + b, 0) / tr.length), c = R.calibration; const L = ["", "Describes", "Explains", "Plans"];
      return `<section class="panel reflect-skill" aria-labelledby="rs-h" style="margin-top:20px"><div class="panel-head"><h2 id="rs-h">Reflection</h2><span class="sub">a skill too · ${icon("lock")} only you see this</span></div>
        <div class="panel-body"><dl class="kv"><dt>Depth</dt><dd>Usually <b>${L[avg]}</b> (level ${avg} of 3) over your last ${tr.length} reflections</dd><dt>Self-assessment</dt><dd>${c.matched} of ${c.total} concepts rated in line with the check (last 14 days)</dd></dl>
        <p class="tiny faint" style="margin-top:8px">Levels: 1 describes what happened · 2 names a cause · 3 adds a next step. <a href="#/progress">See the trend</a></p></div></section>`; })()}`;
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
    ${PL.settingsSection()}
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
              <tr><td>Plans, ticks and time ratings (under your nickname)</td><td class="muted small">Until you delete them</td></tr>
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
      };
      codeTa.addEventListener("input", sync);
      codeTa.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const s = codeTa.selectionStart; codeTa.setRangeText("    ", s, codeTa.selectionEnd, "end"); sync(); }
      });
    }

    const on = (sel, fn, ev = "click") => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));

    TU.bindHelp(app);
    const mb = app.querySelector('[data-act="more"]');
    if (mb) mb.addEventListener("click", () => { state.moreOpen = !state.moreOpen; const sh = app.querySelector("#more-sheet"); sh.hidden = !state.moreOpen; sh.classList.toggle("open", state.moreOpen); mb.setAttribute("aria-expanded", String(state.moreOpen)); if (state.moreOpen) sh.querySelector("a").focus(); });
    if (id === "practice") PR.bind(app, hashParts());
    if (id === "project") { PJ.bind(app, hashParts()); PL.bind(app, id, hashParts()); }       // PL: shared "Prototype only" controls
    if (id === "reflection") { RF.bind(app); PL.bind(app, id, hashParts()); }
    if (id === "today" || id === "plan" || id === "progress" || id === "settings") PL.bind(app, id, hashParts());
    if (id === "plan") setTimeout(() => TU.planWelcome(), 350); // first Plan visit only

    if (id === "skills") {
      on("[data-view]", (b) => { state.skills.view = b.dataset.view; render(); });
      const pick = (el) => { state.skills.selected = el.dataset.skill; state.skills.challenged = false; render(); const f = app.querySelector(`.gnode[data-skill="${el.dataset.skill}"]`) || app.querySelector("#sd-h"); f && f.focus && f.focus({ preventScroll: true }); };
      on("[data-skill]", pick);
      on(".gnode", (g, e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(g); } }, "keydown");
      on('[data-act="challenge"]', () => { state.skills.challenged = true; render(); toast("Reassessment job queued: a new diagnostic in a fresh context."); });
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
      on("[data-login]", (f, e) => { e.preventDefault(); location.hash = state.role === "instructor" ? "#/review" : "#/"; setTimeout(() => TU.maybeWelcome(), 400); }, "submit");
    }
  }

  const listeners = {};
  const SX = {
    D, esc, icon, toast, hlPy, sleep,
    gen: () => routeGen, stillOn,
    render: () => render(false, true),
    icons: () => window.lucide && window.lucide.createIcons({ attrs: { "aria-hidden": "true" } }),
    on: (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn),
    emit: (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data)),
  };
  PL = window.PlanningModule(SX);
  SX.planTask = PL.planTask;
  PR = window.PracticeModule(SX);
  PJ = window.ProjectModule(SX, PL);
  RF = window.ReflectionModule(SX, PL);
  TU = window.TutorialModule(SX);
  render();
  setTimeout(() => TU.maybeWelcome(), 500); // first sign-in: there's no auth gate in the prototype, so the first app open counts
})();
