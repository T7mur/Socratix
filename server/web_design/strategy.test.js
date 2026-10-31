// node server/web_design/strategy.test.js — checks the v6 milestone rules on study time.
const assert = require("assert");
const S = require("./strategy.js");
const { addDays, diffDays } = S;

const today = "2026-11-02"; // Monday
// day window 09:00–21:00 with a 10-min gap between lectures (not usable) and one lecture block
const quiet = () => [[9 * 60, 21 * 60]];                                   // 12 h free
const busy = () => [[9 * 60, 9 * 60 + 10], [17 * 60, 19 * 60]];            // 10 min (ignored) + 2 h
const cap = (gapsOf, cfg) => S.capacity({ gapsOf, today, cfg });

// capacity: gaps < 25 min ignored; daily cap; weekly cap spread by free time
{
  const C = cap(busy);
  assert.strictEqual(Math.round(C("2026-11-02")), 102); // 120 × 0.85, the 10-min gap is not study time
  const Cq = cap(quiet); // 7 × 240 = 1680 > 20 h → weekly cap 1200 min spread evenly
  assert.strictEqual(Math.round(S.studyMin(Cq, "2026-11-02", "2026-11-08")), 1200);
  const half = S.capacity({ gapsOf: quiet, today: "2026-11-05" }); // Thu–Sun: 4/7 of 20 h
  assert.strictEqual(Math.round(S.studyMin(half, "2026-11-05", "2026-11-08")), Math.round(1200 * 4 / 7));
  const rest = S.capacity({ gapsOf: quiet, today, isRest: (d) => d === "2026-11-03" });
  assert.strictEqual(rest("2026-11-03"), 0);
}

// a busier first week moves stage dates later
{
  const exam = "2026-11-30";
  const topics = [{ name: "Matrices", confidence: "low" }, { name: "Vectors", confidence: "ok" }, { name: "Eigen", confidence: "high" }];
  const even = S.examPlan({ today, examDate: exam, topics, C: cap(quiet), gapsOf: quiet });
  const firstWeekBusy = (d) => (d <= "2026-11-15" ? busy() : quiet());
  const later = S.examPlan({ today, examDate: exam, topics, C: cap(firstWeekBusy), gapsOf: firstWeekBusy });
  const cover = (p) => p.milestones.find((m) => m.stage === "cover").date;
  assert(cover(later) > cover(even), `busy weeks should push Cover later (${cover(even)} → ${cover(later)})`);

  const ms = even.milestones, by = (s) => ms.find((m) => m.stage === s);
  assert.deepStrictEqual(ms.map((m) => m.stage), ["map", "cover", "mixed", "paper", "revisit", "final"]);
  assert(diffDays(by("cover").date, by("revisit").date) >= 2, "Revisit ≥ 2 days after Cover");
  assert.strictEqual(by("final").date, addDays(exam, -2));
  assert.strictEqual(by("cover").hours, 3.5); // Low 2 + OK 1 + High 0.5
  assert(ms.every((m, k) => k === 0 || m.date >= ms[k - 1].date), "sorted by date");
  // paper needs one contiguous block ≥ its length: none on busy days → moved to a quiet day or flagged
  const noLong = () => [[9 * 60, 10 * 60 + 30], [11 * 60, 12 * 60 + 30]];
  const p = S.examPlan({ today, examDate: exam, topics, paperMin: 120, C: cap(noLong), gapsOf: noLong });
  assert(p.notes.some((n) => n.code === "no_paper_slot"));
}

// compressed exam (< 7 days)
{
  const p = S.examPlan({ today, examDate: "2026-11-07", topics: [{ name: "A", confidence: "low" }], C: cap(quiet), gapsOf: quiet });
  assert(p.compressed && p.optional);
  assert.deepStrictEqual(p.milestones.map((m) => m.stage), ["map", "cover", "paper", "revisit", "final"]);
}

// assignment: hours, first milestone within 2 days, Ready = D − 2
{
  const due = "2026-11-23";
  const a = S.assignmentPlan({ today, due, subtype: "code", parts: [{ name: "Parser", size: "m" }, { name: "Report", size: "s" }], C: cap(quiet) });
  assert.strictEqual(a.totalHours, 5.3); // P = 4 h → T = 4 / 0.75
  assert(diffDays(today, a.milestones[0].date) <= 2);
  assert.strictEqual(a.milestones[a.milestones.length - 1].date, addDays(due, -2));
  assert(a.milestones.every((m, k) => k === 0 || m.date >= a.milestones[k - 1].date));
  assert.strictEqual(a.milestones.find((m) => m.name === "Build: Parser").done, "Parser passes its tests");
}

// warnings: buffer, cramming vs weekly study hours, at risk (earliest due first)
{
  const C = cap(quiet); // 20 h per week
  const w = S.warnings({ today, C, deadlines: [
    { id: "cw", due: "2026-11-06", milestones: [{ id: "m1", name: "Final draft", date: "2026-11-05", hours: 26 }] },
  ] });
  assert.strictEqual(w.buffer.length, 1, "last stage 1 day before the deadline");
  assert.strictEqual(w.cramming.length, 1);
  assert.deepStrictEqual([w.cramming[0].planned, w.cramming[0].study], [26, 20]);
  assert.strictEqual(w.atRisk[0].id, "m1");
  const ok = S.warnings({ today, C, deadlines: [{ id: "x", due: "2026-11-20", milestones: [{ id: "a", name: "A", date: "2026-11-10", hours: 6, doneHours: 1 }] }] });
  assert.deepStrictEqual([ok.buffer.length, ok.cramming.length, ok.atRisk.length], [0, 0, 0]);
  // EDD: an earlier milestone uses the time first
  const edd = S.warnings({ today, C, deadlines: [
    { id: "e", due: "2026-11-10", milestones: [{ id: "e1", name: "Past paper 1", date: "2026-11-03", hours: 5 }] },
    { id: "f", due: "2026-11-10", milestones: [{ id: "f1", name: "Lab", date: "2026-11-03", hours: 2 }] },
  ] });
  assert.deepStrictEqual(edd.atRisk.map((x) => x.id), ["f1"]); // 2 days ≈ 5.7 h: Past paper fits, Lab does not
}
console.log("strategy.js: all checks passed");
