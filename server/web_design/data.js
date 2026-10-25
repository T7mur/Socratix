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
    { title: "Stock classifier", activity: "single_skill_exercise", stage: "transfer", skills: ["python.conditionals"], result: "3 / 4 tests", status: "fail", help: "Hint level 2", independent: false, when: "Today 10:42", href: "#/learn/stock-status" },
    { title: "Campus Café Terminal · M3", activity: "project", stage: "transfer", skills: ["python.input_validation", "python.loops"], result: "In progress", status: "neutral", help: "None", independent: null, when: "Yesterday", href: "#/projects/cafe-terminal" },
    { title: "Loop recall check", activity: "single_skill_exercise", stage: "recall", skills: ["python.loops"], result: "Rubric met", status: "pass", help: "None", independent: true, when: "Thu 23 Oct", href: "#/skills" },
    { title: "Predict the output: comparisons", activity: "single_skill_exercise", stage: "understanding", skills: ["python.comparisons"], result: "Rubric met", status: "pass", help: "Hint level 1", independent: false, when: "Wed 22 Oct", href: "#/skills" },
  ],

  // Student-safe TaskSpec
  task: {
    task_id: "stock-status", task_version: 1,
    activity_type: "single_skill_exercise", title: "Stock classifier",
    target_skill_ids: ["python.conditionals"], outcome_ids: ["python.conditionals.transfer.v1"],
    assessment_stage: "transfer", language: "python",
    student_brief: "A café till needs to label each item's stock level so staff know what to reorder. Classify stock quantities using the specified boundaries.",
    function_contract: { name: "stock_status", parameters: [{ name: "quantity", type: "int" }], returns: "str" },
    requirements: [
      { requirement_id: "R1", description: "0 returns \"sold_out\"" },
      { requirement_id: "R2", description: "1–3 return \"low\"" },
      { requirement_id: "R3", description: "4 or more return \"available\"" },
    ],
    input_constraints: ["quantity is a nonnegative integer"],
    public_examples: [{ args: [3], expected: "low" }, { args: [0], expected: "sold_out" }],
    explanation_questions: ["Why is the result for 3 different from 4?"],
    verification_status: "verified", human_review_status: "not_required",
    stages: [
      { stage: "recall", label: "Recall", detail: "Boolean operators", state: "done" },
      { stage: "understanding", label: "Understanding", detail: "Predict the branch", state: "done" },
      { stage: "transfer", label: "Transfer", detail: "Write stock_status", state: "current" },
    ],
  },

  starterCode:
`def stock_status(quantity):
    if quantity == 0:
        return "sold_out"
    elif quantity < 3:
        return "low"
    else:
        return "available"
`,

  // EvaluationResult for attempt 1 (unaided)
  evaluation: {
    attempt_id: "a-3f9e", grading_validity: "valid",
    test_summary: { passed: 3, total: 4 },
    tests: [
      { test_id: "T1", requirement_id: "R1", ok: true, label: "public example" },
      { test_id: "T2", requirement_id: "R2", ok: true, label: "public example" },
      { test_id: "T3", requirement_id: "R3", ok: true, label: "boundary" },
      { test_id: "T4", requirement_id: "R2", ok: false, input_repr: "3", expected_repr: "\"low\"", actual_repr: "\"available\"" },
    ],
  },

  // HintResponse sequence grounded on failure T4
  hints: [
    { level: 1, title: "Where is the error?", hint_text: "Which branch of your function decides between \"low\" and \"available\"? Look at what happens for the failing input 3.", student_action: "Point to the branch" },
    { level: 2, title: "What should this code do?", hint_text: "What should this condition return when quantity is 3, and why?", student_action: "Explain the intended branch" },
    { level: 3, title: "What if you changed it?", hint_text: "What changes for quantity 3 if `<` becomes `<=`? Predict the results for 2, 3 and 4 before editing.", student_action: "Predict, then edit and resubmit" },
    { level: 4, title: "Answer + explanation", hint_text: "The boundary is inclusive: R2 says 1–3 are \"low\", so the condition must include 3. `quantity < 3` stops at 2. Use `quantity <= 3` (or `< 4`). Next, try a new unaided task: label exam marks as fail / pass / distinction using inclusive bounds.", student_action: "Apply the repair; a new transfer task is scheduled" },
  ],

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
