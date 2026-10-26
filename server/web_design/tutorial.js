// Socratix — Tutorial: welcome on first sign-in, the ? help menu, and a 12-step tour (driver.js 1.3.1).
// Built from demo_features_spec.md §1. The tour only reads the demo data; it never writes anything.
window.TutorialModule = (SX) => {
  "use strict";
  const { icon, toast } = SX;

  // §1.4 exact copy. route = hash path ("" = Today); null = stays on the current page (top bar)
  const STEPS = [
    { route: "", target: null, title: "Socratix in one minute", text: "Plan your day, practise with hints, reflect in the evening. As you improve, help fades." },
    { route: "", target: "today-card", title: "Today", text: "Your plan at a glance: next task, what's due this week, and the evening reflection." },
    { route: "plan", target: "plan-setup", title: "Plan: setup", text: "Add deadlines once (type them or paste text) and split each into milestones. Socratix asks questions; you decide." },
    { route: "plan/today/2", target: "task-table", title: "Plan: your day", text: "Write each task as <em>what exactly, when, how long</em>. Socratix suggests improvements; you can always say \"this works for me\". After 4 good plans out of 5, feedback gets lighter." },
    { route: "practice", target: "practice-list", title: "Practice", text: "Exercises in Python, linear algebra and logic, picked from your gaps. Every answer is checked automatically." },
    { route: "practice/list-total", target: "hint-panel", title: "Hints, not answers", text: "Hints grow step by step: a self-check, where to look, a targeted hint, a similar example, then \"Rebuild it\". You never get the full solution before you solve it." },
    { route: "reflection", target: "reflection-tasks", title: "Reflection", text: "Each evening, look back: how hard was each task, what did you understand, what got in the way?" },
    { route: "reflection", target: "independence-check", title: "Independence check", text: "A short no-hints check on today's topics shows what really stuck. Results update your gaps and tomorrow's plan." },
    { route: "project", target: "project-start", title: "Projects", text: "Describe a project idea; Socratix asks a few questions and drafts a plan with milestones that flow into your daily plans." },
    { route: "progress", target: "progress-summary", title: "Progress", text: "Your exercises, concepts and planning over time." },
    { route: "skills", target: "skills-map", title: "Skills", text: "The skills your programme expects in first year, and where you're strong or still building." },
    { route: null, target: "help-button", title: "Need this again?", text: "Press ? any time for the tour or an explanation of the page you're on." },
  ];

  // Account flag. The real app stores students.tutorial_seen_at on the server so it follows the
  // account; this prototype has no server, so a clearly named stand-in keeps it in this browser.
  const ACCOUNT_KEY = "socratix-sim-server:students.tutorial_seen_at";
  const seen = () => { try { return !!localStorage.getItem(ACCOUNT_KEY); } catch { return false; } };
  const markSeen = () => { try { localStorage.setItem(ACCOUNT_KEY, new Date().toISOString()); } catch { /* stays in memory */ } };
  const resetSeen = () => { try { localStorage.removeItem(ACCOUNT_KEY); } catch { /* ignore */ } };

  const routeNow = () => location.hash.replace(/^#\/?/, "").split("?")[0].replace(/\/$/, "");
  const sameRoute = (a, b) => a === b || (a === "" && (b === "" || b === "today" || b === "dashboard"));
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => window.matchMedia("(max-width: 639px)").matches;

  // ---------- welcome (§1.1) ----------
  function welcomeEl() {
    let d = document.getElementById("welcome");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "welcome"; d.className = "dlg welcome"; d.setAttribute("aria-labelledby", "wl-h");
    d.innerHTML = `<div class="wl-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/><path d="M15 25l6 6 12-13"/></svg></div>
      <h2 id="wl-h">Welcome to Socratix</h2>
      <p>Socratix helps you plan, practise and reflect, and it gives you less help as you get better. The goal is that one day you won't need it.</p>
      <div class="row"><button class="btn btn-primary" type="button" data-wl="tour">Take the tour (2 min)</button><button class="btn" type="button" data-wl="later">Not now</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-wl]"); if (!b) return;
      markSeen(); d.close();
      if (b.dataset.wl === "tour") start(); else toast("You can start the tour any time from the ? button.");
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); }); // a choice is required: either button sets the flag
    return d;
  }
  function maybeWelcome() {
    if (seen() || location.hash.startsWith("#/login")) return;
    const d = welcomeEl(); if (!d.open) { d.showModal(); d.querySelector('[data-wl="tour"]').focus(); }
  }

  // ---------- tour (§1.3) ----------
  let drv = null, live = null, lastPct = 0, pulsed = null;
  const waitFor = (sel, ms = 2000) => new Promise((res) => {
    const t0 = Date.now();
    (function poll() { const el = sel && document.querySelector(sel); if (!sel || el || Date.now() - t0 > ms) return res(el); setTimeout(poll, 60); })();
  });
  function announce(text) {
    if (!live) { live = document.createElement("div"); live.className = "sr-only"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live); }
    live.textContent = text;
  }
  function pulse(el) {
    if (pulsed) pulsed.classList.remove("tour-pulse");
    pulsed = el || null;
    if (el && !reduced()) { el.classList.remove("tour-pulse"); void el.offsetWidth; el.classList.add("tour-pulse"); }
  }
  async function goTo(steps, i) {
    const s = steps[i];
    if (s.route !== null && !sameRoute(s.route, routeNow())) { location.hash = "#/" + s.route; }
    else if (s.target && !document.querySelector(`[data-tour="${s.target}"]`)) SX.render(); // tour mode can change what a page shows (e.g. Reflection's example)
    const el = await waitFor(s.target ? `[data-tour="${s.target}"]` : null);
    if (el && phone()) el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    return el;
  }

  async function run(indices) {
    const factory = window.driver && window.driver.js && window.driver.js.driver;
    if (!factory) { toast("The tour couldn't load. Check your connection and try again."); return; }
    if (drv) drv.destroy();
    const steps = indices.map((i) => STEPS[i]), total = steps.length, onPhone = phone();
    SX.touring = true; lastPct = 0;
    document.body.classList.toggle("sx-phone-tour", onPhone); // phone: no spotlight; the target is lifted above the dim layer instead
    await goTo(steps, 0);
    drv = factory({
      animate: !reduced(), smoothScroll: !reduced(), allowClose: true, allowKeyboardControl: true,
      overlayOpacity: 0.58, stagePadding: onPhone ? 0 : 8, stageRadius: 12, popoverOffset: 14,
      showButtons: ["next", "previous"], showProgress: true, progressText: "{{current}} of {{total}}",
      nextBtnText: "Next", prevBtnText: "Back", doneBtnText: "Done",
      popoverClass: `sx-tour${onPhone ? " sx-sheet" : ""}${reduced() ? " sx-still" : ""}`,
      steps: steps.map((s) => ({ element: !onPhone && s.target ? `[data-tour="${s.target}"]` : undefined, popover: { title: s.title, description: s.text, side: "bottom", align: "start" } })),
      onNextClick: () => move(+1), onPrevClick: () => move(-1),
      onDestroyStarted: () => drv.destroy(),
      onDestroyed: () => { SX.touring = false; pulse(null); drv = null; document.body.classList.remove("sx-phone-tour"); SX.render(); },
      onHighlighted: (el, step) => { announce(`${step.popover.title}. ${step.popover.description.replace(/<[^>]+>/g, "")}`); pulse(onPhone ? document.querySelector(`[data-tour="${steps[drv.getActiveIndex()].target}"]`) : el && el.id !== "driver-dummy-element" ? el : null); },
      onPopoverRender: (pop, { state }) => {
        const i = state.activeIndex ?? 0, pct = ((i + 1) / total) * 100;
        // Skip tour, left of Back · Next
        const skip = document.createElement("button"); skip.type = "button"; skip.className = "sx-skip"; skip.textContent = "Skip tour";
        skip.addEventListener("click", () => drv.destroy());
        pop.footer.insertBefore(skip, pop.footer.firstChild);
        // thin progress bar that fills to N/12
        const bar = document.createElement("div"); bar.className = "sx-bar"; bar.innerHTML = `<span style="width:${lastPct}%"></span>`;
        pop.wrapper.insertBefore(bar, pop.wrapper.firstChild);
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.firstChild.style.width = pct + "%"; }));
        lastPct = pct;
        // replay the card's entrance on every step (driver.js reuses the element)
        pop.wrapper.classList.remove("sx-anim"); void pop.wrapper.offsetWidth; pop.wrapper.classList.add("sx-anim");
        setTimeout(() => pop.nextButton && pop.nextButton.focus({ preventScroll: true }), 30);
      },
    });
    async function move(dir) {
      const i = drv.getActiveIndex() + dir;
      if (i < 0) return;
      if (i >= total) { drv.destroy(); return; }
      await goTo(steps, i);
      if (!drv) return;
      drv.moveTo(i); // moveTo keeps one overlay; drive() would re-initialise and leave a stale one behind
    }
    drv.drive(0);
  }

  const start = () => run(STEPS.map((_, i) => i));
  function explain() {
    const here = routeNow();
    const idx = STEPS.map((s, i) => (s.route !== null && sameRoute(s.route, here) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) { toast("There's no explanation for this page yet. Try the full tour."); return; }
    run(idx);
  }

  // ---------- help button + menu (§1.2) ----------
  const helpButton = () => `<div class="help-wrap"><button class="icon-btn help-btn" type="button" data-help aria-label="Help" aria-haspopup="menu" aria-expanded="false" data-tour="help-button">${icon("circle-help")}</button>
    <div class="help-menu" role="menu" hidden><button type="button" role="menuitem" data-help-act="tour">${icon("map")}Take the full tour</button><button type="button" role="menuitem" data-help-act="explain">${icon("scan-search")}Explain this page</button></div></div>`;
  function bindHelp(root) {
    const btn = root.querySelector("[data-help]"); if (!btn) return;
    const menu = btn.nextElementSibling;
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); if (open) menu.querySelector("button").focus(); });
    menu.addEventListener("click", (e) => { const b = e.target.closest("[data-help-act]"); if (!b) return; close(); b.dataset.helpAct === "tour" ? start() : explain(); });
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll("button")], k = items.indexOf(document.activeElement);
      if (e.key === "Escape") { close(); btn.focus(); }
      if (e.key === "ArrowDown") { e.preventDefault(); items[(k + 1) % items.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(k - 1 + items.length) % items.length].focus(); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".help-wrap")) close(); }, { once: true });
  }

  return { maybeWelcome, start, explain, helpButton, bindHelp, resetSeen, STEPS };
};
