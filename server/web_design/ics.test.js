// node server/web_design/ics.test.js [path/to/real.ics]
// Synthetic checks always run; with a path, also prints the busy slots of 30 Oct 2026 from that file.
const assert = require("assert");
const fs = require("fs");
const { parseIcs } = require("./ics.js");

const ev = (lines) => `BEGIN:VEVENT\r\n${lines.join("\r\n")}\r\nEND:VEVENT`;
const cal = (...evs) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${evs.join("\r\n")}\r\nEND:VCALENDAR\r\n`;

const r = parseIcs(cal(
  // Outlook style: TZID, folded UID line, localised title, busy status
  ev(["UID:abc", " def", "SUMMARY:Занят", "DTSTART;TZID=GMT Standard Time:20261030T090000", "DTEND;TZID=GMT Standard Time:20261030T105000", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY"]),
  ev(["SUMMARY:Под вопросом", "DTSTART;TZID=GMT Standard Time:20261030T141000", "DTEND;TZID=GMT Standard Time:20261030T150000", "X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE"]),
  ev(["SUMMARY:free", "DTSTART;TZID=X:20261030T160000", "DTEND;TZID=X:20261030T170000", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"]),
  ev(["SUMMARY:gone", "STATUS:CANCELLED", "DTSTART;TZID=X:20261030T180000", "DTEND;TZID=X:20261030T190000"]),
  ev(["SUMMARY:transparent", "TRANSP:TRANSPARENT", "DTSTART;TZID=X:20261030T190000", "DTEND;TZID=X:20261030T200000"]),
  // all day
  ev(["DTSTART;VALUE=DATE:20261102", "DTEND;VALUE=DATE:20261103"]),
  // crosses midnight
  ev(["DTSTART;TZID=X:20261104T230000", "DTEND;TZID=X:20261105T010000"]),
  // weekly on Mon+Wed, 4 times, one exception
  ev(["DTSTART;TZID=X:20261109T100000", "DTEND;TZID=X:20261109T110000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", "EXDATE;TZID=X:20261111T100000"]),
  // monthly: not expanded, reported
  ev(["DTSTART;TZID=X:20261201T100000", "DTEND;TZID=X:20261201T110000", "RRULE:FREQ=MONTHLY"]),
));
const on = (d) => r.events.filter((e) => e.date === d);

assert.deepStrictEqual(on("2026-10-30"), [
  { date: "2026-10-30", start: "09:00", end: "10:50", status: "busy" },
  { date: "2026-10-30", start: "14:10", end: "15:00", status: "tentative" },
]);
assert.deepStrictEqual(on("2026-11-02"), [{ date: "2026-11-02", start: "00:00", end: "24:00", status: "busy" }]);
assert.deepStrictEqual(on("2026-11-04").map((e) => e.start + "-" + e.end), ["23:00-24:00"]);
assert.deepStrictEqual(on("2026-11-05").map((e) => e.start + "-" + e.end), ["00:00-01:00"]);
assert.deepStrictEqual(r.events.filter((e) => e.start === "10:00" && e.date < "2026-12-01").map((e) => e.date), ["2026-11-09", "2026-11-16", "2026-11-18"]);
assert.strictEqual(r.unsupported, 1);
// UTC times convert to the local clock (checked against the machine's own zone)
const z = parseIcs(cal(ev(["DTSTART:20261030T120000Z", "DTEND:20261030T130000Z"]))).events[0];
const local = new Date(Date.UTC(2026, 9, 30, 12, 0));
assert.strictEqual(z.start, `${String(local.getHours()).padStart(2, "0")}:00`);
console.log("ics.js: all checks passed");

if (process.argv[2]) {
  const real = parseIcs(fs.readFileSync(process.argv[2], "utf8"));
  console.log(`${real.events.length} slots, ${real.first} → ${real.last}, unsupported repeats: ${real.unsupported}`);
  console.log("30 Oct:", real.events.filter((e) => e.date === "2026-10-30").map((e) => `${e.start}–${e.end} ${e.status}`).join(", "));
}
