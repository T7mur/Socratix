// Socratix design prototype — SAMPLE DATA ONLY.
// Shapes follow docs/shared_contracts.md v1.0 field names. Values are illustrative and uncalibrated.
// Nothing here is a private GradingArtifact: no reference solutions, no hidden tests.

window.SAMPLE = {
  student: { name: "Sam Rivera", initials: "SR", course: "Informatics 1 — Python" },
  instructor: { name: "Dr. A. Moreno", initials: "AM" },

  // ConfirmedPlan (+ original goal text)
  plan: {
    plan_id: "9d1c…e2",
    text: "I want to make a terminal café ordering app next week",
    time_horizon: "week",
    confirmed_skill_ids: ["python.loops", "python.conditionals"],
    confirmed_at: "2026-10-23T12:00:00Z",
    active: true,
  },

  // PlanTagProposal for the plan screen
  planProposal: {
    candidate_tags: [
      { skill_id: "python.loops", confidence_label: "high", provenance: "model_suggested", reason: "Repeated interaction", quote: "ordering app" },
      { skill_id: "python.conditionals", confidence_label: "medium", provenance: "model_suggested", reason: "Menu choices branch on the user's selection", quote: "ordering" },
      { skill_id: "python.input_validation", confidence_label: "medium", provenance: "model_suggested", reason: "A terminal app reads typed input that may be malformed", quote: "terminal" },
      { skill_id: "python.lists", confidence_label: "low", provenance: "model_suggested", reason: "Plausible prerequisite: an order is a collection of items", quote: "café ordering" },
    ],
    unmapped_phrases: ["terminal café ordering app"],
    requires_student_confirmation: true,
  },

  // SelectorResult
  selection: {
    selection_id: "5b7a…0f",
    policy_version: "selector-v1",
    weights: { planning: 0.40, gap: 0.35, retention: 0.25 },
    ranked_targets: [
      {
        skill_ids: ["python.loops", "python.conditionals"],
        activity_type: "multi_skill_exercise",
        priority_score: 0.72,
        features: { P: 1.0, G: 0.6, R: 0.44 }, // 0.40·1.0 + 0.35·0.6 + 0.25·0.44 = 0.72
        reasons: ["planning match", "recent transfer difficulty"],
        explanation: "Your confirmed plan names loops; your last conditionals transfer attempt failed a boundary case.",
        override_allowed: true,
      },
      {
        skill_ids: ["python.input_validation"],
        activity_type: "single_skill_exercise",
        priority_score: 0.495,
        features: { P: 0.2, G: 0.9, R: 0.4 },
        reasons: ["suspected gap", "related to plan"],
        override_allowed: true,
      },
      {
        skill_ids: ["python.lists", "python.loops", "python.conditionals"],
        activity_type: "project",
        priority_score: 0.405,
        features: { P: 0.5, G: 0.3, R: 0.4 },
        reasons: ["project goal", "integration practice"],
        override_allowed: true,
      },
    ],
  },

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

  recent: [
    { title: "List total", activity: "single_skill_exercise", stage: "transfer", skills: ["python.loops", "python.lists"], result: "In progress", status: "neutral", help: "None", independent: null, when: "Today 10:42", href: "#/practice/list-total" },
    { title: "Campus Café Terminal · M3", activity: "project", stage: "transfer", skills: ["python.input_validation", "python.loops"], result: "In progress", status: "neutral", help: "None", independent: null, when: "Yesterday", href: "#/projects/cafe-terminal" },
    { title: "Loop recall check", activity: "single_skill_exercise", stage: "recall", skills: ["python.loops"], result: "Rubric met", status: "pass", help: "None", independent: true, when: "Thu 23 Oct", href: "#/skills" },
    { title: "Predict the output: comparisons", activity: "single_skill_exercise", stage: "understanding", skills: ["python.comparisons"], result: "Rubric met", status: "pass", help: "Hint level 1", independent: false, when: "Wed 22 Oct", href: "#/skills" },
  ],

  // ---------- Practice (practice_spec.md v1 + practice_ui_structure.md v1.0) ----------
  // Student-safe fields only: id, type, concept_ids, statement, starter, visible_checks, hints{H0,H1,H3}, last_step, source.
  // Solutions, hidden-check generators and rubrics are server-only (see SERVER in practice.js, simulated).
  practice: {
    config: { STUCK_UNLOCK_MIN: 5, GLOW_SAME_FAILURE: 3, GLOW_MIN: 10, H4_HIGHLIGHT_AFTER: 2, HIDDEN_CHECKS_PER_HOUR: 10, SPACING_DAYS: [2, 7, 21], MIXED_MIN_CONCEPTS: 2, MIXED_MAX_ITEMS: 3, UPLOADS_PER_DAY: 3, N_SESSIONS: 3 },
    planTask: { id: "t-loops", title: "Practise loops & lists (30 min)" },
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

  // Student-safe ProjectSpec
  project: {
    project_id: "cafe-terminal", project_version: 1,
    title: "Campus Café Terminal",
    target_skill_ids: ["python.loops", "python.conditionals", "python.functions", "python.input_validation"],
    excluded: ["dictionaries", "classes", "files", "databases", "networking"],
    engineering_outcome_ids: ["engineering.requirements.v1", "engineering.testing.v1"],
    student_brief: "Create a menu and checkout system for the campus café that runs in the terminal, without classes. Prices are integer pence.",
    milestones: [
      { milestone_id: "M1", title: "Requirements and design", depends_on: [], assessment_method: "rubric", status: "done", detail: "Your design plan and edge cases", review: "approved" },
      { milestone_id: "M2", title: "Menu and command loop", depends_on: ["M1"], assessment_method: "tests", status: "done", detail: "Menu output and termination · 6 / 6 tests" },
      { milestone_id: "M3", title: "Input validation", depends_on: ["M2"], assessment_method: "tests", status: "active", detail: "Malformed selections rejected without crashing" },
      { milestone_id: "M4", title: "Stock and cart updates", depends_on: ["M3"], assessment_method: "tests", status: "locked", detail: "Stock never goes negative after any sequence" },
      { milestone_id: "M5", title: "Checkout", depends_on: ["M4"], assessment_method: "tests", status: "locked", detail: "Correct totals, clear completion state" },
      { milestone_id: "M6", title: "Change request: cancellation", depends_on: ["M5"], assessment_method: "mixed", status: "locked", detail: "Cancel restores pending state; old behaviour remains", change_request: true },
    ],
    requirements: [
      { requirement_id: "PR1", description: "Show the menu with item numbers and prices in pence", milestone: "M2" },
      { requirement_id: "PR2", description: "Repeat until the customer types checkout or quit", milestone: "M2" },
      { requirement_id: "PR3", description: "Reject non-numeric or out-of-range selections and ask again", milestone: "M3" },
      { requirement_id: "PR4", description: "Reject quantities below 1 without changing the cart", milestone: "M3" },
      { requirement_id: "PR5", description: "Never let stock go negative", milestone: "M4" },
    ],
    cli_protocol: "> 2 x1\nAdded 1 × Flat white (310p). Cart: 310p\n> 9\nNo item 9. Choose 1–5.\n> checkout",
  },

  projectCode:
`MENU = ["Espresso", "Flat white", "Tea", "Flapjack", "Soup"]
PRICES = [220, 310, 180, 250, 420]

def read_choice(text):
    parts = text.split()
    item = int(parts[0])          # crashes on "abc"
    qty = int(parts[1][1:]) if len(parts) > 1 else 1
    if item < 1 or item > len(MENU):
        return None
    return item - 1, qty
`,

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
