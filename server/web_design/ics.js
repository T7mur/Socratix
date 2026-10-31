// Socratix — .ics parser: calendar file → dated busy slots. Pure, runs in the browser and in node (ics.test.js).
// Reads busy status (X-MICROSOFT-CDO-BUSYSTATUS / TRANSP / STATUS), never titles, so the file's language doesn't matter.
(function (root) {
  "use strict";
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, "0");
  const isoUTC = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => isoUTC(new Date(Date.parse(s + "T00:00:00Z") + n * DAY));
  const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const MAX_WEEKS = 26;

  // "20261030T090000" (+TZID → wall clock), "...Z" (UTC → local), "20261030" (all day)
  function when(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { date: `${m[1]}-${m[2]}-${m[3]}`, min: null };
    if (m[7]) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, min: d.getHours() * 60 + d.getMinutes() };
    }
    // shortcut: TZID times are read as the student's wall clock (right for UK students); add tz conversion for other zones
    return { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] };
  }
  const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

  // one occurrence → per-date slots (splits events that cross midnight; all-day = whole day)
  function slotsOf(s, e, status) {
    const out = [];
    if (s.min == null) { // all day: [start date, end date)
      const end = e ? e.date : addDays(s.date, 1);
      for (let d = s.date; d < end; d = addDays(d, 1)) out.push({ date: d, start: "00:00", end: "24:00", status });
      return out;
    }
    if (!e || (e.date === s.date && e.min <= s.min)) return out;
    for (let d = s.date; d <= e.date; d = addDays(d, 1)) {
      const a = d === s.date ? s.min : 0, b = d === e.date ? e.min : 1440;
      if (b > a) out.push({ date: d, start: hm(a), end: hm(b), status });
    }
    return out;
  }

  function parseIcs(text) {
    const lines = String(text || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const events = []; let ev = null, unsupported = 0;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { ev = { exdates: [] }; continue; }
      if (line === "END:VEVENT") { if (ev) emit(ev); ev = null; continue; }
      if (!ev) continue;
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (!m) continue;
      const [, name, params, value] = m;
      if (name === "DTSTART") ev.start = when(value, params);
      else if (name === "DTEND") ev.end = when(value, params);
      else if (name === "X-MICROSOFT-CDO-BUSYSTATUS") ev.busy = value.trim().toUpperCase();
      else if (name === "TRANSP") ev.transp = value.trim().toUpperCase();
      else if (name === "STATUS") ev.status = value.trim().toUpperCase();
      else if (name === "RRULE") ev.rrule = value.trim();
      else if (name === "EXDATE") value.split(",").forEach((v) => { const w = when(v, params); if (w) ev.exdates.push(w.date); });
    }

    function emit(e) {
      if (!e.start || e.status === "CANCELLED") return;
      if (e.busy ? e.busy === "FREE" || e.busy === "WORKINGELSEWHERE" : e.transp === "TRANSPARENT") return;
      const status = e.busy === "TENTATIVE" || e.status === "TENTATIVE" ? "tentative" : "busy";
      const spanDays = e.end ? Math.round((Date.parse(e.end.date) - Date.parse(e.start.date)) / DAY) : 0;
      const at = (date) => slotsOf({ date, min: e.start.min }, e.end ? { date: addDays(date, spanDays), min: e.end.min } : null, status);
      const rule = e.rrule ? Object.fromEntries(e.rrule.split(";").map((p) => p.split("="))) : null;
      if (!rule) { events.push(...at(e.start.date)); return; }
      if (rule.FREQ !== "WEEKLY") { unsupported++; events.push(...at(e.start.date)); return; } // shortcut: only weekly repeats are expanded; add DAILY/MONTHLY if real exports need them
      const interval = +(rule.INTERVAL || 1), days = rule.BYDAY ? rule.BYDAY.split(",").map((d) => BYDAY[d.slice(-2)]) : [new Date(e.start.date + "T00:00:00Z").getUTCDay()];
      const until = rule.UNTIL ? when(rule.UNTIL, "").date : null, count = rule.COUNT ? +rule.COUNT : Infinity;
      const monday0 = addDays(e.start.date, -((new Date(e.start.date + "T00:00:00Z").getUTCDay() + 6) % 7));
      let n = 0;
      for (let k = 0; k < MAX_WEEKS * 7 && n < count; k++) {
        const d = addDays(e.start.date, k);
        if (until && d > until) break;
        const week = Math.floor((Date.parse(d) - Date.parse(monday0)) / (7 * DAY));
        if (week % interval || !days.includes(new Date(d + "T00:00:00Z").getUTCDay())) continue;
        n++;
        if (!e.exdates.includes(d)) events.push(...at(d));
      }
    }

    events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return { events, unsupported, first: events.length ? events[0].date : null, last: events.length ? events[events.length - 1].date : null };
  }

  const api = { parseIcs };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SXics = api;
})(this);
