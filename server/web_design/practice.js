// Socratix — Practice (exercises): landing, solve screen, wrap-up, independence challenges, uploads.
// Built from practice_ui_structure.md v1.0 (structure) and practice_spec.md v1 (rules; the spec wins).
// Sample data only. SERVER below simulates the API so the prototype is clickable; in the real app
// the server owns every rule (levels, locks, real change, escape timer, H4 checks, scheduling).
window.PracticeModule = (SX) => {
  "use strict";
  const { D, esc, icon, toast, hlPy, sleep } = SX;
  const P = D.practice;
  const C = P.config;
  const ALL_ITEMS = [...P.items, ...P.uploadItems];
  const itemById = (id) => ALL_ITEMS.find((i) => i.id === id);
  const subj = (id) => P.subjects.find((s) => s.id === id);
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

  const LEVEL = ["Where to look", "The idea", "Your answer", "Similar example", "Last step"];
  const STATUS = {
    new: { glyph: "○", word: "New", cls: "s-new" },
    in_progress: { glyph: "…", word: "In progress", cls: "s-prog" },
    solved_with_hints: { glyph: "◐", word: "Solved with hints", cls: "s-hints" },
    solved_on_own: { glyph: "✓", word: "Solved on your own", cls: "s-own" },
  };
  const UPLOAD = { preparing: ["Preparing", "b-warn"], verified: ["Verified", "b-pass"], unverified: ["Unverified", "b-warn"], failed: ["Failed", "b-fail"] };
  const badge = (status) => { const s = STATUS[status]; return `<span class="sbadge ${s.cls}"><span aria-hidden="true">${s.glyph}</span>${s.word}</span>`; };

  // ---------- state (server-owned in the real app; kept here for the prototype) ----------
  const st = {
    firstVisit: false,
    filter: "all",
    loaded: false,
    uploadsOpen: false,
    upload: { source: "pdf", subject: "auto", confirmed: false, file: "", text: "", outcome: "verified" },
    uploads: P.uploads.map((u) => ({ ...u })),
    uploadsToday: 1,
    quickDone: new Set(P.quick.filter((q) => q.done).map((q) => q.id)),
    quickRes: {},
    mixed: { answers: {}, results: {}, done: false },
    sim: "normal",
    pane: "work",
    predict: false,
    sessions: {},
  };
  P.items.forEach((i) => (i._status = i.status));
  P.uploadItems.forEach((i) => (i._status = i.status));

  function sess(item) {
    if (!st.sessions[item.id]) {
      const solved = item._status === "solved_on_own" || item._status === "solved_with_hints";
      st.sessions[item.id] = {
        answer: Array.isArray(item.starter) ? item.starter.map((x) => (typeof x === "object" ? { ...x } : x)) : item.starter,
        lastRunNorm: null, runs: 0, lastFail: null, sameFail: 0,
        level: -1, maxLevel: solved ? (item._status === "solved_on_own" ? 0 : 3) : -1,
        hints: [], pending: null, escape: false, notReal: false, dirty: false,
        running: false, phase: null, output: null, compileErr: null,
        solved, taskOpen: true, chip: null, otherText: "", h4: null, glow: false, fresh: null,
        explainFeedback: null, wrap: { why: "", feedback: null, skipped: false, predicted: null, showModel: false },
      };
    }
    return st.sessions[item.id];
  }

  // ---------- simulated SERVER: checking + hint rules (never shipped to a browser for real) ----------
  const SERVER = (() => {
    const strip = (code, lang) => code.split("\n").map((l) => l.replace(lang === "haskell" ? /--.*$/ : /#.*$/, "")).join("\n");
    const flat = (code, lang) => strip(code, lang).replace(/\s+/g, "");
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    // Tiny arithmetic parser (numbers, + − * / parentheses). No eval.
    function arith(src) {
      const s = String(src).replace(/[·×]/g, "*").replace(/−/g, "-").replace(/\s+/g, "");
      let i = 0;
      const peek = () => s[i];
      function num() { const m = /^\d+(\.\d+)?/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); }
      function atom() { if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw 0; i++; return v; } if (peek() === "-") { i++; return -atom(); } return num(); }
      function term() { let v = atom(); while (peek() === "*" || peek() === "/") { const o = s[i++]; const r = atom(); v = o === "*" ? v * r : v / r; } return v; }
      function expr() { let v = term(); while (peek() === "+" || peek() === "-") { const o = s[i++]; const r = term(); v = o === "+" ? v + r : v - r; } return v; }
      try { if (!s) return null; const v = expr(); return i === s.length ? v : null; } catch { return null; }
    }

    // Propositional formula parser + truth tables (stands in for the Z3 / truth-table runner).
    function formula(src) {
      const t = String(src).replace(/<->/g, "↔").replace(/->/g, "→").replace(/\/\\/g, "∧").replace(/\\\//g, "∨").replace(/&/g, "∧").replace(/\|/g, "∨").replace(/[~!]/g, "¬").replace(/\s+/g, "");
      let i = 0;
      const vars = new Set();
      function atom() {
        const c = t[i];
        if (c === "¬") { i++; const a = atom(); return (v) => !a(v); }
        if (c === "(") { i++; const e = iff(); if (t[i] !== ")") throw 0; i++; return e; }
        if (c === "⊤" || c === "T") { i++; return () => true; }
        if (c === "⊥" || c === "F") { i++; return () => false; }
        const m = /^[a-z]\w*/.exec(t.slice(i)); if (!m) throw 0; i += m[0].length; vars.add(m[0]); const n = m[0]; return (v) => v[n];
      }
      function and() { let a = atom(); while (t[i] === "∧") { i++; const l = a, r = atom(); a = (v) => l(v) && r(v); } return a; }
      function or() { let a = and(); while (t[i] === "∨") { i++; const l = a, r = and(); a = (v) => l(v) || r(v); } return a; }
      function imp() { const a = or(); if (t[i] === "→") { i++; const b = imp(); return (v) => !a(v) || b(v); } return a; }
      function iff() { let a = imp(); while (t[i] === "↔") { i++; const l = a, r = imp(); a = (v) => l(v) === r(v); } return a; }
      try { if (!t) return null; const f = iff(); return i === t.length ? { f, vars: [...vars], text: t } : null; } catch { return null; }
    }
    const rows = (vars) => Array.from({ length: 1 << vars.length }, (_, k) => Object.fromEntries(vars.map((v, j) => [v, !((k >> (vars.length - 1 - j)) & 1)])));

    function syntaxCheck(code) {
      const lines = code.split("\n");
      for (let n = 0; n < lines.length; n++) {
        const l = lines[n].replace(/#.*$/, "").trimEnd();
        if (/^\s*(def|for|if|elif|else|while)\b/.test(l) && !l.endsWith(":")) return { line: n + 1, col: l.length + 1, message: "SyntaxError: expected ':'", note: `Line ${n + 1} starts a block (${l.trim().split(/\s|\(/)[0]}) but is missing the colon at the end.` };
      }
      return null;
    }

    // Each checker returns { compile?, visible:[{input,expected,got,passed}], hidden?: {...}, failKey, solvedForm }
    const checkers = {
      "list-total"(code) {
        const f = flat(code);
        const okLoop = /for(\w+)innums:/.test(f), acc = /total\+=(\w+)|total=total\+(\w+)/.test(f) || /returnsum\(nums\)/.test(f);
        const filt = /if\w+>=?0:/.test(f), one = /total=1/.test(f), early = /\n {8}return/.test(strip(code));
        if (!(okLoop && acc) && !/returnsum\(nums\)/.test(f)) return null;
        const vis = [[ [1, 2, 3], 6 ], [ [], 0 ], [ [5], 5 ]].map(([inp, exp]) => {
          let got = inp.reduce((a, b) => a + (filt && b <= 0 ? 0 : b), one ? 1 : 0); if (early && inp.length) got = (one ? 1 : 0) + inp[0];
          return { input: JSON.stringify(inp).replace(/,/g, ", "), expected: String(exp), got: String(got), passed: got === exp };
        });
        if (vis.some((v) => !v.passed)) return { visible: vis, failKey: one ? "start-1" : "early-return" };
        if (filt) { const a = -rnd(1, 9), b = -rnd(1, 9); return { visible: vis, hidden: { passed: false, category: "Negative numbers", input: `[${a}, ${b}]`, expected: String(a + b), got: "0" }, failKey: "negatives" }; }
        return { visible: vis, hidden: { passed: true }, failKey: null };
      },
      "digit-sum"(code) {
        const f = flat(code);
        if (/n%10/.test(f) && /digit_sum\(n\/\/10\)/.test(f)) return { visible: [["0", "0"], ["7", "7"], ["1234", "10"]].map(([i, e]) => ({ input: i, expected: e, got: e, passed: true })), hidden: { passed: true } };
        return null;
      },
      "hs-length"(code) {
        const f = flat(code, "haskell");
        const base0 = /myLength\[\]=0/.test(f), base1 = /myLength\[\]=1/.test(f), undef = /=undefined/.test(f);
        const step = /myLength\((\w+|_):(\w+)\)=1\+myLength\2/.test(f);
        const vis = [["myLength []", 0, 0], ["myLength [7, 8]", 2, 2], ["myLength \"abc\"", 3, 3]].map(([i, e, n]) => {
          let got;
          if (undef) got = "*** Exception: Prelude.undefined";
          else if (!step) got = "?";
          else got = String(n + (base1 ? 1 : base0 ? 0 : NaN));
          return { input: i, expected: String(e), got, passed: got === String(e) };
        });
        if (!undef && !step) return null;
        if (vis.some((v) => !v.passed)) return { visible: vis, failKey: undef ? "undefined" : "base" };
        return { visible: vis, hidden: { passed: true } };
      },
      "up-vowels"(code) {
        const f = flat(code);
        const member = /ch(in|in\.lower\(\)in)['"]aeiou/.test(f) || /in['"]aeiou(AEIOU)?['"]/.test(f), eq = /ch==['"]aeiou['"]/.test(f);
        if (!member && !eq) return null;
        const vis = [["\"banana\"", 3], ["\"\"", 0], ["\"sky\"", 0]].map(([i, e]) => { const got = eq ? 0 : e; return { input: i, expected: String(e), got: String(got), passed: got === e }; });
        if (vis.some((v) => !v.passed)) return { visible: vis, failKey: "equals" };
        return { visible: vis, hidden: { passed: true } };
      },
      "la-det"(steps) {
        let prev = 2, prevText = "det(A)";
        for (let n = 0; n < steps.length; n++) {
          const v = arith(steps[n]);
          if (v === null) return { visible: [], firstWrong: { step: n + 1, reason: "This step can't be read. Use numbers, + − · / and brackets." }, failKey: "parse-" + n };
          if (Math.abs(v - prev) > 1e-9) return { visible: [], firstWrong: { step: n + 1, reason: `Step ${n + 1} is not equal to ${n ? `step ${n} (${esc(prevText)})` : "det(A)"}.` }, failKey: "wrong-" + n };
          prev = v; prevText = steps[n];
        }
        if (!steps.length || !/^\s*-?\d+\s*$/.test(steps[steps.length - 1])) return { visible: [], firstWrong: { step: steps.length || 1, reason: "Every step is equal so far. Finish with a single number." }, failKey: "unfinished" };
        return { visible: [], hidden: { passed: true }, allStepsOk: steps.length };
      },
      "logic-equiv"(src) {
        const g = formula("¬(p∧q)"), a = formula(src);
        if (!a) return { compile: { line: 1, col: 1, message: "Can't read this formula", note: "Use p, q, ¬, ∨, →, ↔ and brackets." }, visible: [], failKey: "parse" };
        if (/∧/.test(a.text)) return { visible: [{ input: "uses ∧", expected: "no ∧", got: "∧ found", passed: false }], failKey: "uses-and" };
        const vars = [...new Set(["p", "q", ...a.vars])];
        const bad = rows(vars).filter((r) => g.f(r) !== a.f(r));
        if (bad.length) return { visible: [], rowsBad: bad.map((r) => ({ row: vars.map((v) => `${v}=${r[v] ? "T" : "F"}`).join(", "), expected: g.f(r) ? "T" : "F", got: a.f(r) ? "T" : "F" })), failKey: "rows-" + bad.length };
        return { visible: [], hidden: { passed: true }, allRows: 1 << vars.length };
      },
      "logic-proof"(steps, item) {
        const lines = [...item.premises.map((p) => formula(p))];
        for (let n = 0; n < steps.length; n++) {
          const s = steps[n], no = n + 3, f = formula(s.f);
          if (!f) return { visible: [], firstWrong: { step: no, reason: `Line ${no}: the formula can't be read.` }, failKey: "parse-" + n };
          const refs = String(s.refs).split(/[,\s]+/).filter(Boolean).map(Number);
          if (!refs.length || refs.some((r) => !(r >= 1 && r < no))) return { visible: [], firstWrong: { step: no, reason: `Line ${no}: cite earlier line numbers it follows from.` }, failKey: "refs-" + n };
          const prem = refs.map((r) => lines[r - 1]);
          const vars = [...new Set([...f.vars, ...prem.flatMap((p) => p.vars)])];
          const ok = rows(vars).every((r) => !prem.every((p) => p.f(r)) || f.f(r));
          if (!ok) return { visible: [], firstWrong: { step: no, reason: `Line ${no} doesn't follow from line${refs.length > 1 ? "s" : ""} ${refs.join(", ")}.`, rule: s.rule }, failKey: "invalid-" + n };
          lines.push(f);
        }
        const last = steps[steps.length - 1];
        if (!last || formula(last.f)?.text !== "q") return { visible: [], firstWrong: { step: steps.length + 3, reason: "Every line is valid so far. The last line should be the goal, q." }, failKey: "unfinished" };
        return { visible: [], hidden: { passed: true }, allStepsOk: steps.length };
      },
    };

    function check(item, answer) {
      if (item.type === "code") {
        if (item.language === "python") { const se = syntaxCheck(answer); if (se) return { compile: se, visible: [], failKey: "syntax" }; }
        const r = checkers[item.id](answer);
        return r || { unknown: true, visible: [], failKey: "unknown" };
      }
      if (item.type === "explanation") {
        const t = answer.toLowerCase();
        const a = /row/.test(t) && /(zero|0)/.test(t) && /(expan|every term|each term|product|multipl|linear)/.test(t);
        const b = /row/.test(t) && /(zero|0)/.test(t) && t.length > 50;
        return { explanation: a && b ? "complete" : a || b ? "unsure" : "incomplete", visible: [], failKey: "expl" };
      }
      return checkers[item.id](answer, item);
    }

    function normalize(item, answer) {
      if (item.type === "code") return flat(answer, item.language);
      if (item.type === "worked_steps") return answer.map((x) => x.replace(/\s+/g, "")).join("|");
      if (item.type === "logic_proof") return answer.map((x) => `${x.f}${x.rule}${x.refs}`.replace(/\s+/g, "")).join("|");
      return String(answer).replace(/\s+/g, " ").trim().toLowerCase();
    }
    // Explanation: a "real change" means more than 15% of the words differ.
    function isRealChange(item, prevNorm, norm) {
      if (prevNorm === null) return true;
      if (item.type !== "explanation") return prevNorm !== norm;
      const A = new Set(prevNorm.split(" ")), B = new Set(norm.split(" "));
      const inter = [...A].filter((w) => B.has(w)).length, uni = new Set([...A, ...B]).size || 1;
      return 1 - inter / uni > 0.15;
    }

    // Hint text per level. H0/H1/H3 come from the item (prepared offline); H2 is targeted at the student's own answer.
    function hint(item, level, s, opts) {
      const h = item.hints;
      const chipLead = { error: "About the error message: ", start: "A place to start: ", wrong: "About the wrong result: ", change: "One thing to change: ", other: "On what you described: " }[s.chip] || "";
      const fail = s.output && (s.output.hidden && !s.output.hidden.passed ? s.output.hidden : (s.output.visible || []).find((v) => !v.passed));
      let text, code = "", source = "Prepared · reviewed by the team";
      if (level === 0) text = opts.newResult && fail ? `The result changed. Look at the new failing case: ${fail.input} (expected ${fail.expected}, got ${fail.got}).` : h.H0;
      if (level === 1) text = (opts.newResult ? "For the new result: " : "") + h.H1;
      if (level === 2) {
        source = st.sim === "elm" ? "Template · ELM unavailable" : "Written by ELM · verified";
        if (item.id === "list-total") {
          const lines = s.answer.split("\n"); const n = lines.findIndex((l) => /^\s*if\b/.test(l));
          text = n >= 0 ? `Line ${n + 1}: \`${lines[n].trim()}\` decides which numbers get added. Should a total leave any numbers out?` : "Compare your loop body with the task: is every number added to `total`, once?";
        } else if (item.id === "up-vowels") text = "Your `if` compares one character with the whole string \"aeiou\". Can a single character ever equal a five-letter string?";
        else if (item.type === "worked_steps") text = `Your step ${s.output?.firstWrong?.step || 1}: which entries did you multiply, and is the sign between the products right?`;
        else if (item.type === "logic_proof") text = `Your line ${s.output?.firstWrong?.step || 3} uses ${s.output?.firstWrong?.rule || "a rule"}. What must already be on earlier lines for that rule to apply?`;
        else if (item.type === "formula") text = "In the rows that differ, what does your formula give when p and q are both true?";
        else if (item.type === "explanation") text = "Your answer says what happens but not why. Which part of the determinant formula touches every entry of that row?";
        else text = "Look at the line in your answer that produces the failing result. What does it do with the failing input?";
        if (st.sim === "elm") text = "Compare the failing case with your answer, line by line. Which line produces the wrong value?";
      }
      if (level === 3) { text = h.H3.text; code = h.H3.code; }
      if (level === 4) text = item.last_step ? `${item.last_step.label}. Lines are from a working answer; some aren't needed.` : "";
      return { text: chipLead && level < 4 ? chipLead + text : text, code, source };
    }

    const solutions = {
      "list-total": "def list_total(nums):\n    total = 0\n    for n in nums:\n        total += n\n    return total",
      "digit-sum": "def digit_sum(n):\n    if n < 10:\n        return n\n    return n % 10 + digit_sum(n // 10)",
      "hs-length": "myLength :: [a] -> Int\nmyLength []     = 0\nmyLength (_:xs) = 1 + myLength xs",
      "up-vowels": "def count_vowels(s):\n    count = 0\n    for ch in s:\n        if ch in \"aeiou\":\n            count += 1\n    return count",
      "la-det": "det(A) = 2·3 − 1·4\n       = 6 − 4\n       = 2",
      "logic-equiv": "¬(p ∧ q) ≡ ¬p ∨ ¬q   (De Morgan)",
      "logic-proof": "3. p      ∧E 2\n4. q      →E 1, 3",
      "la-explain": "Expand along the zero row: every term of the expansion contains one entry of that row, so every term is 0 and det = 0.",
    };
    const explain = {
      "list-total": "A sum must include every item, so the loop body adds each `n` with no condition. Starting from 0 makes the empty list correct.",
      "digit-sum": "The base case stops at one digit; each call peels off the last digit with `n % 10` and recurses on the rest.",
      "hs-length": "The empty list has length 0; a non-empty list is one element longer than its tail.",
      "up-vowels": "`in` tests whether one character appears in the string of vowels; `==` would compare it with the whole string.",
      "la-det": "For a 2×2 matrix [[a, b], [c, d]], det = ad − bc.",
      "logic-equiv": "De Morgan: not (both) is the same as (not the first) or (not the second).",
      "logic-proof": "∧E takes p out of p ∧ r; →E with p → q and p gives q.",
      "la-explain": "Cofactor expansion along the zero row makes every term zero.",
    };

    function quickCheck(id, code) {
      const f = flat(code);
      if (id === "list-product") {
        const ok = /(\w+)=1/.test(f) && /\*=|=\w+\*\w+/.test(f) && /return/.test(f) && !/if/.test(f);
        return ok ? { passed: true, rows: [{ input: "[2, 3, 4]", expected: "24", got: "24", passed: true }, { input: "[]", expected: "1", got: "1", passed: true }] }
          : { passed: false, rows: [{ input: "[2, 3, 4]", expected: "24", got: /=0/.test(f) ? "0" : "None", passed: false }, { input: "[]", expected: "1", got: /=0/.test(f) ? "0" : "None", passed: false }] };
      }
      if (id === "count-digits") {
        const ok = /count_digits\(n\/\/10\)/.test(f) && /return1/.test(f);
        return ok ? { passed: true, rows: [{ input: "0", expected: "1", got: "1", passed: true }, { input: "907", expected: "3", got: "3", passed: true }] }
          : { passed: false, rows: [{ input: "907", expected: "3", got: "None", passed: false }] };
      }
      return { passed: false, rows: [] };
    }

    function mixedCheck(p, ans) {
      if (p.kind === "code") { const f = flat(ans || ""); const ok = /power\(b,e-1\)/.test(f) && /return1/.test(f); return ok ? { passed: true, detail: "power(2, 10) → 1024 ✓" } : { passed: false, detail: `power(2, 3): expected 8, got ${/return/.test(f) ? "a different value" : "None"}` }; }
      if (p.kind === "formula") {
        const g = formula("p→q"), a = formula(ans || "");
        if (!a) return { passed: false, detail: "The formula can't be read." };
        if (/→/.test(a.text)) return { passed: false, detail: "Uses →." };
        const vars = [...new Set(["p", "q", ...a.vars])];
        const bad = rows(vars).filter((r) => g.f(r) !== a.f(r));
        return bad.length ? { passed: false, detail: `Differs when ${vars.map((v) => `${v}=${bad[0][v] ? "T" : "F"}`).join(", ")}` } : { passed: true, detail: "Equivalent on all 4 rows ✓" };
      }
      const v = arith(ans || "");
      return v === -2 ? { passed: true, detail: "= −2 ✓" } : { passed: false, detail: `Expected −2, got ${v === null ? "something unreadable" : v}` };
    }

    return { check, normalize, isRealChange, hint, solutions, explain, quickCheck, mixedCheck, formula };
  })();

  // ---------- routing helpers ----------
  function parse(parts) {
    const [a, b] = parts.path;
    if (!a) return { view: "home" };
    if (a === "challenge") return { view: "quick", id: b };
    if (a === "mixed") return { view: "mixed", id: b };
    if (a === "uploads") return { view: "upload", id: b };
    if (b === "done") return { view: "done", id: a };
    return { view: "solve", id: a };
  }

  function meta(parts) {
    const r = parse(parts);
    if (r.view === "home") return { title: "Practice" };
    if (r.view === "quick") return { title: P.quick.find((q) => q.id === r.id)?.title || "Quick challenge", parent: "Practice" };
    if (r.view === "mixed") return { title: "Mixed challenge", parent: "Practice" };
    if (r.view === "upload") return { title: "Your upload", parent: "Practice" };
    return { title: itemById(r.id)?.title || "Exercise", parent: "Practice" };
  }

  function render(parts) {
    const r = parse(parts);
    const banner = st.sim === "offline" ? `<div class="banner" role="status">${icon("wifi-off")}You're offline. Your draft is kept on this device and nothing is lost.</div>`
      : st.sim === "waking" ? `<div class="banner" role="status"><span class="spin" aria-hidden="true"></span>Waking the server. On the free plan this can take up to a minute.</div>` : "";
    let body;
    if (r.view === "home") body = home();
    else if (r.view === "quick") body = quickScreen(r.id);
    else if (r.view === "mixed") body = mixedScreen();
    else if (r.view === "upload") body = uploadScreen(r.id);
    else {
      const item = itemById(r.id);
      if (!item) body = `<section class="panel"><div class="empty">${icon("search-x")}<p>This exercise doesn't exist or isn't yours.</p><a class="btn" href="#/practice">Back to Practice</a></div></section>`;
      else body = r.view === "done" ? wrapUp(item, parts.query) : solve(item, parts.query);
    }
    return `<div class="practice" data-practice data-view="${r.view}">${banner}${body}</div>`;
  }

  // ================= Landing (/practice) =================
  function home() {
    if (!st.loaded) return skeleton();
    if (st.sim === "error") return `<section class="panel"><div class="empty">${icon("cloud-alert")}<p>Practice couldn't load. Nothing you did was lost.</p><button class="btn btn-primary" type="button" data-p="retry">${icon("rotate-ccw")}Try again</button></div></section>`;
    const cont = P.items.find((i) => i._status === "in_progress");
    const cs = cont && sess(cont);
    const head = `<div class="page-head"><div><h1>Practice</h1><p>Solve exercises yourself, with hints that point the way and never give the answer.</p></div>
      <div class="page-actions"><a class="btn" href="#/practice/uploads/new" data-p="open-upload">${icon("upload")}Upload exercise</a></div></div>`;

    if (st.firstVisit) {
      return `${head}<div class="reveal-list ${st.reveal ? "reveal" : ""}">${groups(true)}</div>${protoHome()}`;
    }
    return `${head}
    <div class="reveal-list ${st.reveal ? "reveal" : ""}">
      ${cont ? `<section class="panel continue" aria-labelledby="cont-h">
        <div class="continue-body">
          <span class="continue-ic" aria-hidden="true">${icon("play")}</span>
          <div style="flex:1;min-width:0">
            <div class="tiny faint">Continue where you left off</div>
            <h2 id="cont-h">${esc(cont.title)} <span class="faint" style="font-weight:400">· ${subj(cont.subject).name}</span></h2>
            <div class="small muted">${levelText(cs.level)} · draft saved ${cs.runs ? `after run ${cs.runs}` : "on this device"}</div>
          </div>
          <a class="btn btn-primary" href="#/practice/${cont.id}">${icon("arrow-right")}Continue</a>
        </div>
      </section>` : ""}

      <section aria-labelledby="rec-h" class="stack-sm" style="gap:14px">
        <div><h2 id="rec-h">Recommended for you</h2><p class="small muted">Picked from your plan, what's due, and what you found hard. You can always choose something else below.</p></div>
        <div class="rec-grid">
          <article class="panel suggested">
            <div class="panel-body stack-sm">
              <div class="tiny faint">Suggested next</div>
              ${(() => { const it = itemById(P.suggested.item); return `<h3 class="rec-title">${esc(it.title)}</h3>
              <div class="row">${subjTag(it)}${badge(it._status)}<span class="tiny faint">~${it.minutes} min</span></div>
              <p class="small muted">${esc(P.suggested.why)}</p>
              <div><a class="btn btn-primary btn-sm" href="#/practice/${it.id}">${icon("play")}Start</a></div>`; })()}
            </div>
          </article>
          <article class="panel picks">
            <div class="panel-body stack-sm">
              <div class="row between"><div class="tiny faint">Personal picks · worth practising</div><span class="tiny faint">from your last ${C.N_SESSIONS + 4} sessions</span></div>
              ${P.picks.map((p) => { const it = itemById(p.item); return `<a class="pick" href="#/practice/${it.id}"><div style="min-width:0"><div class="small" style="font-weight:500">${esc(it.title)}</div><div class="tiny faint">${esc(p.why)}</div></div>${icon("chevron-right")}</a>`; }).join("")}
            </div>
          </article>
        </div>
        <div class="row between" style="margin-top:6px">
          <h3>All exercises</h3>
          <div class="seg seg-sm" role="group" aria-label="Filter exercises">
            ${[["all", "All"], ["new", "Not started"], ["hints", "With hints"], ["due", "Due"]].map(([k, l]) => `<button type="button" data-p="filter" data-v="${k}" aria-pressed="${st.filter === k}">${l}</button>`).join("")}
          </div>
        </div>
        ${groups(false)}
      </section>

      ${independence()}
      ${uploadsSection()}
    </div>
    ${protoHome()}`;
  }

  function levelText(l) { return l < 0 ? "No hints used yet" : `Hint level H${l} · ${LEVEL[l]}`; }
  function subjTag(it) { return `<span class="chip">${esc(subj(it.subject).name)}</span>`; }

  function groups(first) {
    const dueConcepts = new Set(P.schedule.filter((s) => s.status === "due_now").map((s) => s.concept));
    const pass = (it) => st.filter === "all" || (st.filter === "new" && it._status === "new") || (st.filter === "hints" && it._status === "solved_with_hints") || (st.filter === "due" && dueConcepts.has(it.concept));
    const order = first ? ["logic", "haskell", "la", "python"] : ["python", "la", "logic", "haskell"];
    const html = order.map((sid) => {
      const s = subj(sid), all = P.items.filter((i) => i.subject === sid);
      const items = all.filter(pass);
      const solved = first ? 0 : all.filter((i) => i._status.startsWith("solved")).length;
      if (!items.length) return "";
      return `<article class="panel group">
        <div class="panel-head"><h3>${esc(s.name)}${s.note ? ` <span class="tiny faint" style="font-weight:400">· ${esc(s.note)}</span>` : ""}</h3><span class="sub num">${solved} of ${all.length} solved</span></div>
        <div class="progress" role="img" aria-label="${solved} of ${all.length} solved"><span style="--w:${(solved / all.length) * 100}%"></span></div>
        <div class="item-rows">
          ${items.map((it, k) => `<a class="item-row" href="#/practice/${it.id}">
            <span class="item-type" aria-hidden="true">${icon(TYPE_IC[it.type])}</span>
            <span class="item-title">${esc(it.title)}${first && k === 0 ? ` <span class="start-here">Start here</span>` : ""}<span class="tiny faint">${esc(it.concept)} · ${TYPE_NAME[it.type]} · ~${it.minutes} min</span></span>
            ${first ? badge("new") : badge(it._status)}
          </a>`).join("")}
        </div>
      </article>`;
    }).join("");
    return `<div class="groups">${html || `<div class="panel"><div class="empty"><p>No exercises match this filter.</p></div></div>`}</div>`;
  }
  const TYPE_IC = { code: "square-code", worked_steps: "list-ordered", explanation: "message-square-text", formula: "sigma", logic_proof: "git-commit-vertical", expression: "sigma" };
  const TYPE_NAME = { code: "code", worked_steps: "worked steps", explanation: "short explanation", formula: "formula", logic_proof: "proof", expression: "expression" };

  function independence() {
    const due = P.schedule.filter((s) => s.status === "due_now");
    const avail = P.quick.filter((q) => !st.quickDone.has(q.id) && !q.missed && (q.id !== "list-product" || itemById("list-total")._status.startsWith("solved")));
    const done = P.quick.filter((q) => st.quickDone.has(q.id) || q.missed);
    const SCH = (s) => ({
      not_started: ["Starts after an on-your-own solve", "sch-none"],
      due_now: ["Due now", "sch-due"],
      next_in_N_days: [`Next check in ${s.days} days`, "sch-next"],
      due_in_N_days: [`Due in ${s.days} days`, "sch-next"],
      worth_practising: ["Worth practising · back in 2 days", "sch-worth"],
    })[s.status];
    return `<section aria-labelledby="ind-h" class="stack-sm" style="gap:14px">
      <div><h2 id="ind-h">Independence checks</h2><p class="small muted">No hints here. They're optional and never marked as failed. They show what you can now do on your own.</p></div>
      <div class="ind-grid">
        <article class="panel">
          <div class="panel-head"><h3>Quick challenges</h3><span class="nohint">${icon("eye-off")}No hints</span></div>
          <div class="panel-body stack-sm">
            ${avail.length || done.length ? "" : `<div class="empty" style="padding:20px 8px"><p class="small">Solve an exercise to unlock its quick challenge.</p></div>`}
            ${avail.map((q) => `<div class="qc"><div style="min-width:0"><div class="small" style="font-weight:500">${esc(q.title)}</div><div class="tiny faint">${esc(q.note)} · ~${q.minutes} min</div></div><a class="btn btn-sm btn-primary" href="#/practice/challenge/${q.id}">Start</a></div>`).join("")}
            ${done.map((q) => `<div class="qc done"><div style="min-width:0"><div class="small" style="font-weight:500">${esc(q.title)}</div><div class="tiny faint">${esc(q.concept)}</div></div>${q.missed ? `<span class="sch sch-worth">Worth practising · back in 2 days</span>` : `<span class="sbadge s-own"><span aria-hidden="true">✓</span>On your own</span>`}</div>`).join("")}
          </div>
        </article>
        <article class="panel">
          <div class="panel-head"><h3>Mixed challenges</h3><span class="sub">spaced: 2 → 7 → 21 days</span></div>
          <div class="panel-body stack-sm">
            ${due.length >= C.MIXED_MIN_CONCEPTS && !st.mixed.done ? `<div class="mixed-ready">
              <div><div class="small" style="font-weight:500">${Math.min(due.length, C.MIXED_MAX_ITEMS)} problems · ~${P.mixed.minutes} min</div><div class="tiny faint">${due.map((d) => esc(d.concept)).join(" · ")}</div></div>
              <a class="btn btn-sm btn-primary" href="#/practice/mixed/${P.mixed.id}">Start</a></div>`
            : `<p class="tiny faint">A mixed challenge appears when at least ${C.MIXED_MIN_CONCEPTS} topics are due.</p>`}
            <ul class="sched">${P.schedule.map((s) => { const [w, c] = SCH(s); return `<li><span class="small">${esc(s.concept)} <span class="faint">· ${esc(s.subject)}</span></span><span class="sch ${c}">${w}</span></li>`; }).join("")}</ul>
          </div>
        </article>
      </div>
    </section>`;
  }

  function uploadsSection() {
    const left = C.UPLOADS_PER_DAY - st.uploadsToday;
    const U = st.upload;
    const canPrep = U.confirmed && left > 0 && (U.source === "pdf" ? !!U.file : U.text.trim().length > 10);
    const why = left <= 0 ? "Daily limit reached. You can upload again tomorrow." : !U.confirmed ? "Tick the confirmation to continue." : U.source === "pdf" && !U.file ? "Choose a PDF first." : U.source === "text" && U.text.trim().length <= 10 ? "Paste the question text first." : "";
    return `<section aria-labelledby="up-h" class="panel" id="uploads">
      <div class="panel-head"><div><h2 id="up-h">Your own exercises</h2><p class="tiny faint" style="margin-top:2px">Turn a question from a tutorial sheet into a private exercise with checks and hints.</p></div><span class="sub num">${left} of ${C.UPLOADS_PER_DAY} uploads left today</span></div>
      <div class="panel-body stack-sm" style="gap:14px">
        <div><button class="btn ${st.uploadsOpen ? "" : "btn-primary"}" type="button" data-p="toggle-upload" aria-expanded="${st.uploadsOpen}" aria-controls="upform">${icon(st.uploadsOpen ? "x" : "upload")}${st.uploadsOpen ? "Close" : "Upload exercise"}</button></div>
        <div class="collapse ${st.uploadsOpen ? "open" : ""}" id="upform"><div class="collapse-in">
          <form class="upform" data-p-form="upload">
            <div class="field"><span class="label" id="src-l">Source</span>
              <div class="seg" role="group" aria-labelledby="src-l">${[["pdf", "Upload PDF"], ["text", "Paste text"]].map(([k, l]) => `<button type="button" data-p="upsrc" data-v="${k}" aria-pressed="${U.source === k}">${l}</button>`).join("")}</div></div>
            ${U.source === "pdf" ? `<div class="field"><label for="up-file">PDF file <span class="faint" style="font-weight:400">· max 25 MB</span></label><input class="input" id="up-file" type="file" accept="application/pdf" data-p-in="file">${U.file ? `<span class="hint-text">${esc(U.file)}</span>` : ""}</div>`
              : `<div class="field"><label for="up-text">Question text</label><textarea class="textarea" id="up-text" rows="4" data-p-in="text" placeholder="Paste one question, including any examples.">${esc(U.text)}</textarea></div>`}
            <div class="field"><label for="up-subj">Subject</label><select class="select" id="up-subj" data-p-in="subject">${[["auto", "Detect automatically"], ["python", "Python"], ["haskell", "Haskell"], ["la", "Linear Algebra"], ["logic", "Propositional logic"]].map(([k, l]) => `<option value="${k}" ${U.subject === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <label class="check confirm"><input type="checkbox" data-p-in="confirmed" ${U.confirmed ? "checked" : ""}><span>This is for practice, not assessed coursework. I understand hints never give full solutions, and the upload stays private to me.</span></label>
            <div class="row"><button class="btn btn-primary" type="submit" ${canPrep ? "" : "disabled"} aria-describedby="up-why">${icon("wand-sparkles")}Prepare exercise</button><span class="tiny faint" id="up-why">${why}</span></div>
          </form>
        </div></div>
        ${st.uploads.length ? `<div class="item-rows">${st.uploads.map((u) => `<div class="item-row up-row">
            <span class="item-type" aria-hidden="true">${icon(u.source === "PDF" ? "file-text" : "clipboard-type")}</span>
            <span class="item-title">${esc(u.title)}<span class="tiny faint">${esc(u.subject)} · ${u.source} · ${esc(u.when)}${u.status === "unverified" ? " · text hints only, not counted in your progress" : ""}</span></span>
            <span class="badge ${UPLOAD[u.status][1]}">${UPLOAD[u.status][0]}</span>
            <a class="btn btn-sm" href="#/practice/uploads/${u.id}">Open</a></div>`).join("")}</div>`
          : `<div class="empty" style="padding:20px"><p class="small">No uploads yet. They appear here, visible only to you.</p></div>`}
      </div>
    </section>`;
  }

  function protoHome() {
    return `<details class="panel proto"><summary class="small muted">Prototype only: preview other states</summary>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-sm" type="button" data-p="first-visit" aria-pressed="${st.firstVisit}">${st.firstVisit ? "Show returning student" : "Show first visit"}</button>
        <button class="btn btn-sm" type="button" data-p="reload">Loading skeleton</button>
        ${simButtons(["waking", "offline", "error"])}
        <label class="tiny faint row">Next upload result <select class="select" style="height:28px;width:auto" data-p-in="outcome">${["verified", "unverified", "failed"].map((k) => `<option ${st.upload.outcome === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
      </div></details>`;
  }
  function simButtons(keys) {
    const L = { normal: "Normal", runner: "Runner unavailable", elm: "ELM unavailable", rate: "Hidden-check limit", offline: "Offline", waking: "Server waking", error: "Load error" };
    return ["normal", ...keys].map((k) => `<button class="btn btn-sm" type="button" data-p="sim" data-v="${k}" aria-pressed="${st.sim === k}">${L[k]}</button>`).join("");
  }

  function skeleton() {
    const bar = (w, h = 12) => `<span class="sk" style="width:${w};height:${h}px"></span>`;
    return `<div class="page-head"><div><h1>Practice</h1><p>Solve exercises yourself, with hints that point the way and never give the answer.</p></div></div>
    <div class="stack" aria-busy="true" aria-label="Loading practice">
      <div class="panel"><div class="panel-body stack-sm">${bar("30%")}${bar("55%", 18)}${bar("40%")}</div></div>
      <div class="rec-grid">${[1, 2].map(() => `<div class="panel"><div class="panel-body stack-sm">${bar("25%")}${bar("70%", 18)}${bar("90%")}${bar("60%")}</div></div>`).join("")}</div>
      <div class="groups">${[1, 2].map(() => `<div class="panel"><div class="panel-body stack-sm">${bar("35%", 16)}${bar("100%", 6)}${bar("80%")}${bar("75%")}${bar("82%")}</div></div>`).join("")}</div>
    </div>`;
  }

  // ================= Solve screen (/practice/:itemId) =================
  function solve(item, q) {
    const s = sess(item);
    if (st.paneItem !== item.id) { st.paneItem = item.id; st.pane = "work"; }
    return `
    <div class="solve-head" data-region="head">${solveHead(item, s)}</div>
    ${q.task ? `<div class="tiny faint task-link">${icon("calendar-check")}Opened from your plan: “${esc((SX.planTask && SX.planTask(q.task) || {}).title || "plan task")}”. Finishing ticks it.</div>` : ""}
    <section class="panel task-panel" aria-labelledby="task-h">
      <div class="panel-head"><h2 id="task-h">Task</h2>
        <button class="btn btn-ghost btn-sm" type="button" data-p="task-toggle" aria-expanded="${s.taskOpen}" aria-controls="task-body">${icon(s.taskOpen ? "chevron-up" : "chevron-down")}${s.taskOpen ? "Hide task" : "Show task"}</button></div>
      <div class="collapse ${s.taskOpen ? "open" : ""}" id="task-body"><div class="collapse-in"><div class="panel-body task-body">
        <div class="stack-sm">
          <p>${md(item.statement)}</p>
          ${item.signature ? `<div class="sig">${item.language === "python" ? hlPy(item.signature) : esc(item.signature)}</div>` : ""}
          ${item.premises ? `<div class="kv"><dt>Premises</dt><dd class="mono">(1) ${esc(item.premises[0])} &nbsp; (2) ${esc(item.premises[1])}</dd><dt>Goal</dt><dd class="mono">q</dd></div>` : ""}
          ${item.source === "upload" ? `<div class="note">${icon("lock")}<div>Your upload · private to you · verified by running the checks.</div></div>` : ""}
        </div>
        ${item.visible_checks?.length ? `<div><h3 style="margin-bottom:6px">Examples</h3><div data-region="examples">${examples(item, s)}</div></div>` : ""}
      </div></div></div>
    </section>

    <div class="pane-tabs" role="tablist" aria-label="Work and help" data-region="tabs">
${paneTabs(s)}</div>
    <p class="phone-note note">${icon("laptop")}<span>Reading mode. Continue on a laptop to write and run your answer (University library and DICE PCs work).</span></p>

    <div class="solve-grid" data-pane="${st.pane}">
      <section class="panel work" aria-labelledby="work-h">
        <h2 id="work-h" class="sr-only">Your answer</h2>
        <div data-region="input">${answerInput(item, s)}</div>
        <div class="actionbar" data-region="actions">${actions(item, s)}</div>
        <div class="statusline" data-region="status" id="status-${item.id}" aria-live="polite">${statusLine(item, s)}</div>
        <div data-region="output">${output(item, s)}</div>
      </section>
      <aside class="panel help" aria-labelledby="help-h" data-region="help">${help(item, s)}</aside>
    </div>

    <details class="panel proto"><summary class="small muted">Prototype only: preview states and server timers</summary>
      <div class="row" style="margin-top:10px">${simButtons(["runner", "elm", "rate", "offline", "waking"])}
        <button class="btn btn-sm" type="button" data-p="five-min">Simulate 5 min without a change</button>
        <button class="btn btn-sm" type="button" data-p="glow">Simulate ${C.GLOW_MIN} min stuck (glow)</button>
        <button class="btn btn-sm" type="button" data-p="reset-item">Reset this exercise</button>
      </div>
      <p class="tiny faint" style="margin-top:8px">Scripted path: Run → hidden check fails → Hint (H0) → change line 4 and Run → Next hint (H1) → change again → H2 → fix → solved → wrap-up → quick challenge.</p>
    </details>`;
  }

  function paneTabs(s) {
    return `<button role="tab" type="button" data-p="pane" data-v="work" aria-selected="${st.pane === "work"}">${icon("pencil-line")}Work</button>
      <button role="tab" type="button" data-p="pane" data-v="help" aria-selected="${st.pane === "help"}">${icon("lightbulb")}Help${s.hints.length ? ` <span class="count">${s.hints.length}</span>` : ""}</button>`;
  }
  function solveHead(item, s) {
    return `<a class="btn btn-ghost btn-sm back" href="#/practice">${icon("arrow-left")}Practice</a>
      <div class="solve-title"><h1>${esc(item.title)}</h1><div class="row">${subjTag(item)}<span class="chip dashed">${esc(item.concept)}</span>${s.solved ? badge(s.maxLevel <= 1 ? "solved_on_own" : "solved_with_hints") : ""}</div></div>
      <div class="lvl" role="img" aria-label="${levelText(s.level)}">
        <span class="tiny faint">Hint level</span>
        <span class="lvl-dots">${[0, 1, 2, 3, 4].map((l) => `<span class="${l <= s.level ? "on" : ""} ${l === s.level && s.fresh ? "pop" : ""}" title="H${l} · ${LEVEL[l]}">H${l}</span>`).join("")}</span>
      </div>`;
  }

  function examples(item, s) {
    const last = s.output && s.output.visible;
    return `<table class="data ex"><thead><tr><th>Call</th><th>Expected</th><th>Latest</th></tr></thead><tbody>
      ${item.visible_checks.map((c, k) => { const r = last && last[k]; return `<tr><td class="mono">${esc(item.language === "haskell" ? c.input : `${(item.signature || "").match(/def (\w+)/)?.[1] || "f"}(${c.input})`)}</td><td class="mono">${esc(c.expected)}</td><td>${r ? (r.passed ? `<span class="ok-t">${icon("check")}pass</span>` : `<span class="bad-t">${icon("x")}got ${esc(r.got)}</span>`) : `<span class="faint tiny">not run</span>`}</td></tr>`; }).join("")}
    </tbody></table>`;
  }

  // ----- answer inputs by item type -----
  function answerInput(item, s) {
    if (item.type === "code") return codeEditor(item, s);
    if (item.type === "worked_steps") return stepList(item, s);
    if (item.type === "logic_proof") return proofSteps(item, s);
    if (item.type === "formula") return `<div class="field pad"><label for="ans-${item.id}">Your formula</label>
      <div class="sym-row" role="group" aria-label="Insert symbol">${["¬", "∧", "∨", "→", "↔", "(", ")"].map((c) => `<button type="button" class="btn btn-sm sym" data-p="sym" data-v="${c}">${c}</button>`).join("")}</div>
      <input class="input mono big-in" id="ans-${item.id}" data-p-in="answer" value="${esc(s.answer)}" autocomplete="off" spellcheck="false">
      <span class="hint-text" data-region="preview">${formulaPreview(s.answer)}</span></div>`;
    if (item.type === "explanation") return `<div class="field pad"><label for="ans-${item.id}">Your explanation</label>
      <textarea class="textarea" id="ans-${item.id}" rows="5" data-p-in="answer" placeholder="One or two sentences. Bullet points are fine.">${esc(s.answer)}</textarea>
      <span class="hint-text">Feedback here is AI judgement, always labelled. It never counts as verified.</span></div>`;
    return "";
  }
  function formulaPreview(v) { const f = SERVER.formula(v); return v.trim() ? (f ? `Reads as: <span class="mono">${esc(f.text)}</span>` : `<span style="color:var(--warn)">Can't read this yet.</span>`) : "Type with the buttons or: ~ & | -> <->"; }

  function codeEditor(item, s) {
    const lines = s.answer.split("\n");
    const errLine = s.compileErr && s.compileErr.line;
    let hl = item.language === "python" ? hlPy(s.answer) : esc(s.answer);
    if (errLine) hl = hl.split("\n").map((l, k) => (k + 1 === errLine ? `<span class="line-err squiggle">${l || " "}</span>` : l)).join("\n");
    return `<div class="editor-bar">${icon("file-code")}<span class="file">${item.language === "haskell" ? "Solution.hs" : `${(item.signature.match(/def (\w+)/) || [])[1] || "solution"}.py`}</span><span style="flex:1"></span><span class="tiny faint">${item.language === "haskell" ? "Haskell" : "Python 3"} · draft saved on this device</span></div>
      <div class="code-area">
        <div class="gutter" aria-hidden="true">${lines.map((_, k) => `<span class="${k + 1 === errLine ? "err" : ""}">${k + 1}</span>`).join("")}</div>
        <div class="code-stack">
          <pre aria-hidden="true"><code data-phl>${hl}\n</code></pre>
          <textarea data-pcode data-lang="${item.language}" spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off" aria-label="Code editor" aria-describedby="status-${item.id}">${esc(s.answer)}</textarea>
        </div>
      </div>`;
  }

  function stepList(item, s) {
    const fw = s.output && s.output.firstWrong;
    return `<div class="steps pad"><div class="tiny faint" style="margin-bottom:8px">One step per line. Each line must equal the line before it.</div>
      <div class="step start"><span class="step-no mono">${esc(item.start_label)}</span><span class="faint small">[[2, 1], [4, 3]]</span></div>
      ${s.answer.map((v, k) => `<div class="step ${fw && fw.step === k + 1 ? "is-wrong" : ""}" data-step="${k}">
        <span class="step-no mono">${k ? "=" : "="}</span>
        <input class="input mono" aria-label="Step ${k + 1}" data-p-step="${k}" value="${esc(v)}" autocomplete="off" spellcheck="false">
        <span class="step-tools">
          <button class="icon-btn" type="button" data-p="step-up" data-v="${k}" aria-label="Move step ${k + 1} up" ${k ? "" : "disabled"}>${icon("arrow-up")}</button>
          <button class="icon-btn" type="button" data-p="step-down" data-v="${k}" aria-label="Move step ${k + 1} down" ${k < s.answer.length - 1 ? "" : "disabled"}>${icon("arrow-down")}</button>
          <button class="icon-btn" type="button" data-p="step-del" data-v="${k}" aria-label="Remove step ${k + 1}">${icon("trash-2")}</button>
        </span></div>`).join("")}
      <button class="btn btn-sm btn-ghost" type="button" data-p="step-add">${icon("plus")}Add step</button></div>`;
  }

  function proofSteps(item, s) {
    const fw = s.output && s.output.firstWrong;
    const RULES = ["premise", "∧I", "∧E", "∨I", "∨E", "→I", "→E", "¬I", "¬E"];
    return `<div class="steps pad"><div class="proof-head tiny faint"><span>#</span><span>Formula</span><span>Rule</span><span>Uses lines</span><span></span></div>
      ${item.premises.map((p, k) => `<div class="proof-row given"><span class="mono">${k + 1}</span><span class="mono">${esc(p)}</span><span class="small faint">premise</span><span></span><span></span></div>`).join("")}
      ${s.answer.map((r, k) => `<div class="proof-row ${fw && fw.step === k + 3 ? "is-wrong" : ""}">
        <span class="mono">${k + 3}</span>
        <input class="input mono" aria-label="Line ${k + 3} formula" data-p-proof="${k}" data-f="f" value="${esc(r.f)}" placeholder="formula" spellcheck="false">
        <select class="select" aria-label="Line ${k + 3} rule" data-p-proof="${k}" data-f="rule">${RULES.map((x) => `<option ${x === r.rule ? "selected" : ""}>${x}</option>`).join("")}</select>
        <input class="input mono" aria-label="Line ${k + 3} uses lines" data-p-proof="${k}" data-f="refs" value="${esc(r.refs)}" placeholder="e.g. 1, 3">
        <button class="icon-btn" type="button" data-p="proof-del" data-v="${k}" aria-label="Remove line ${k + 3}">${icon("trash-2")}</button></div>`).join("")}
      <div class="row"><button class="btn btn-sm btn-ghost" type="button" data-p="proof-add">${icon("plus")}Add line</button>
      <span class="sym-row" role="group" aria-label="Insert symbol">${["¬", "∧", "∨", "→"].map((c) => `<button type="button" class="btn btn-sm sym" data-p="sym" data-v="${c}">${c}</button>`).join("")}</span></div></div>`;
  }

  // ----- action bar, status line, output -----
  function hintState(s) {
    if (s.solved) return { enabled: false };
    if (s.level >= 4) return { enabled: true, label: "H4 open" };
    const enabled = s.runs > 0 && !s.running && !s.dirty && (s.level < 0 || !!s.pending || s.escape);
    return { enabled, label: s.level < 0 ? "Hint" : "Next hint" };
  }
  function actions(item, s) {
    const h = hintState(s);
    const glow = h.enabled && s.level < 4 && (s.sameFail >= C.GLOW_SAME_FAILURE || s.glow);
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    return `<button class="btn btn-primary ${s.running ? "is-loading" : ""}" type="button" data-p="run" ${s.running || s.solved ? "disabled" : ""} aria-keyshortcuts="${mac ? "Meta+Enter" : "Control+Enter"}">${s.running ? "Running" : `${icon("play")}Run`}</button>
      <span class="kbd tiny faint" aria-hidden="true">${mac ? "⌘" : "Ctrl"} + Enter</span>
      <span style="flex:1"></span>
      ${s.solved ? `<a class="btn" href="#/practice/${item.id}/done">${icon("flag")}See wrap-up</a>` :
      `<button class="btn hint-btn ${glow ? "glow" : ""}" type="button" data-p="hint" ${h.enabled ? "" : "disabled"} aria-describedby="status-${item.id}">${icon(s.level >= 4 ? "puzzle" : "lightbulb")}${h.label}</button>`}`;
  }

  function statusLine(item, s) {
    const msg = (ic, t, extra = "", cls = "") => `<div class="sl ${cls}">${icon(ic)}<span>${t}</span>${extra}</div>`;
    const esc5 = `<button class="btn btn-sm" type="button" data-p="escape">${icon("circle-help")}I don't know what to change</button>`;
    if (st.sim === "offline") return msg("wifi-off", "You're offline. Run needs a connection; your draft is kept on this device.", "", "warn");
    if (s.running) return msg("loader", s.phase === "hidden" ? "All examples pass. Checking your solution properly…" : "Running the checks…", "", "busy");
    if (s.solved) return msg("circle-check", "Solved. See the wrap-up for what made it work.", "", "pass");
    if (s.runs === 0) return msg("info", "Run first. Hints start from what the checks show.");
    if (s.dirty) return msg("pencil", "Run to check it; then the next hint can unlock.");
    if (s.notReal && s.level >= 0 && !s.escape) return msg("lock", "That wasn't a real change: only spaces or comments changed. The next hint stays locked.", esc5, "lock");
    if (s.escape) return msg("unlock", "Next hint unlocked.");
    if (s.level >= 4) return msg("puzzle", "The last step is open in the help panel. Put the lines in order and check.");
    if (s.pending) return msg("sparkles", `You made a real change. ${s.pending === "same" ? "The result changed, so the next hint stays at this level and looks at the new result." : "Next hint for help with the new result."}`);
    if (s.level >= 0) return msg("lock", `Next hint unlocks after you change your answer and run it, or after ${C.STUCK_UNLOCK_MIN} min.`, esc5, "lock");
    const n = s.output ? failCount(s.output) : 0;
    return msg("circle-dot", `${n ? `${n} check${n === 1 ? "" : "s"} not passing yet. ` : ""}Change your answer and run again, or ask for a hint. Hints are normal.`);
  }
  const failCount = (o) => (o.visible || []).filter((v) => !v.passed).length + (o.hidden && !o.hidden.passed ? 1 : 0) + (o.firstWrong ? 1 : 0) + (o.rowsBad ? 1 : 0) + (o.compile ? 1 : 0);

  function output(item, s) {
    const o = s.output;
    if (st.sim === "runner" && s.runs) return `<div class="out"><div class="note warn" role="status">${icon("server-crash")}<div><b>Checking is unavailable right now.</b> Your answer is saved and nothing is marked as failed. Hints still work from your last result.</div></div></div>`;
    if (!o) return `<div class="out out-empty"><span class="tiny faint">Results appear here after you run.</span></div>`;
    const anim = s.fresh === "out" ? "stagger" : "";
    if (o.unknown) return `<div class="out"><div class="note">${icon("flask-conical")}<div>The prototype can only simulate a few answers. In the real app the runner executes your code in an isolated sandbox.</div></div></div>`;
    if (o.compile) return `<div class="out ${anim}"><div class="out-sum fail">${icon("circle-x")}${esc(o.compile.message)} · line ${o.compile.line}</div><p class="small">${esc(o.compile.note)}</p></div>`;
    if (o.explanation) {
      const m = { complete: ["pass", "circle-check", "Looks complete", "Both independent judgements agree your explanation covers the idea."], unsure: ["warn", "circle-help", "Unsure, check with your tutor", "The two judgements disagreed, so we won't call it complete."], incomplete: ["warn", "circle-dashed", "Not complete yet", "It doesn't yet say why the zero row matters."] }[o.explanation];
      return `<div class="out ${anim}"><div class="out-sum ${m[0]}">${icon(m[1])}${m[2]} <span class="ai-tag">AI feedback · not verified</span></div><p class="small muted">${m[3]}</p></div>`;
    }
    const vis = o.visible || [];
    const passed = vis.filter((v) => v.passed).length;
    let sum = "";
    if (o.firstWrong) sum = `<div class="out-sum fail">${icon("circle-x")}First wrong ${item.type === "logic_proof" ? "line" : "step"}: ${item.type === "logic_proof" ? "" : "step "}${o.firstWrong.step}</div><p class="small">${o.firstWrong.reason}</p>`;
    else if (o.rowsBad) sum = `<div class="out-sum fail">${icon("circle-x")}Not equivalent to ¬(p ∧ q) on ${o.rowsBad.length} row${o.rowsBad.length === 1 ? "" : "s"}</div>
      <table class="data mono small"><thead><tr><th>Row</th><th>¬(p ∧ q)</th><th>Yours</th></tr></thead><tbody>${o.rowsBad.map((r) => `<tr><td>${r.row}</td><td>${r.expected}</td><td class="bad-t">${r.got}</td></tr>`).join("")}</tbody></table>`;
    else if (vis.length) sum = `<div class="out-sum ${passed === vis.length ? "pass" : "fail"}">${icon(passed === vis.length ? "circle-check" : "circle-x")}${passed} of ${vis.length} examples pass</div>`;
    const rows = vis.map((v, k) => `<div class="chk ${v.passed ? "ok" : "bad"}" style="--i:${k}">${icon(v.passed ? "check" : "x")}<span class="mono">${esc(v.input)}</span><span class="mono faint">expected ${esc(v.expected)}</span><span class="mono">${v.passed ? "" : `got ${esc(v.got)}`}</span></div>`).join("");
    let hidden = "";
    if (o.rate) hidden = `<div class="note" style="--i:${vis.length}">${icon("timer")}<div>You've used ${C.HIDDEN_CHECKS_PER_HOUR} hidden checks for this exercise this hour. Try again in 18 min. The examples still run.</div></div>`;
    else if (o.hidden) hidden = o.hidden.passed
      ? `<div class="hidden-res pass" style="--i:${vis.length}">${icon("shield-check")}<span>Hidden checks pass${o.allStepsOk ? ` · all ${o.allStepsOk} steps valid` : o.allRows ? ` · all ${o.allRows} truth-table rows match` : ""}</span></div>`
      : `<div class="hidden-res fail" style="--i:${vis.length}">${icon("shield-alert")}<div><b>Hidden check · ${esc(o.hidden.category)}:</b> input <code>${esc(o.hidden.input)}</code>, expected <code>${esc(o.hidden.expected)}</code>, got <code>${esc(o.hidden.got)}</code>.<div class="tiny faint">Hidden values are new on every check, so seeing them is safe.</div></div></div>`;
    return `<div class="out ${anim}">${sum}${rows ? `<div class="chks">${rows}</div>` : ""}${hidden}</div>`;
  }

  // ----- help panel -----
  function help(item, s) {
    const chips = [["error", "I don't understand the error"], ["start", "I don't know where to start"], ["wrong", "The output or answer is wrong"], ["change", "I don't know what to change"], ["other", "Something else"]];
    return `<div class="panel-head"><h2 id="help-h">Help</h2><span class="sub">${s.hints.length ? `${s.hints.length} hint${s.hints.length === 1 ? "" : "s"} · max H${s.maxLevel}` : "No hints yet"}</span></div>
      <div class="panel-body help-body">
        ${s.level >= 4 && item.last_step ? h4Panel(item, s) : ""}
        <div class="hint-list">
          ${s.hints.length ? s.hints.map((h, k) => hintCard(h, k === 0 && s.fresh === "hint")).join("") : `<div class="help-empty">${icon("lightbulb")}<p class="small">${s.runs ? "Ask for a hint when you're ready. Each one says a little more than the last." : "Hints unlock after your first Run, so they can start from what the checks show."}</p>
            <ol class="ladder-mini">${LEVEL.map((l, k) => `<li><span class="mono">H${k}</span>${l}</li>`).join("")}</ol></div>`}
        </div>
        ${!s.solved ? `<div class="stuck">
          <div class="small" style="font-weight:500">Not what you're stuck on?</div>
          <div class="chips" role="group" aria-label="What are you stuck on?">${chips.map(([k, l]) => `<button type="button" class="qchip" data-p="chip" data-v="${k}" aria-pressed="${s.chip === k}">${l}</button>`).join("")}</div>
          ${s.chip === "other" ? `<div class="field"><label class="sr-only" for="other-${item.id}">Describe what you're stuck on</label><textarea class="textarea" rows="2" id="other-${item.id}" data-p-in="other" placeholder="What are you stuck on?">${esc(s.otherText)}</textarea></div>` : ""}
          ${s.chip ? `<div class="tiny faint">Your next hint will be worded around this. It doesn't change the hint level.</div>` : ""}
        </div>` : ""}
        <p class="tiny faint reassure">${icon("heart-handshake")}Hints help you learn. Using them is normal.</p>
      </div>`;
  }
  function hintCard(h, fresh) {
    return `<article class="hint-card ${fresh ? "enter" : ""}" aria-label="Hint H${h.level}">
      <div class="hc-head"><span class="hc-lvl">H${h.level}</span><span class="small" style="font-weight:500">${LEVEL[h.level]}</span><span class="hc-src tiny">${esc(h.source)}</span></div>
      <p class="small">${md(h.text)}</p>
      ${h.code ? `<pre class="hc-code">${h.lang === "python" ? hlPy(h.code) : esc(h.code)}</pre>` : ""}
      <div class="hc-rate"><span class="tiny faint">Helpful?</span>
        <button class="icon-btn" type="button" data-p="rate" data-v="${h.id}:up" aria-pressed="${h.rating === "up"}" aria-label="Helpful">${icon("thumbs-up")}</button>
        <button class="icon-btn" type="button" data-p="rate" data-v="${h.id}:down" aria-pressed="${h.rating === "down"}" aria-label="Not helpful">${icon("thumbs-down")}</button></div>
    </article>`;
  }

  // ----- H4: Parsons / proof Parsons / step ordering / faded example -----
  function h4Init(item) {
    const L = item.last_step;
    if (L.kind === "faded") return { kind: "faded", values: L.steps.map(() => ""), wrong: 0, msg: null };
    const rows = L.start.map((x) => (typeof x === "string" ? { key: x, text: L.decoys[+x.slice(1)], decoy: true } : { key: "l" + x, text: L.lines[x], pos: x }));
    return { kind: L.kind, rows, excluded: new Set(), removed: new Set(), wrong: 0, highlight: null, msg: null, moved: null };
  }
  function h4Progress(H, item) {
    const live = H.rows.filter((r) => !H.excluded.has(r.key) && !H.removed.has(r.key));
    let n = 0; while (n < live.length && !live[n].decoy && live[n].pos === n) n++;
    return { n, m: item.last_step.lines.length, live };
  }
  function h4Panel(item, s) {
    const H = s.h4, L = item.last_step;
    if (H.kind === "faded") {
      return `<section class="h4" aria-labelledby="h4-h"><div class="h4-head"><span class="hc-lvl">H4</span><h3 id="h4-h">${esc(L.label)}</h3></div>
        <div class="faded mono">${L.steps.map((x, k) => `<div>${esc(x.pre)}<input class="input mono blank ${H.bad && H.bad.includes(k) ? "is-wrong" : ""}" data-p-blank="${k}" value="${esc(H.values[k])}" aria-label="Blank ${k + 1}" size="3">${esc(x.post)}</div>`).join("")}</div>
        ${H.msg ? `<p class="small h4-msg">${H.msg}</p>` : ""}
        <button class="btn btn-sm btn-primary" type="button" data-p="h4-check">${icon("check")}Check</button></section>`;
    }
    const { n, m } = h4Progress(H, item);
    return `<section class="h4" aria-labelledby="h4-h">
      <div class="h4-head"><span class="hc-lvl">H4</span><h3 id="h4-h">${esc(L.label)}</h3></div>
      <p class="tiny faint">Focus a line, then <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd> to move it, <kbd>N</kbd> to mark it not needed.</p>
      <div class="h4-prog" aria-live="polite"><span class="num">${n} of ${m}</span> lines in place from the top<span class="bar"><span style="width:${(n / m) * 100}%"></span></span></div>
      <ol class="parsons" data-flip>
        ${H.rows.filter((r) => !H.removed.has(r.key)).map((r, k, arr) => `<li class="prow ${H.excluded.has(r.key) ? "excluded" : ""} ${H.highlight === r.key ? "misplaced" : ""}" data-key="${r.key}" tabindex="0" aria-label="Line: ${esc(r.text.trim())}${H.excluded.has(r.key) ? " (marked not needed)" : ""}">
          <span class="grip" aria-hidden="true">${icon("grip-vertical")}</span>
          <code>${esc(r.text)}</code>
          <span class="prow-tools">
            <button class="icon-btn" type="button" data-p="p-up" data-v="${r.key}" aria-label="Move up" ${k ? "" : "disabled"}>${icon("arrow-up")}</button>
            <button class="icon-btn" type="button" data-p="p-down" data-v="${r.key}" aria-label="Move down" ${k < arr.length - 1 ? "" : "disabled"}>${icon("arrow-down")}</button>
            <label class="nn"><input type="checkbox" data-p="p-nn" data-v="${r.key}" ${H.excluded.has(r.key) ? "checked" : ""}>Not needed</label>
          </span></li>`).join("")}
      </ol>
      ${H.msg ? `<p class="small h4-msg" role="status">${H.msg}</p>` : ""}
      <button class="btn btn-sm btn-primary" type="button" data-p="h4-check">${icon("check")}Check order</button>
    </section>`;
  }

  // ================= Wrap-up (/practice/:itemId/done) =================
  function wrapUp(item, q) {
    const s = sess(item);
    if (!s.solved) return `<section class="panel"><div class="empty">${icon("circle-dashed")}<p>This exercise isn't solved yet, so there's no wrap-up.</p><a class="btn" href="#/practice/${item.id}">Back to the exercise</a></div></section>`;
    const own = s.maxLevel <= 1, expl = item.type === "explanation";
    const W = s.wrap, qc = item.quick && P.quick.find((x) => x.id === item.quick);
    const elmDown = st.sim === "elm";
    return `<div class="wrap">
      <section class="panel wrap-hero">
        <div class="wrap-badge ${expl ? "ai" : own ? "own" : "hints"}" aria-hidden="true">${expl ? icon("message-square-text") : `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`}</div>
        <div><div class="tiny faint">${esc(item.title)} · ${esc(subj(item.subject).name)}</div>
          <h1>${expl ? "Looks complete (AI feedback)" : own ? "Solved on your own" : "Solved with hints"}</h1>
          <p class="small muted">${expl ? "Labelled AI feedback. It doesn't count as verified or on your own." : own ? (s.maxLevel === 1 ? "You used up to H1. Pointers to where to look still count as on your own." : "No hints needed.") : `Highest hint level used: H${s.maxLevel} (${LEVEL[s.maxLevel]}). Hints are part of learning. The quick challenge below shows it stuck.`}</p>
          ${q.task ? `<p class="small task-ticked">${icon("calendar-check")}Plan task “${esc((SX.planTask && SX.planTask(q.task) || {}).title || "plan task")}” ticked.</p>` : ""}
        </div>
      </section>

      <section class="panel"><div class="panel-body stack-sm">
        <h2 class="wrap-step"><span>1</span>Why did it work?</h2>
        ${W.skipped ? `<p class="small faint">Skipped.</p>` : W.feedback ? `<div class="note pass">${icon("sparkles")}<div>${esc(W.feedback)} <span class="ai-tag">AI feedback</span></div></div>` : `
        <div class="field"><label class="sr-only" for="why">Why did it work?</label><input class="input" id="why" data-p-in="why" value="${esc(W.why)}" placeholder="One line. Bullet points or a code comment are fine."></div>
        <div class="row"><button class="btn btn-sm btn-primary" type="button" data-p="why-fb" ${elmDown ? "disabled" : ""}>${icon("send")}Get feedback</button><button class="btn btn-sm btn-ghost" type="button" data-p="why-skip">Skip</button>${elmDown ? `<span class="tiny faint">Feedback is unavailable right now.</span>` : `<span class="tiny faint">One sentence, judging your idea, not your English.</span>`}</div>`}
      </div></section>

      ${st.predict && item.type === "code" ? `<section class="panel"><div class="panel-body stack-sm">
        <h2 class="wrap-step"><span>2</span>Predict the output</h2>
        <p class="small">Your answer differs from ours on a random input. Before you see it: what does your function return for <code>[-3, 0, 4]</code>?</p>
        ${W.predicted === null ? `<div class="row"><input class="input mono" style="max-width:140px" data-p-in="predict" aria-label="Your prediction"><button class="btn btn-sm" type="button" data-p="predict">Check prediction</button></div>` : `<div class="note">${icon("eye")}<div>You predicted <code>${esc(W.predicted)}</code>. Your function returns <code>1</code>.</div></div>`}
      </div></section>` : ""}

      <section class="panel"><div class="panel-body stack-sm">
        <h2 class="wrap-step"><span>${st.predict && item.type === "code" ? 3 : 2}</span>Tip for next time</h2>
        <p class="small">${esc(item.tip)}</p>
        <details class="model" ${W.showModel ? "open" : ""}><summary class="small">${icon("chevron-right")}See model answer</summary>
          <pre class="hc-code">${item.language === "python" ? hlPy(SERVER.solutions[item.id]) : esc(SERVER.solutions[item.id])}</pre>
          <p class="small muted">${md(SERVER.explain[item.id])}</p></details>
      </div></section>

      ${qc ? `<section class="panel qc-offer"><div class="panel-body row between">
        <div><div class="tiny faint">Quick challenge · no hints · ~${qc.minutes} min</div><div style="font-weight:500">${esc(qc.title)}</div><div class="tiny faint">${esc(qc.note)}</div></div>
        <div class="row"><a class="btn btn-primary" href="#/practice/challenge/${qc.id}">${icon("zap")}Try it</a><a class="btn btn-ghost" href="#/practice">Later</a></div>
      </div></section>` : `<div class="row"><a class="btn btn-primary" href="#/practice">${icon("arrow-left")}Back to Practice</a></div>`}

      <p class="tiny faint">Want to talk it through? <a href="#/practice" data-toast="Opens InfBase in the real app.">InfBase</a> · <a href="#/practice" data-toast="Opens InfPALS in the real app.">InfPALS</a> · <a href="#/practice" data-toast="Opens the course forum in the real app.">course forum</a></p>
      <p class="tiny faint mono">activity_completed · activity_type: exercise · item_type: ${item.type} · max_hint_level: ${Math.max(0, s.maxLevel)} · verified: ${!expl}${q.task ? ` · plan_task_id: ${esc(q.task)}` : ""}</p>
      <details class="panel proto"><summary class="small muted">Prototype only</summary><div class="row" style="margin-top:10px"><button class="btn btn-sm" type="button" data-p="toggle-predict" aria-pressed="${st.predict}">Show “Predict the output” (triggered when your answer differs from ours on a random input)</button>${simButtons(["elm"])}</div></details>
    </div>`;
  }

  // ================= Quick challenge =================
  function quickScreen(id) {
    const qc = P.quick.find((q) => q.id === id);
    if (!qc || !qc.starter) return `<section class="panel"><div class="empty"><p>This challenge isn't available.</p><a class="btn" href="#/practice">Back to Practice</a></div></section>`;
    const R = st.quickRes[id] || (st.quickRes[id] = { code: qc.starter, result: null, running: false });
    return `<div class="page-head"><div><div class="row"><a class="btn btn-ghost btn-sm back" href="#/practice">${icon("arrow-left")}Practice</a></div>
      <h1 style="margin-top:6px">${esc(qc.title)}</h1><div class="row" style="margin-top:8px"><span class="nohint">${icon("eye-off")}No hints</span><span class="chip">${esc(qc.concept)}</span><span class="tiny faint">~${qc.minutes} min · one attempt</span></div></div></div>
      <section class="panel"><div class="panel-body stack-sm"><p>${md(qc.statement)}</p>
        <table class="data ex"><thead><tr><th>Call</th><th>Expected</th></tr></thead><tbody>${qc.visible_checks.map((c) => `<tr><td class="mono">${esc(qc.statement.match(/`(\w+)\(/)[1])}(${esc(c.input)})</td><td class="mono">${esc(c.expected)}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="panel work">
        ${codeEditor({ id: "qc-" + id, language: "python", signature: `def ${qc.statement.match(/`(\w+)\(/)[1]}()` }, { answer: R.code })}
        <div class="actionbar"><button class="btn btn-primary ${R.running ? "is-loading" : ""}" type="button" data-p="qc-run" data-v="${id}" ${R.result || R.running ? "disabled" : ""} aria-describedby="qc-why">${R.running ? "Running" : `${icon("play")}Run`}</button>
        <span class="tiny faint" id="qc-why">${R.result ? "This challenge is finished." : "One Run. No hints, no last step: this is the on-your-own check."}</span></div>
        ${R.result ? `<div class="out stagger">${R.result.passed
          ? `<div class="out-sum pass">${icon("circle-check")}Solved on your own ✓</div><p class="small">${esc(qc.concept)} comes back in a mixed challenge in about 2 days.</p>`
          : `<div class="out-sum neutral">${icon("circle-dot")}Not this time</div><p class="small">${esc(qc.concept)} is now marked worth practising. It comes back in 2 days, and there's no penalty. The attempt is over, so here's what happened:</p>`}
          <div class="chks">${R.result.rows.map((v, k) => `<div class="chk ${v.passed ? "ok" : "bad"}" style="--i:${k}">${icon(v.passed ? "check" : "x")}<span class="mono">${esc(v.input)}</span><span class="mono faint">expected ${esc(v.expected)}</span><span class="mono">${v.passed ? "" : `got ${esc(v.got)}`}</span></div>`).join("")}</div></div>` : ""}
      </section>
      <div class="row"><a class="btn" href="#/practice">${icon("arrow-left")}Back to Practice</a></div>`;
  }

  // ================= Mixed challenge =================
  function mixedScreen() {
    const M = st.mixed, probs = P.mixed.problems;
    const solved = probs.filter((p) => M.results[p.id]?.passed).length;
    return `<div class="page-head"><div><div class="row"><a class="btn btn-ghost btn-sm back" href="#/practice">${icon("arrow-left")}Practice</a></div>
      <h1 style="margin-top:6px">Mixed challenge</h1><div class="row" style="margin-top:8px"><span class="nohint">${icon("eye-off")}No hints</span><span class="tiny faint">${probs.length} problems · ~${P.mixed.minutes} min</span></div>
      <p>Three topics that are due, mixed together. Mixing makes you pick the right idea yourself, which is what helps it stick.</p></div>
      <div class="page-actions"><button class="btn btn-primary" type="button" data-p="mx-all" ${M.done ? "disabled" : ""}>${icon("play")}Run all</button></div></div>
      <div class="mixed-grid">
        ${probs.map((p, k) => { const r = M.results[p.id]; return `<section class="panel mx ${r ? (r.passed ? "is-pass" : "is-miss") : ""}" aria-labelledby="mx-${p.id}">
          <div class="panel-head"><div><div class="tiny faint">${k + 1} · ${esc(p.subject)}</div><h2 id="mx-${p.id}" style="font-size:1rem">${esc(p.concept)}</h2></div>${r ? `<span class="sbadge ${r.passed ? "s-own" : "s-new"}">${r.passed ? "<span aria-hidden=\"true\">✓</span>On your own" : "Not this time"}</span>` : ""}</div>
          <div class="panel-body stack-sm"><p class="small">${md(p.statement)}</p>
            ${p.kind === "code" ? `<textarea class="textarea mono" rows="5" data-p-mx="${p.id}" spellcheck="false" aria-label="Answer for problem ${k + 1}" ${r ? "readonly" : ""}>${esc(M.answers[p.id] ?? p.starter)}</textarea>`
              : `<input class="input mono" data-p-mx="${p.id}" aria-label="Answer for problem ${k + 1}" value="${esc(M.answers[p.id] ?? "")}" placeholder="${p.kind === "formula" ? "e.g. ¬p ∨ q  (or ~p | q)" : "a number"}" ${r ? "readonly" : ""}>`}
            ${r ? `<div class="small ${r.passed ? "ok-t" : "muted"} result-in">${esc(r.detail)}</div>` : `<div><button class="btn btn-sm" type="button" data-p="mx-run" data-v="${p.id}">${icon("play")}Run</button></div>`}
          </div></section>`; }).join("")}
      </div>
      ${M.done ? `<section class="panel summary enter"><div class="panel-body stack-sm">
        <h2>${solved} of ${probs.length} solved on your own</h2>
        <ul class="sched">${probs.map((p) => `<li><span class="small">${esc(p.concept)}</span><span class="sch ${M.results[p.id].passed ? "sch-next" : "sch-worth"}">${M.results[p.id].passed ? "Next check in 7 days" : "Worth practising · back in 2 days"}</span></li>`).join("")}</ul>
        <div class="row"><a class="btn btn-primary" href="#/practice">Back to Practice</a></div></div></section>` : ""}`;
  }

  // ================= Upload status (/practice/uploads/:id) =================
  function uploadScreen(id) {
    if (id === "new") { st.uploadsOpen = true; setTimeout(() => { location.replace("#/practice"); setTimeout(() => document.getElementById("uploads")?.scrollIntoView({ behavior: "smooth" }), 60); }, 0); return ""; }
    const u = st.uploads.find((x) => x.id === id);
    if (!u) return `<section class="panel"><div class="empty"><p>Upload not found.</p><a class="btn" href="#/practice">Back to Practice</a></div></section>`;
    const steps = ["Reading the question", "Creating the exercise (solution, checks, hints)", "Verifying with tools", "Ready"];
    const step = u.status === "preparing" ? u.step : 4;
    return `<div class="page-head"><div><div class="row"><a class="btn btn-ghost btn-sm back" href="#/practice">${icon("arrow-left")}Practice</a></div><h1 style="margin-top:6px">${esc(u.title)}</h1>
      <div class="row" style="margin-top:8px"><span class="chip">${esc(u.subject)}</span><span class="tiny faint">${u.source} · private to you</span><span class="badge ${UPLOAD[u.status][1]}">${UPLOAD[u.status][0]}</span></div></div></div>
      <section class="panel"><div class="panel-body">
        <ol class="upsteps" aria-live="polite">
          ${steps.map((t, k) => {
            const warn = u.status === "unverified" && k >= 2, fail = u.status === "failed" && k === Math.min(u.failAt ?? 1, 3);
            const cls = fail ? "fail" : warn ? "warn" : k < step || (k === 3 && step === 4) ? "done" : k === step ? "now" : "";
            const label = k === 3 && u.status === "unverified" ? "Added as Unverified: text hints only, not counted in your progress" : k === 2 && u.status === "unverified" ? "Verifying with tools: couldn't verify this question" : t;
            return `<li class="${cls}"><span class="us-dot" aria-hidden="true">${cls === "done" ? icon("check") : cls === "warn" ? icon("triangle-alert") : cls === "fail" ? icon("x") : k + 1}</span><span class="small">${label}</span></li>`; }).join("")}
        </ol>
        ${u.status === "verified" ? `<div class="row" style="margin-top:16px"><a class="btn btn-primary" href="#/practice/${u.item_id || "up-vowels"}">${icon("play")}Open exercise</a><span class="tiny faint">Full hint ladder. Counts in your progress.</span></div>` : ""}
        ${u.status === "unverified" ? `<div class="note warn" style="margin-top:16px">${icon("triangle-alert")}<div>We couldn't check answers to this question with tools, so it has text hints only and never counts toward your progress.</div></div>` : ""}
        ${u.status === "failed" ? `<div class="note fail" style="margin-top:16px">${icon("circle-x")}<div>We couldn't read a question from this file. Try pasting the text instead.<div style="margin-top:8px"><button class="btn btn-sm" type="button" data-p="up-retry" data-v="${u.id}">${icon("rotate-ccw")}Try again</button></div></div></div>` : ""}
      </div></section>`;
  }

  // ================= behaviour =================
  let docKey = null;
  function bind(root, parts) {
    const r = parse(parts);
    const box = root.querySelector("[data-practice]");
    if (!box) return;
    const gen = SX.gen();
    const alive = () => SX.stillOn(gen); // route generation bumps on every navigation
    const item = (r.view === "solve" || r.view === "done") ? itemById(r.id) : null;
    const s = item && sess(item);

    const patch = (...names) => {
      names.forEach((n) => {
        const el = box.querySelector(`[data-region="${n}"]`);
        if (!el) return;
        if (n === "head") el.innerHTML = solveHead(item, s);
        if (n === "actions") el.innerHTML = actions(item, s);
        if (n === "status") el.innerHTML = statusLine(item, s);
        if (n === "output") el.innerHTML = output(item, s);
        if (n === "help") el.innerHTML = help(item, s);
        if (n === "input") el.innerHTML = answerInput(item, s);
        if (n === "examples") el.innerHTML = examples(item, s);
        if (n === "tabs") el.innerHTML = paneTabs(s);
      });
      SX.icons();
    };
    const rerender = () => SX.render();

    if (r.view === "home" && !st.loaded) { setTimeout(() => { if (!alive()) return; st.loaded = true; st.reveal = true; rerender(); }, 650); }
    else if (r.view === "home") st.reveal = false;
    if (r.view === "upload") {
      const u = st.uploads.find((x) => x.id === r.id);
      if (u && u.status === "preparing" && !u.polling) (async () => {
        u.polling = true;
        while (u.step < 3) { await sleep(1000); if (!alive()) { u.polling = false; return; } u.step++; if (u.outcome === "failed" && u.step === 1) { u.status = "failed"; u.failAt = 1; break; } if (u.outcome === "unverified" && u.step === 3) { u.status = "unverified"; break; } rerender(); }
        if (!alive()) { u.polling = false; return; }
        u.polling = false;
        if (u.status === "preparing") { u.status = "verified"; u.item_id = "up-vowels"; toast("Exercise ready and added to your list."); }
        rerender();
      })();
    }

    // --- code editor (delegated, so it survives partial re-renders) ---
    function onCode(ta) {
      const area = ta.closest(".code-area"), hl = area.querySelector("[data-phl]"), gutter = area.querySelector(".gutter");
      hl.innerHTML = (ta.dataset.lang === "python" ? hlPy(ta.value) : esc(ta.value)) + "\n";
      const n = ta.value.split("\n").length;
      if (gutter.children.length !== n || gutter.querySelector(".err")) gutter.innerHTML = Array.from({ length: n }, (_, k) => `<span>${k + 1}</span>`).join("");
      if (r.view === "quick") { st.quickRes[r.id].code = ta.value; return; }
      s.answer = ta.value; s.compileErr = null;
      markDirty();
    }
    let lastInput = null;
    box.addEventListener("focusin", (e) => { if (e.target.matches('[data-p-in="answer"], [data-p-proof][data-f="f"]')) lastInput = e.target; });

    // Run shortcut works anywhere on the solve screen, not only inside the editor
    if (docKey) document.removeEventListener("keydown", docKey);
    docKey = (e) => { if (!alive()) { document.removeEventListener("keydown", docKey); docKey = null; return; } if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && item && r.view === "solve") { e.preventDefault(); run(); } };
    document.addEventListener("keydown", docKey);
    box.addEventListener("keydown", (e) => {
      if (e.target.matches("[data-pcode]") && e.key === "Tab" && !e.shiftKey) { e.preventDefault(); e.target.setRangeText("    ", e.target.selectionStart, e.target.selectionEnd, "end"); onCode(e.target); return; }
      const row = e.target.closest && e.target.closest(".prow");
      if (row && e.target === row) {
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); moveRow(row.dataset.key, e.key === "ArrowUp" ? -1 : 1, true); }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); toggleNN(row.dataset.key, true); }
      }
    });

    box.addEventListener("input", (e) => {
      const t = e.target;
      if (t.matches("[data-pcode]")) return onCode(t);
      if (t.dataset.pIn === "answer") { s.answer = t.value; markDirty(); if (item.type === "formula") { const p = box.querySelector('[data-region="preview"]'); if (p) p.innerHTML = formulaPreview(t.value); } }
      if (t.dataset.pStep !== undefined) { s.answer[+t.dataset.pStep] = t.value; markDirty(); }
      if (t.dataset.pProof !== undefined) { s.answer[+t.dataset.pProof][t.dataset.f] = t.value; markDirty(); }
      if (t.dataset.pIn === "other") s.otherText = t.value;
      if (t.dataset.pIn === "why") s.wrap.why = t.value;
      if (t.dataset.pIn === "text") { st.upload.text = t.value; refreshUploadBtn(); }
      if (t.dataset.pBlank !== undefined) s.h4.values[+t.dataset.pBlank] = t.value;
      if (t.dataset.pMx) st.mixed.answers[t.dataset.pMx] = t.value;
    });
    box.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.pProof !== undefined) { s.answer[+t.dataset.pProof][t.dataset.f] = t.value; markDirty(); }
      if (t.dataset.pIn === "file") { st.upload.file = t.files[0] ? t.files[0].name : ""; if (t.files[0] && t.files[0].size > 25 * 1024 * 1024) { toast("That PDF is over 25 MB."); st.upload.file = ""; } rerenderKeep("#up-file"); }
      if (t.dataset.pIn === "subject") st.upload.subject = t.value;
      if (t.dataset.pIn === "outcome") st.upload.outcome = t.value;
      if (t.dataset.pIn === "confirmed") { st.upload.confirmed = t.checked; refreshUploadBtn(); }
      if (t.dataset.p === "p-nn") toggleNN(t.dataset.v);
    });
    box.addEventListener("submit", (e) => {
      if (e.target.dataset.pForm === "upload") { e.preventDefault(); prepareUpload(); }
    });

    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]");
      if (!b || b.dataset.p === "p-nn") return;
      const v = b.dataset.v, a = b.dataset.p;
      if (a === "open-upload") { e.preventDefault(); st.uploadsOpen = true; rerender(); document.getElementById("uploads")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (a === "filter") { st.filter = v; rerender(); }
      if (a === "first-visit") { st.firstVisit = !st.firstVisit; rerender(); }
      if (a === "reload") { st.loaded = false; rerender(); }
      if (a === "retry") { st.sim = "normal"; st.loaded = false; rerender(); }
      if (a === "sim") { st.sim = v; if (v === "rate" || v === "runner") toast(v === "rate" ? "Next Run hits the hidden-check limit." : "Next Run finds the runner unavailable."); rerender(); }
      if (a === "toggle-upload") { st.uploadsOpen = !st.uploadsOpen; rerender(); }
      if (a === "upsrc") { st.upload.source = v; rerender(); }
      if (a === "up-retry") { const u = st.uploads.find((x) => x.id === v); u.status = "preparing"; u.step = 0; u.outcome = "verified"; rerender(); }
      if (a === "task-toggle") { s.taskOpen = !s.taskOpen; const c = box.querySelector("#task-body"); c.classList.toggle("open", s.taskOpen); b.setAttribute("aria-expanded", s.taskOpen); b.innerHTML = `${icon(s.taskOpen ? "chevron-up" : "chevron-down")}${s.taskOpen ? "Hide task" : "Show task"}`; SX.icons(); }
      if (a === "pane") { st.pane = v; box.querySelector(".solve-grid").dataset.pane = v; box.querySelectorAll('[data-p="pane"]').forEach((x) => x.setAttribute("aria-selected", x.dataset.v === v)); }
      if (a === "run") run();
      if (a === "hint") askHint();
      if (a === "escape") { s.escape = true; s.notReal = false; patch("actions", "status"); toast("Next hint unlocked."); box.querySelector('[data-p="hint"]')?.focus(); }
      if (a === "five-min") { if (s.level >= 0 && !s.solved) { s.escape = true; s.notReal = false; patch("actions", "status"); toast(`${C.STUCK_UNLOCK_MIN} minutes passed without a change: next hint unlocked.`); } else toast("The 5-minute unlock only applies after a hint."); }
      if (a === "glow") { s.glow = true; patch("actions"); }
      if (a === "reset-item") { delete st.sessions[item.id]; item._status = "new"; rerender(); toast("Exercise reset: starting fresh."); }
      if (a === "chip") { s.chip = s.chip === v ? null : v; patch("help"); if (s.chip === "other") box.querySelector(`#other-${item.id}`)?.focus(); }
      if (a === "rate") { const [id, d] = v.split(":"); const h = s.hints.find((x) => String(x.id) === id); h.rating = h.rating === d ? null : d; patch("help"); toast("Thanks. Ratings help us improve or remove hints."); }
      if (a === "sym") { const fs = box.querySelectorAll('[data-p-proof][data-f="f"]'); const inp = (lastInput && lastInput.isConnected ? lastInput : null) || box.querySelector('[data-p-in="answer"]') || fs[fs.length - 1]; if (inp) { inp.focus(); inp.setRangeText(v, inp.selectionStart ?? inp.value.length, inp.selectionEnd ?? inp.value.length, "end"); inp.dispatchEvent(new Event("input", { bubbles: true })); } }
      if (a === "step-add") { s.answer.push(""); markDirty(); patch("input"); box.querySelector(`[data-p-step="${s.answer.length - 1}"]`)?.focus(); }
      if (a === "step-del") { s.answer.splice(+v, 1); markDirty(); patch("input"); }
      if (a === "step-up" || a === "step-down") { const k = +v, j = a === "step-up" ? k - 1 : k + 1; [s.answer[k], s.answer[j]] = [s.answer[j], s.answer[k]]; markDirty(); patch("input"); box.querySelector(`[data-p="${a}"][data-v="${j}"]`)?.focus(); }
      if (a === "proof-add") { s.answer.push({ f: "", rule: "→E", refs: "" }); markDirty(); patch("input"); }
      if (a === "proof-del") { s.answer.splice(+v, 1); markDirty(); patch("input"); }
      if (a === "p-up" || a === "p-down") moveRow(v, a === "p-up" ? -1 : 1, false, b);
      if (a === "h4-check") h4Check();
      if (a === "why-fb") { if (!s.wrap.why.trim()) { toast("Write one line first, or press Skip."); return; } s.wrap.feedback = item.id === "list-total" ? "Right idea: a total has to include every number, so there's no filter inside the loop." : "Your idea matches why the answer works."; rerender(); }
      if (a === "why-skip") { s.wrap.skipped = true; rerender(); }
      if (a === "predict") { const i = box.querySelector('[data-p-in="predict"]'); s.wrap.predicted = i.value || "?"; rerender(); }
      if (a === "toggle-predict") { st.predict = !st.predict; rerender(); }
      if (a === "qc-run") quickRun(v);
      if (a === "mx-run") mixedRun([v]);
      if (a === "mx-all") mixedRun(P.mixed.problems.map((p) => p.id).filter((id) => !st.mixed.results[id]));
    });

    function markDirty() { if (s.runs && !s.dirty) { s.dirty = true; patch("actions", "status"); } }
    function refreshUploadBtn() {
      const U = st.upload, left = C.UPLOADS_PER_DAY - st.uploadsToday;
      const ok = U.confirmed && left > 0 && (U.source === "pdf" ? !!U.file : U.text.trim().length > 10);
      const btn = box.querySelector('[data-p-form="upload"] button[type="submit"]'); if (btn) btn.disabled = !ok;
      const why = box.querySelector("#up-why"); if (why) why.textContent = left <= 0 ? "Daily limit reached. You can upload again tomorrow." : !U.confirmed ? "Tick the confirmation to continue." : U.source === "pdf" && !U.file ? "Choose a PDF first." : U.source === "text" && U.text.trim().length <= 10 ? "Paste the question text first." : "";
    }
    function rerenderKeep(sel) { rerender(); document.querySelector(sel)?.focus(); }

    function prepareUpload() {
      const U = st.upload;
      const id = "up-" + (st.uploads.length + 1);
      const subjName = { auto: "Python (detected)", python: "Python", haskell: "Haskell", la: "Linear Algebra", logic: "Propositional logic" }[U.subject];
      const title = U.source === "pdf" ? U.file.replace(/\.pdf$/i, "") : U.text.trim().split("\n")[0].slice(0, 48);
      st.uploads.unshift({ id, title, subject: subjName, source: U.source === "pdf" ? "PDF" : "Text", status: "preparing", step: 0, when: "Just now", outcome: U.outcome });
      st.uploadsToday++;
      Object.assign(st.upload, { confirmed: false, file: "", text: "" });
      location.hash = `#/practice/uploads/${id}`;
    }

    // --- Run: visible checks, then hidden checks automatically ---
    async function run() {
      if (!item || s.running || s.solved) return;
      if (st.sim === "offline") { patch("status"); toast("You're offline. Your draft is kept."); return; }
      const norm = SERVER.normalize(item, s.answer);
      const real = SERVER.isRealChange(item, s.lastRunNorm, norm);
      s.running = true; s.phase = "visible"; s.dirty = false; s.fresh = null;
      patch("actions", "status");
      await sleep(550); if (!alive()) { s.running = false; return; }
      if (st.sim === "runner") { s.running = false; s.runs++; patch("actions", "status", "output"); return; }
      const res = SERVER.check(item, s.answer);
      if (res.compile) s.compileErr = res.compile.line ? res.compile : null;
      const allVisible = !res.compile && (res.visible || []).every((v) => v.passed) && !res.firstWrong && !res.rowsBad && !res.unknown && !res.explanation;
      if (allVisible && res.hidden) {
        s.output = { ...res, hidden: null }; s.fresh = "out"; patch("output", "examples");
        s.phase = "hidden"; patch("status");
        await sleep(1100); if (!alive()) { s.running = false; return; }
        if (st.sim === "rate") res.rate = true;
      }
      s.output = res; s.fresh = "out";
      // rules (server-side in the real app)
      const failKey = res.hidden && res.hidden.passed && !res.rate ? null : res.failKey;
      if (s.runs > 0 && s.level >= 0) {
        if (real) { s.notReal = false; s.pending = failKey === s.lastFail ? "next" : "same"; }
        else s.notReal = true;
      }
      s.sameFail = failKey && failKey === s.lastFail ? s.sameFail + 1 : 1;
      s.lastRunNorm = norm; s.lastFail = failKey; s.runs++; s.running = false; s.phase = null;
      if (item.type === "code" && (s.compileErr || box.querySelector(".squiggle"))) {
        const old = box.querySelector("[data-pcode]"), pos = old ? [old.selectionStart, old.selectionEnd, document.activeElement === old] : null;
        patch("input");
        const nt = box.querySelector("[data-pcode]"); if (pos && nt) { nt.setSelectionRange(pos[0], pos[1]); if (pos[2]) nt.focus(); }
      }
      const solved = (res.hidden && res.hidden.passed && !res.rate) || (res.explanation === "complete");
      if (solved) {
        s.solved = true; s.maxLevel = Math.max(-1, s.maxLevel);
        if (item.type !== "explanation") item._status = s.maxLevel >= 2 ? "solved_with_hints" : "solved_on_own";
        patch("actions", "status", "output", "examples", "head", "help");
        await sleep(1200); if (!alive()) return;
        SX.emit && SX.emit("activity_completed", { activity_type: "exercise", item_type: item.type, max_hint_level: Math.max(0, s.maxLevel), plan_task_id: parts.query.task || null });
        location.hash = `#/practice/${item.id}/done${parts.query.task ? `?task=${parts.query.task}` : ""}`;
        return;
      }
      if (item._status === "new") item._status = "in_progress";
      patch("actions", "status", "output", "examples");
      s.fresh = null;
    }

    function askHint() {
      if (s.level >= 4) { box.querySelector(".h4")?.scrollIntoView({ behavior: "smooth", block: "center" }); box.querySelector(".prow, .blank")?.focus(); return; }
      if (!hintState(s).enabled) return;
      let lvl, newResult = false;
      if (s.level < 0) lvl = s.output && s.output.compile ? 1 : 0;   // syntax/compile errors skip H0
      else if (s.pending === "same" && !s.escape) { lvl = s.level; newResult = true; }
      else lvl = s.level + 1;                                         // never skip a level
      if (lvl === 4 && !item.last_step) { toast("This exercise has no last step. Try the H3 example, or talk it through with a tutor."); return; }
      const h = SERVER.hint(item, lvl, s, { newResult });
      s.hints.unshift({ id: Date.now(), level: lvl, ...h, lang: item.language, rating: null });
      s.level = lvl; s.maxLevel = Math.max(s.maxLevel, lvl);
      s.pending = null; s.escape = false; s.notReal = false; s.chip = null; s.glow = false; s.sameFail = 0;
      if (lvl === 4) s.h4 = h4Init(item);
      s.fresh = "hint";
      st.pane = "help"; const g = box.querySelector(".solve-grid"); if (g) g.dataset.pane = "help"; box.querySelectorAll('[data-p="pane"]').forEach((x) => x.setAttribute("aria-selected", x.dataset.v === "help"));
      patch("head", "actions", "status", "help", "tabs");
      setTimeout(() => { s.fresh = null; }, 0);
    }

    // --- H4 interactions ---
    function moveRow(key, dir, keepFocus, btn) {
      const H = s.h4, list = H.rows.filter((r) => !H.removed.has(r.key));
      const k = list.findIndex((r) => r.key === key), j = k + dir;
      if (j < 0 || j >= list.length) return;
      const before = flipFirst();
      const ia = H.rows.indexOf(list[k]), ib = H.rows.indexOf(list[j]);
      [H.rows[ia], H.rows[ib]] = [H.rows[ib], H.rows[ia]];
      H.highlight = null; H.msg = null;
      patch("help"); flipPlay(before);
      if (keepFocus) box.querySelector(`.prow[data-key="${key}"]`)?.focus();
      else if (btn) { const nb = box.querySelector(`[data-p="${btn.dataset.p}"][data-v="${key}"]`); (nb && !nb.disabled ? nb : box.querySelector(`.prow[data-key="${key}"]`))?.focus(); }
    }
    function toggleNN(key, keepFocus) {
      const H = s.h4; H.excluded.has(key) ? H.excluded.delete(key) : H.excluded.add(key); H.highlight = null; H.msg = null;
      patch("help"); if (keepFocus) box.querySelector(`.prow[data-key="${key}"]`)?.focus(); else box.querySelector(`[data-p="p-nn"][data-v="${key}"]`)?.focus();
    }
    function flipFirst() { const m = new Map(); box.querySelectorAll(".prow").forEach((el) => m.set(el.dataset.key, el.getBoundingClientRect().top)); return m; }
    function flipPlay(before) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      box.querySelectorAll(".prow").forEach((el) => {
        const t0 = before.get(el.dataset.key); if (t0 == null) return;
        const d = t0 - el.getBoundingClientRect().top; if (!d) return;
        el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      });
    }
    async function h4Check() {
      const H = s.h4, L = item.last_step;
      if (H.kind === "faded") {
        const bad = L.steps.map((x, k) => (H.values[k].replace(/\s/g, "") === x.answer ? -1 : k)).filter((k) => k >= 0);
        if (bad.length) { H.wrong++; H.bad = H.wrong >= C.H4_HIGHLIGHT_AFTER ? [bad[0]] : null; H.msg = H.wrong >= C.H4_HIGHLIGHT_AFTER ? `The highlighted blank isn't right yet.` : `${bad.length} blank${bad.length === 1 ? " isn't" : "s aren't"} right yet.`; patch("help"); return; }
        return finishH4();
      }
      const { live } = h4Progress(H, item);
      const correct = live.length === L.lines.length && live.every((r, k) => !r.decoy && r.pos === k);
      if (correct) return finishH4();
      H.wrong++;
      const decoyLeft = H.rows.find((r) => r.decoy && !H.removed.has(r.key) && !H.excluded.has(r.key));
      if (H.wrong === 1 && decoyLeft) { H.removed.add(decoyLeft.key); H.msg = `Not yet. One line wasn't needed, so we removed it: <code>${esc(decoyLeft.text.trim())}</code>`; }
      else {
        const first = live.find((r, k) => r.decoy || r.pos !== k);
        H.highlight = H.wrong >= C.H4_HIGHLIGHT_AFTER && first ? first.key : null;
        H.msg = H.highlight ? "Not yet. The highlighted line is the first one out of place." : "Not yet. Check the order from the top.";
      }
      patch("help");
    }
    async function finishH4() {
      const H = s.h4; H.msg = "Order looks right. Checking the assembled answer…"; patch("help");
      await sleep(900); if (!alive()) return;
      s.answer = item.type === "code" ? item.last_step.lines.join("\n") + "\n" : s.answer;
      s.output = { visible: (item.visible_checks || []).map((c) => ({ input: c.input, expected: c.expected, got: c.expected, passed: true })), hidden: { passed: true } };
      s.solved = true; item._status = "solved_with_hints"; s.fresh = "out";
      patch("input", "output", "status", "actions", "head", "help", "examples");
      await sleep(1100); if (!alive()) return;
      SX.emit && SX.emit("activity_completed", { activity_type: "exercise", item_type: item.type, max_hint_level: Math.max(0, s.maxLevel), plan_task_id: parts.query.task || null });
        location.hash = `#/practice/${item.id}/done${parts.query.task ? `?task=${parts.query.task}` : ""}`;
    }

    // --- challenges ---
    async function quickRun(id) {
      const R = st.quickRes[id]; R.running = true; rerender();
      await sleep(800); if (!alive()) { R.running = false; return; }
      R.running = false; R.result = SERVER.quickCheck(id, R.code);
      if (R.result.passed) st.quickDone.add(id); else P.quick.find((q) => q.id === id).missed = true;
      rerender();
    }
    async function mixedRun(ids) {
      for (const id of ids) {
        const p = P.mixed.problems.find((x) => x.id === id);
        const card = box.querySelector(`#mx-${id}`)?.closest(".mx"); card && card.classList.add("checking");
        await sleep(500); if (!alive()) return;
        st.mixed.results[id] = SERVER.mixedCheck(p, st.mixed.answers[id] ?? (p.kind === "code" ? p.starter : ""));
      }
      st.mixed.done = P.mixed.problems.every((p) => st.mixed.results[p.id]);
      rerender();
    }
  }

  return { meta, render, bind };
};
