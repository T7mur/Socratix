// Socratix design prototype — SAMPLE DATA ONLY.
// Shapes follow docs/shared_contracts.md v1.0 field names. Values are illustrative and uncalibrated.
// Nothing here is a private GradingArtifact: no reference solutions, no hidden tests.

window.SAMPLE = {
  student: { name: "Sam Rivera", initials: "SR", course: "Informatics 1 — Python" },
  instructor: { name: "Dr. A. Moreno", initials: "AM" },

  // Approved skill graph (+ one proposed edge under review)
  skills: [
    { skill_id: "python.variables", name: "Variables", description: "Name and update values", approval_status: "approved", x: 0, y: 150 },
    { skill_id: "python.comparisons", name: "Comparisons", description: "Compare values to produce Booleans", approval_status: "approved", x: 215, y: 40 },
    { skill_id: "python.lists", name: "Lists", description: "Store and index ordered collections", approval_status: "approved", x: 215, y: 170 },
    { skill_id: "python.functions", name: "Functions", description: "Define and call reusable behaviour", approval_status: "approved", x: 215, y: 300 },
    { skill_id: "python.conditionals", name: "Conditionals", description: "Select actions using Boolean conditions", approval_status: "approved", x: 430, y: 40 },
    { skill_id: "python.loops", name: "Loops", description: "Repeat actions until a condition holds", approval_status: "approved", x: 645, y: 170 },
    { skill_id: "python.input_validation", name: "Input validation", description: "Reject malformed input without crashing", approval_status: "approved", x: 645, y: 0 },
  ],
  relations: [
    { from_skill_id: "python.comparisons", to_skill_id: "python.variables", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.lists", to_skill_id: "python.variables", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.functions", to_skill_id: "python.variables", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.conditionals", to_skill_id: "python.comparisons", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.loops", to_skill_id: "python.conditionals", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.input_validation", to_skill_id: "python.conditionals", relation: "requires", approval_status: "approved" },
    { from_skill_id: "python.loops", to_skill_id: "python.lists", relation: "requires", approval_status: "under_review" },
  ],

  // SkillEstimate[] (null = insufficient evidence, never zero)
  estimates: {
    "python.variables": { recall_index: 0.95, understanding_index: 0.9, transfer_index: 0.85, gap_priority_index: 0.08, evidence_count: 9, confidence_label: "high", hypotheses: [] },
    "python.comparisons": { recall_index: 0.9, understanding_index: 0.8, transfer_index: 0.7, gap_priority_index: 0.22, evidence_count: 6, confidence_label: "medium", hypotheses: [] },
    "python.conditionals": {
      recall_index: 0.9, understanding_index: 0.65, transfer_index: 0.45, gap_priority_index: 0.71, evidence_count: 5, confidence_label: "medium",
      hypotheses: [{ label: "boundary confusion", status: "suspected", supporting_evidence_ids: ["ev-41c2", "ev-57aa"], note: "Inclusive vs strict bound at quantity 3; one valid failure so far." }],
    },
    "python.loops": { recall_index: 0.8, understanding_index: 0.6, transfer_index: null, gap_priority_index: null, evidence_count: 3, confidence_label: "low", hypotheses: [] },
    "python.lists": { recall_index: 0.7, understanding_index: 0.5, transfer_index: null, gap_priority_index: null, evidence_count: 2, confidence_label: "low", hypotheses: [] },
    "python.functions": { recall_index: null, understanding_index: null, transfer_index: null, gap_priority_index: null, evidence_count: 0, confidence_label: "low", hypotheses: [] },
    "python.input_validation": {
      recall_index: 0.6, understanding_index: 0.4, transfer_index: 0.3, gap_priority_index: 0.64, evidence_count: 4, confidence_label: "low",
      hypotheses: [{ label: "converts before validating", status: "suspected", supporting_evidence_ids: ["ev-62f0"], note: "From one test failure plus your reflection; needs a diagnostic." }],
    },
  },

  retentionDue: [
    { skill_id: "python.loops", due: "Today", reason: "7-day check after independent recall success", kind: "now" },
    { skill_id: "python.conditionals", due: "Mon 27 Oct", reason: "Unaided transfer check in a new context", kind: "later" },
    { skill_id: "python.variables", due: "Wed 12 Nov", reason: "21-day spaced check", kind: "later" },
  ],


  // ---------- Planning (planning_ui.md v2 + planning_execution_plan.md §7) ----------
  // What the server would return for a seeded demo student. Busy-time labels are NOT here:
  // they live only in the browser (localStorage), the server keeps times.
  planning: {
    today: "2026-10-26",                      // Monday
    student: { email: "sam.rivera@example.ac.uk", path: "beginner",
      recent: [false, true, true, false, true] }, // last 5 counted plans, oldest first: 3 on target
    config: { N_PLANS: 5, BEST_OF: 4, QUALITY_MIN: 4, COMPLETION_MIN: 0.7, STEP_BACK_AFTER: 3, BUFFER_MIN: 0.15, MAX_TASK_MIN: 90, MILESTONE_BUFFER_DAYS: 2, MILESTONES_OPTIONAL_UNDER_DAYS: 7, ASK_PER_DAY: 5, MAX_REVIEWS_PER_PLAN: 2, REST_DAYS_PER_WEEK: 2 },
    setup: {
      window: { start: "09:00", end: "21:00" },
      weeklyHours: 20, dailyCapMin: 240,          // planning_methodology v6 §2 (design choices, not research-derived)
      updated: "Mon 19 Oct",
      deadlines: [
        { id: "d1", course: "INF2", item: "Coursework 2", kind: "assignment", subtype: "code", date: "2026-11-09", time: "14:00",
          parts: [{ name: "Lab 3 tasks", size: "m" }, { name: "Report draft", size: "l" }, { name: "Tests", size: "s" }] },
        { id: "d2", course: "LA1", item: "Midterm", kind: "exam", date: "2026-11-05", time: "10:00", papers: 2, paperMin: 120,
          topics: [{ name: "Matrices", confidence: "low" }, { name: "Vectors", confidence: "ok" }, { name: "Linear systems", confidence: "ok" }, { name: "Determinants", confidence: "high" }] },
        { id: "d3", course: "INF1A", item: "Tutorial sheet 5", kind: "assignment", subtype: "maths", date: "2026-10-28", time: "10:00", parts: [{ name: "Q1–3", size: "s" }] },
      ],
      classes: [
        { id: "c1", day: 1, start: "11:00", end: "12:00", name: "INF2 lecture" },
        { id: "c2", day: 2, start: "09:00", end: "11:00", name: "INF1A lecture" },
        { id: "c3", day: 2, start: "14:00", end: "17:00", name: "INF2 lab" },
        { id: "c4", day: 3, start: "11:00", end: "12:00", name: "INF2 lecture" },
        { id: "c5", day: 3, start: "14:00", end: "16:00", name: "LA1 tutorial" },
        { id: "c6", day: 4, start: "09:00", end: "11:00", name: "INF1A lecture" },
        { id: "c7", day: 4, start: "14:00", end: "16:00", name: "LA1 lecture" },
        { id: "c8", day: 5, start: "10:00", end: "12:00", name: "LA1 lecture" },
      ],
      busy: [   // times only; day 0 = Sunday … 6 = Saturday
        { id: "b1", days: [2, 3, 4, 5], start: "17:00", end: "21:00" },
        { id: "b2", days: [6], start: "10:00", end: "18:00" },
        { id: "b3", days: [0], start: "12:00", end: "18:00" },
      ],
      busyLabelsSeed: { b1: "Café shift", b2: "Café shift", b3: "Family lunch" },
    },
    milestones: [],                           // built from the v6 Exam/Assignment templates when the page starts
    // §9 test fixture: starts at 3/5, reaches 5/5 when both suggestions are resolved
    tasks: [
      { id: "t1", text: "Finish INF2 lab 3, Q1–4", time: "10:00", mins: 60, where: "" },
      { id: "t2", text: "Revise lecture 5", time: "13:00", mins: 45, where: "" },
      { id: "t3", text: "Past paper 1, all questions", time: "17:00", mins: 40, where: "Library" },
    ],
    // closed plans, oldest first (completion in %, null = rest day); today is appended at check-in
    history: [
      { date: "2026-10-12", completion: 67 }, { date: "2026-10-13", completion: 100 }, { date: "2026-10-14", completion: 50 },
      { date: "2026-10-15", completion: 75 }, { date: "2026-10-16", completion: null }, { date: "2026-10-17", completion: 33 },
      { date: "2026-10-18", completion: 80 }, { date: "2026-10-19", completion: 100 }, { date: "2026-10-20", completion: 60 },
      { date: "2026-10-21", completion: 75 }, { date: "2026-10-22", completion: 100 }, { date: "2026-10-23", completion: 67 },
      { date: "2026-10-24", completion: null }, { date: "2026-10-25", completion: 80 },
    ],
    // "took" ratings of ticked tasks in the last 14 days, by task type
    ratings: { coding: ["more", "much_more", "as_planned", "more"], reading: ["as_planned", "less", "as_planned"], maths: ["more", "as_planned"] },
    // fallbacks when ELM can't answer (v6 §10): generic E2 questions; the gap that E4 turns into a task (from Knowledge Gap)
    e2Generic: ["What must be finished first?", "What could go wrong?", "What would \"done\" look like a week before?"],
    gapForE4: { concept: "Recursion on lists", link: { kind: "exercise", ref: "hs-length" } },
    askUsed: 2,
  },

  // ---------- Practice (practice_spec.md v1 + practice_ui_structure.md v1.0) ----------
  // Student-safe fields only: id, type, concept_ids, statement, starter, visible_checks, hints{H0,H1,H3}, last_step, source.
  // Solutions, hidden-check generators and rubrics are server-only (see SERVER in practice.js, simulated).
  practice: {
    config: { STUCK_UNLOCK_MIN: 5, GLOW_SAME_FAILURE: 3, GLOW_MIN: 10, H4_HIGHLIGHT_AFTER: 2, HIDDEN_CHECKS_PER_HOUR: 10, SPACING_DAYS: [2, 7, 21], MIXED_MIN_CONCEPTS: 2, MIXED_MAX_ITEMS: 3, UPLOADS_PER_DAY: 3, N_SESSIONS: 3 },
    planTask: null, // plan tasks come from Planning (SX.planTask)
    subjects: [
      { id: "python", name: "Python", note: "Main practice language" },
      { id: "la", name: "Linear Algebra 1" },
      { id: "logic", name: "Propositional logic", note: "Inf1A" },
      { id: "haskell", name: "Haskell", note: "Inf1A · second language" },
    ],
    items: [
      {
        id: "list-total", type: "code", language: "python", subject: "python", concept: "Loops & lists", concept_ids: ["python.loops", "python.lists"],
        title: "List total", status: "in_progress", minutes: 10, source: "bank",
        statement: "Write `list_total(nums)` that returns the sum of every number in the list `nums`. An empty list sums to 0.",
        signature: "def list_total(nums: list[int]) -> int",
        starter: "def list_total(nums):\n    total = 0\n    for n in nums:\n        if n > 0:\n            total += n\n    return total\n",
        visible_checks: [{ input: "[1, 2, 3]", expected: "6" }, { input: "[]", expected: "0" }, { input: "[5]", expected: "5" }],
        hints: {
          H0: "Look at the failing case: a list that contains negative numbers. Follow what happens to `total` when `n` is negative.",
          H1: "The idea: an `if` inside a loop filters which items are used. A sum should use every item. Which items does your loop let through? (Course notes: Loops, “accumulating a result”.)",
          H3: { text: "Similar problem: count every word in a list, whatever it is.", code: "def count_words(words):\n    count = 0\n    for w in words:\n        count += 1   # every item counts, no filter\n    return count" },
        },
        last_step: { kind: "parsons", label: "Parsons: put the lines in order", lines: ["def list_total(nums):", "    total = 0", "    for n in nums:", "        total += n", "    return total"], decoys: ["        if n > 0:", "    return n"], start: [2, "d0", 0, 4, 3, 1, "d1"] },
        tip: "Strategy: test the edges first. Before you run, try an empty list, one item, and only negative numbers.",
        quick: "list-product",
      },
      {
        id: "digit-sum", type: "code", language: "python", subject: "python", concept: "Functions & recursion", concept_ids: ["python.functions", "python.recursion"],
        title: "Digit sum (recursion)", status: "solved_on_own", minutes: 12, source: "bank",
        statement: "Write a recursive `digit_sum(n)` that returns the sum of the digits of a non-negative integer `n`. Don't convert `n` to a string.",
        signature: "def digit_sum(n: int) -> int",
        starter: "def digit_sum(n):\n    if n < 10:\n        return n\n    return n % 10 + digit_sum(n // 10)\n",
        visible_checks: [{ input: "0", expected: "0" }, { input: "7", expected: "7" }, { input: "1234", expected: "10" }],
        hints: {
          H0: "Look at the failing case and the base case: what should happen for a single digit?",
          H1: "The idea: a recursive function needs a base case that stops, and a step that makes the problem smaller (`n // 10`).",
          H3: { text: "Similar problem: count the digits of n.", code: "def count_digits(n):\n    if n < 10:\n        return 1\n    return 1 + count_digits(n // 10)" },
        },
        last_step: { kind: "parsons", label: "Parsons: put the lines in order", lines: ["def digit_sum(n):", "    if n < 10:", "        return n", "    return n % 10 + digit_sum(n // 10)"], decoys: ["    return digit_sum(n)"], start: [1, "d0", 3, 0, 2] },
        tip: "Strategy: trace a small call by hand (digit_sum(12)) and write each call on its own line.",
        quick: "count-digits",
      },
      {
        id: "la-det", type: "worked_steps", subject: "la", concept: "Determinants", concept_ids: ["la.determinant_2x2"],
        title: "Determinant of a 2×2 matrix", status: "solved_with_hints", minutes: 8, source: "bank",
        statement: "Find det(A) for A = [[2, 1], [4, 3]]. Write one step per line; each line must equal the one before.",
        start_label: "det(A) =",
        starter: ["2*3 - 1*4", "6 - 4", "2"],
        visible_checks: [],
        hints: {
          H0: "Look at the first step that isn't equal to the line before it.",
          H1: "The idea: for [[a, b], [c, d]], det = a·d − b·c. Check which entries you multiply and the sign between them.",
          H3: { text: "Similar problem: B = [[1, 2], [3, 5]].", code: "det(B) = 1·5 − 2·3\n       = 5 − 6\n       = −1" },
        },
        last_step: { kind: "faded", label: "Faded example: fill in the blanks", steps: [{ pre: "det(A) = 2·3 − ", answer: "1", post: "·4" }, { pre: "       = 6 − ", answer: "4", post: "" }, { pre: "       = ", answer: "2", post: "" }] },
        tip: "Strategy: write the formula first, then substitute. Keep one operation per step.",
      },
      {
        id: "la-explain", type: "explanation", subject: "la", concept: "Determinants", concept_ids: ["la.determinant_properties"],
        title: "Why a zero row gives det 0", status: "new", minutes: 5, source: "bank",
        statement: "In one or two sentences: why is the determinant of a square matrix with a row of zeros equal to 0?",
        starter: "",
        hints: {
          H0: "Look at what the determinant expansion does with each entry of that zero row.",
          H1: "The idea: expand along the zero row (cofactor expansion). Every term has one entry from that row.",
          H3: { text: "Similar reasoning: why is det 0 when two rows are equal? Swapping them changes the sign but not the matrix, so det = −det.", code: "" },
        },
        last_step: null,
        tip: "Strategy: explain with one concrete example, then say why it always works.",
      },
      {
        id: "logic-equiv", type: "formula", subject: "logic", concept: "Equivalences", concept_ids: ["logic.de_morgan"],
        title: "¬(p ∧ q) without ∧", status: "solved_on_own", minutes: 6, source: "bank",
        statement: "Write a formula equivalent to ¬(p ∧ q) that doesn't use ∧.",
        starter: "¬p ∨ ¬q",
        hints: {
          H0: "Look at the rows of the truth table where your formula and ¬(p ∧ q) disagree.",
          H1: "The idea: De Morgan's laws turn a negated ∧ into an ∨ of negations.",
          H3: { text: "Similar problem: ¬(p ∨ q) without ∨.", code: "¬(p ∨ q) ≡ ¬p ∧ ¬q" },
        },
        last_step: { kind: "step_order", label: "Step ordering: put the steps in order", lines: ["¬(p ∧ q)", "≡ ¬p ∨ ¬q   (De Morgan)"], decoys: ["≡ ¬p ∧ ¬q"], start: ["d0", 1, 0] },
        tip: "Strategy: check an equivalence with the full truth table, not one example row.",
        quick: "qc-implies",
      },
      {
        id: "logic-proof", type: "logic_proof", subject: "logic", concept: "Natural deduction", concept_ids: ["logic.natural_deduction"],
        title: "Prove q from p → q and p ∧ r", status: "new", minutes: 10, source: "bank",
        statement: "Premises: (1) p → q, (2) p ∧ r. Prove q. One step per line: formula + rule + the lines it uses.",
        premises: ["p → q", "p ∧ r"],
        starter: [{ f: "", rule: "∧E", refs: "" }],
        hints: {
          H0: "Look at the first step the checker marks as not following from the lines it cites.",
          H1: "The idea: →E (modus ponens) needs both p → q and p on earlier lines. Can you get p on its own first?",
          H3: { text: "Similar proof: from a → b and a ∧ c, prove b.", code: "3. a      ∧E 2\n4. b      →E 1, 3" },
        },
        last_step: { kind: "proof_parsons", label: "Proof Parsons: put the steps in order", lines: ["3. p      ∧E 2", "4. q      →E 1, 3"], decoys: ["3. q      →E 1, 2"], start: [1, "d0", 0] },
        tip: "Strategy: work backwards from the goal. What rule produces q, and what does it need?",
      },
      {
        id: "hs-length", type: "code", language: "haskell", subject: "haskell", concept: "Recursion on lists", concept_ids: ["haskell.list_recursion"],
        title: "Length of a list", status: "new", minutes: 10, source: "bank",
        statement: "Define `myLength :: [a] -> Int` recursively, without using `length`.",
        signature: "myLength :: [a] -> Int",
        starter: "myLength :: [a] -> Int\nmyLength [] = undefined\nmyLength (x:xs) = undefined\n",
        visible_checks: [{ input: "myLength []", expected: "0" }, { input: "myLength [7, 8]", expected: "2" }, { input: "myLength \"abc\"", expected: "3" }],
        hints: {
          H0: "Look at the first failing call: what should the empty list give?",
          H1: "The idea: the empty list is the base case; for (x:xs) the length is one more than the length of xs.",
          H3: { text: "Similar problem: sum a list of numbers.", code: "mySum :: [Int] -> Int\nmySum []     = 0\nmySum (x:xs) = x + mySum xs" },
        },
        last_step: { kind: "parsons", label: "Parsons: put the lines in order", lines: ["myLength :: [a] -> Int", "myLength [] = 0", "myLength (_:xs) = 1 + myLength xs"], decoys: ["myLength (x:xs) = x + myLength xs"], start: [2, "d0", 0, 1] },
        tip: "Strategy: write the base case first, then assume the recursive call works.",
      },
    ],
    uploadItems: [
      {
        id: "up-vowels", type: "code", language: "python", subject: "python", concept: "Strings & loops", concept_ids: ["python.strings", "python.loops"],
        title: "Week 5 tutorial · Q3 (count vowels)", status: "new", minutes: 10, source: "upload",
        statement: "Write `count_vowels(s)` that returns how many characters of `s` are vowels (a, e, i, o, u; lowercase only).",
        signature: "def count_vowels(s: str) -> int",
        starter: "def count_vowels(s):\n    count = 0\n    for ch in s:\n        if ch == \"aeiou\":\n            count += 1\n    return count\n",
        visible_checks: [{ input: "\"banana\"", expected: "3" }, { input: "\"\"", expected: "0" }, { input: "\"sky\"", expected: "0" }],
        hints: {
          H0: "Look at the first failing case, \"banana\". Which characters should be counted?",
          H1: "The idea: `==` compares the whole string; to test membership use `in`.",
          H3: { text: "Similar problem: count the digits in a string.", code: "def count_digits(s):\n    count = 0\n    for ch in s:\n        if ch in \"0123456789\":\n            count += 1\n    return count" },
        },
        last_step: { kind: "parsons", label: "Parsons: put the lines in order", lines: ["def count_vowels(s):", "    count = 0", "    for ch in s:", "        if ch in \"aeiou\":", "            count += 1", "    return count"], decoys: ["        if ch == \"aeiou\":"], start: [2, 0, "d0", 5, 1, 3, 4] },
        tip: "Strategy: print the comparison for one character to see what it really tests.",
      },
    ],
    quick: [
      { id: "list-product", from: "list-total", title: "List product", concept: "Loops & lists", note: "Same idea as List total: combine every item.", minutes: 5, language: "python",
        statement: "Write `list_product(nums)` that returns the product of every number in `nums`. An empty list gives 1.",
        starter: "def list_product(nums):\n    \n", visible_checks: [{ input: "[2, 3, 4]", expected: "24" }, { input: "[]", expected: "1" }] },
      { id: "count-digits", from: "digit-sum", title: "Count digits", concept: "Functions & recursion", note: "Same idea as Digit sum: recurse on n // 10.", minutes: 5, language: "python",
        statement: "Write a recursive `count_digits(n)` for a non-negative integer `n` (count_digits(0) is 1).",
        starter: "def count_digits(n):\n    \n", visible_checks: [{ input: "0", expected: "1" }, { input: "907", expected: "3" }] },
      { id: "qc-implies", from: "logic-equiv", title: "¬(p ∨ q) without ∨", concept: "Equivalences", note: "Same idea as ¬(p ∧ q) without ∧.", minutes: 4, done: true },
    ],
    schedule: [
      { concept: "Functions & recursion", subject: "Python", status: "due_now" },
      { concept: "Equivalences", subject: "Propositional logic", status: "due_now" },
      { concept: "Determinants", subject: "Linear Algebra 1", status: "due_now" },
      { concept: "Loops & lists", subject: "Python", status: "not_started" },
      { concept: "Natural deduction", subject: "Propositional logic", status: "worth_practising" },
      { concept: "Recursion on lists", subject: "Haskell", status: "next_in_N_days", days: 5 },
    ],
    mixed: {
      id: "mx-1", minutes: 20,
      problems: [
        { id: "m1", concept: "Functions & recursion", subject: "Python", kind: "code", statement: "Write a recursive `power(b, e)` for integers b and e ≥ 0, without using `**`.", starter: "def power(b, e):\n    \n" },
        { id: "m2", concept: "Equivalences", subject: "Propositional logic", kind: "formula", statement: "Write a formula equivalent to p → q that doesn't use →.", starter: "" },
        { id: "m3", concept: "Determinants", subject: "Linear Algebra 1", kind: "expression", statement: "det([[1, 2], [3, 4]]) = ?", starter: "" },
      ],
    },
    uploads: [
      { id: "up-1", title: "Week 5 tutorial · Q3 (count vowels)", subject: "Python", source: "PDF", status: "verified", item_id: "up-vowels", when: "Today 09:12" },
      { id: "up-0", title: "LA sheet 2 · Q1 (span in words)", subject: "Linear Algebra", source: "Text", status: "unverified", item_id: null, when: "Fri 24 Oct" },
    ],
    picks: [
      { item: "logic-proof", why: "Natural deduction is worth practising: your last quick challenge on it didn't pass." },
      { item: "la-det", why: "You needed H3 last time. Another try on your own would show it stuck." },
    ],
    suggested: { item: "hs-length", why: "Your plan includes recursion. This is the same idea in Haskell, and it's next in Inf1A." },
  },

  // ---------- Projects (demo_features_spec.md §2) ----------
  // J1/J2 are mocked ELM calls. J2 never returns dates: rules place them (project.js).
  projects: {
    caps: { J1_PER_DAY: 5, J2_PER_DAY: 3, REGEN_PER_PLAN: 2 },
    seed: [{
      id: "pj-cafe", status: "active", type: "Coursework", hours_per_week: 5, created: "2026-10-12",
      idea: "A terminal app for the campus café: take orders from a menu, keep a cart, and print a receipt.",
      learn_goal: "Structure a bigger Python program into functions",
      deadline: { course: "Project", item: "Café ordering terminal", date: "2026-11-20", time: "17:00" },
      plan: {
        goal: "Ship a working café ordering terminal with a cart and receipts by Fri 20 Nov.",
        scope_in: ["Show the menu and take orders", "Cart with add, remove and total", "Print a receipt"],
        scope_out: ["Payments", "Saving orders to a file"],
        minimum_version: "Menu, add to cart and a printed total. Removing items can wait.",
        milestones: [
          { name: "Menu and order input work", done_when: "The menu prints and a valid choice adds an item", est_hours: 4, date: "2026-10-23", done: true },
          { name: "Cart with total", done_when: "Add, remove and total pass 5 hand-written cases", est_hours: 5, date: "2026-11-02", done: false },
          { name: "Receipt and input checks", done_when: "Bad input is asked again; receipt matches the cart", est_hours: 5, date: "2026-11-11", done: false },
          { name: "Final run-through", done_when: "A friend orders 3 items without help", est_hours: 2, date: "2026-11-18", done: false },
        ],
        first_step: { text: "Write add_to_cart and test it with 3 items", minutes: 35 },
        risks: [{ risk: "Input handling takes longer than planned", mitigation: "Start the input checks in week 2, not at the end" }, { risk: "Cart bugs hide until the receipt", mitigation: "Test the total after every change" }],
        skills: ["python.functions", "python.lists", "python.loops", "python.input_validation"],
      },
      hours_planned: 16, hours_done: 6,
    }],
    genericQuestions: [
      { id: "g1", text: "What is the one feature the first version must have?", kind: "text" },
      { id: "g2", text: "Which tools or language will you use?", kind: "text" },
      { id: "g3", text: "How will you know it's done?", kind: "text" },
      { id: "g4", text: "What do you already know that will help?", kind: "text" },
    ],
  },

  // ---------- Reflection (demo_features_spec.md §3) ----------
  reflection: {
    // task text → concept (stands in for E3 concept_ids)
    conceptOf: [
      { re: "lab 3|loop|list total|inf2 lab", concept: "Loops & lists" },
      { re: "lecture 5|recursion|worked example", concept: "Recursion on lists" },
      { re: "past paper|la1|determinant|matrix", concept: "Determinants" },
      { re: "logic|proof|formula|equivalen", concept: "Equivalences" },
    ],
    // verified item bank (never generated live). answer is checked by the same deterministic tools as Practice.
    bank: [
      { id: "i1", concept: "Loops & lists", type: "predict", prompt: "What does this print?", code: "total = 0\nfor n in [3, -1, 4]:\n    if n > 0:\n        total += n\nprint(total)", answer: "7" },
      { id: "i2", concept: "Loops & lists", type: "choice", prompt: "Which loop adds every number in nums to total?", options: ["for n in nums: total += n", "for n in nums: if n > 0: total += n", "for n in range(len(nums) - 1): total += nums[n]"], answer: 0 },
      { id: "i3", concept: "Loops & lists", type: "fix", prompt: "Fix the loop body so every number is counted. Type the corrected line 3.", code: "def total(nums):\n    t = 0\n    for n in nums: if n > 0: t += n\n    return t", check: "for\\s*n\\s*in\\s*nums\\s*:\\s*t\\s*\\+=\\s*n\\s*$" },
      { id: "i4", concept: "Recursion on lists", type: "predict", prompt: "What does this print?", code: "def f(xs):\n    if not xs:\n        return 0\n    return 1 + f(xs[1:])\n\nprint(f([5, 6, 7]))", answer: "3" },
      { id: "i5", concept: "Recursion on lists", type: "choice", prompt: "def g(n): return n + g(n - 1)   What is missing?", options: ["A base case that stops the recursion", "A loop", "A return type"], answer: 0 },
      { id: "i6", concept: "Recursion on lists", type: "fix", prompt: "Complete the base case. Type the corrected line 2.", code: "myLength :: [a] -> Int\nmyLength [] = 1\nmyLength (_:xs) = 1 + myLength xs", check: "^myLength\\s*\\[\\]\\s*=\\s*0$" },
      { id: "i7", concept: "Determinants", type: "expression", prompt: "det([[2, 1], [4, 3]]) = ?", answer: 2 },
      { id: "i8", concept: "Determinants", type: "matrix", prompt: "A = [[1, 2], [3, 4]]. Enter the cofactor C₁₁.", answer: 4 },
      { id: "i9", concept: "Determinants", type: "choice", prompt: "Swapping two rows of a matrix…", options: ["changes the sign of the determinant", "leaves the determinant unchanged", "makes the determinant zero"], answer: 0 },
      { id: "i10", concept: "Equivalences", type: "truth", prompt: "Fill in p → q for each row.", rows: ["p=T, q=T", "p=T, q=F", "p=F, q=T", "p=F, q=F"], answer: ["T", "F", "T", "T"] },
      { id: "i11", concept: "Functions & recursion", type: "predict", prompt: "What does this print?", code: "def digit_sum(n):\n    if n < 10:\n        return n\n    return n % 10 + digit_sum(n // 10)\n\nprint(digit_sum(305))", answer: "8" },
      { id: "i12", concept: "Natural deduction", type: "choice", prompt: "From p → q and p, which rule gives q?", options: ["→E (modus ponens)", "∧I", "∨E"], answer: 0 },
    ],
    dueReview: ["Functions & recursion", "Equivalences", "Natural deduction"],
    depthHistory: [2, 3, 3, 2, 3],                 // last 5 reflections, oldest first
    depthTrend: [1, 1, 2, 2, 3, 2, 3, 2, 3, 3, 2, 3],  // for Progress
    calibration: { matched: 7, total: 11 },          // last 14 days
    reasonsPrompt: {
      "Harder than expected": "What would make \"{task}\" easier to start tomorrow?",
      "Didn't understand the concept": "Which part of \"{task}\" would you ask a tutor about first?",
      "Took longer than planned": "What took the most time in \"{task}\", and could you plan that part separately?",
      "Other tasks took the time": "Which task would you move if this happened again?",
      "Something unplanned came up": "What would make \"{task}\" easier to start tomorrow?",
      "Didn't get started": "What would make \"{task}\" easier to start tomorrow?",
      "Other": "What would make \"{task}\" easier to start tomorrow?",
    },
  },

  // Review queue (instructor)
  reviewQueue: [
    {
      id: "rv-1", resource_type: "skill_relations", title: "python.loops requires python.lists",
      kind: "Prerequisite edge", source_kind: "ai_proposed", status: "under_review", resource_version: 3,
      checks: [{ ok: true, label: "IDs exist in approved catalogue" }, { ok: true, label: "No cycle in requires graph" }, { ok: false, label: "No source locator for this edge" }],
      provenance: "source_kind: ai_proposed\nextraction_model: elm:<model-id>\nprompt: skill-extract-v1\nsource: CS2023 · section to confirm\nproposed: 2026-10-24T16:10Z",
      why: "Many loop exercises iterate over a list; but loops over ranges need no list knowledge.",
    },
    {
      id: "rv-2", resource_type: "activities", title: "first_low_stock (multi-skill)",
      kind: "Generated exercise", source_kind: "ai_proposed", status: "review_required", resource_version: 1,
      checks: [{ ok: true, label: "Reference passes all tests" }, { ok: true, label: "Kills 5 / 5 faulty variants" }, { ok: false, label: "Ambiguity: return value for an empty list" }],
      provenance: "generation_policy_version: generation-v1\nprompts: exercise-spec-v1, exercise-test-v1\ntargets: python.lists, python.loops, python.conditionals\nverification: review_required",
      why: "Spec says return -1 when no match; test generator listed the empty list as ambiguous.",
    },
    {
      id: "rv-3", resource_type: "gap_hypotheses", title: "boundary confusion · python.conditionals",
      kind: "Disputed gap hypothesis", source_kind: "ai_proposed", status: "pending", resource_version: 2,
      checks: [{ ok: true, label: "Evidence from valid tasks only" }, { ok: false, label: "Below the repeated-evidence threshold" }],
      provenance: "policy_version: gap-v1\nprompt: gap-hypothesis-v1\nstatus: suspected\nevidence: ev-41c2, ev-57aa\nstudent challenge: requested new diagnostic",
      why: "Student asked to demonstrate competence with a new diagnostic.",
    },
    {
      id: "rv-4", resource_type: "projects", title: "Campus Café Terminal · M6 change-request rubric",
      kind: "Project rubric", source_kind: "ai_proposed", status: "pending", resource_version: 1,
      checks: [{ ok: true, label: "Each criterion references observable evidence" }, { ok: true, label: "Milestone graph is acyclic" }, { ok: true, label: "Uses only taught skills" }],
      provenance: "prompt: project-tests-v1 (rubric)\nmilestone: M6 change request: cancellation\nfamily: café terminal (first release)\nhuman_review_status: pending",
      why: "Subjective design rubric in the first release of a new project family requires instructor review.",
    },
  ],
};
