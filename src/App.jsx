import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Heart, Plus, Trash2, Upload, X, RefreshCw, BookOpen, RotateCcw, Cake, BarChart2, Bell, Star } from "lucide-react";

const STORAGE_KEY = "intercede-people-v2";
// Admin password and branding set during first-run setup (stored in localStorage)
const SETUP_KEY = "letspray-setup";

const TAP_KEY = "intercede-tap-ts";
const TAP_TTL = 24 * 60 * 60 * 1000;

function shouldShowTap() {
  try {
    const raw = localStorage.getItem(TAP_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) > TAP_TTL;
  } catch (_e) { return true; }
}

function getBdayDismissKey(personId) {
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  return `intercede-bday-dismissed-${personId}-${today}`;
}
function isBdayDismissed(personId) {
  try { return !!localStorage.getItem(getBdayDismissKey(personId)); } catch (_e) { return false; }
}
function dismissBday(personId) {
  try { localStorage.setItem(getBdayDismissKey(personId), "1"); } catch (_e) {}
}

function recordTapShown() {
  try { localStorage.setItem(TAP_KEY, String(Date.now())); } catch (_e) {}
}
const ADMIN_KEY = "intercede-admin-authed";
const ADMIN_TTL = 86400000;

function isAdminAuthed() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw);
    return Date.now() - ts < ADMIN_TTL;
  } catch (_e) { return false; }
}

function setAdminAuthed() {
  localStorage.setItem(ADMIN_KEY, JSON.stringify({ ts: Date.now() }));
}
async function apiLoad() {
  const res = await fetch("/api/data");
  if (!res.ok) throw new Error("load failed");
  const data = await res.json();
  // Treat an empty array from KV as suspicious — never trust it over local state
  if (!Array.isArray(data)) throw new Error("bad data");
  return data;
}

async function apiSave(people, force = false) {
  if (!people || people.length === 0) return;
  await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(force ? { data: people, force: true } : people),
  });
}


async function apiLoadHistory() {
  const res = await fetch("/api/history");
  if (!res.ok) return [];
  return await res.json();
}

async function apiSaveHistory(history) {
  await fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(history),
  });
}

function getWeekLabel(weekStartTs) {
  // Show the Monday date of that week clearly
  const d = new Date(weekStartTs);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}


function photoRotation(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 13) - 6);
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getWeekStartET() {
  // Returns UTC timestamp of most recent Monday midnight Eastern Time
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etNow = new Date(etStr);
  const day = etNow.getDay(); // 0=Sun
  const daysFromMon = day === 0 ? 6 : day - 1;
  const monET = new Date(etNow);
  monET.setDate(etNow.getDate() - daysFromMon);
  monET.setHours(0, 0, 0, 0);
  // Offset between real UTC and the "fake local" ET date object
  const utcOffset = now.getTime() - etNow.getTime();
  return monET.getTime() + utcOffset;
}


function getWeekDateStringET() {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etNow = new Date(etStr);
  const day = etNow.getDay();
  const daysFromMon = day === 0 ? 6 : day - 1;
  const monET = new Date(etNow);
  monET.setDate(etNow.getDate() - daysFromMon);
  return `${monET.getMonth()+1}/${monET.getDate()}/${monET.getFullYear()}`;
}

function getPrevWeekDateStringET() {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etNow = new Date(etStr);
  const day = etNow.getDay();
  const daysFromMon = day === 0 ? 6 : day - 1;
  const monET = new Date(etNow);
  monET.setDate(etNow.getDate() - daysFromMon - 7);
  return `${monET.getMonth()+1}/${monET.getDate()}/${monET.getFullYear()}`;
}

function withinWeek(ts) {
  return ts && ts >= getWeekStartET();
}

function timeAgo(ts) {
  if (!ts) return null;
  // Compare calendar dates (midnight-to-midnight) in Eastern time
  const toETMidnight = t => {
    const etStr = new Date(t).toLocaleDateString("en-US", { timeZone: "America/New_York" });
    return new Date(etStr).getTime();
  };
  const todayMidnight = toETMidnight(Date.now());
  const tsMidnight = toETMidnight(ts);
  const days = Math.round((todayMidnight - tsMidnight) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ordinal(n) {
  const num = Number(n);
  const s = ["th","st","nd","rd"], v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Resolves a MM-DD birthday to a real Date in the given year.
// Feb 29 on a non-leap year falls back to Feb 28.
function birthdayInYear(month, day, year) {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const resolvedDay = (month === 2 && day === 29 && !isLeap) ? 28 : day;
  return new Date(year, month - 1, resolvedDay);
}

function getBirthdayStatus(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const [month, day] = birthday.split("-").map(Number);
  if (!month || !day) return null;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let bday = birthdayInYear(month, day, today.getFullYear());
  if (bday < todayMidnight) bday = birthdayInYear(month, day, today.getFullYear() + 1);
  const diff = Math.round((bday - todayMidnight) / 86400000);
  if (diff === 0) return { label: "🎂 Birthday today!", urgent: true, today: true };
  if (diff === 1) return { label: "🎂 Birthday tomorrow!", urgent: true, today: false };
  if (diff <= 7) return { label: `🎂 Birthday in ${diff} days`, urgent: false };
  return null;
}

function formatBirthday(birthday) {
  if (!birthday) return "";
  const [month, day] = birthday.split("-").map(Number);
  if (!month || !day) return birthday;
  return new Date(2000, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function getUpcomingBirthdays(people) {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const results = [];
  for (const p of people) {
    if (!p.birthday) continue;
    const [month, day] = p.birthday.split("-").map(Number);
    if (!month || !day) continue;
    let bday = birthdayInYear(month, day, today.getFullYear());
    if (bday < todayMidnight) bday = birthdayInYear(month, day, today.getFullYear() + 1);
    const diff = Math.round((bday - todayMidnight) / 86400000);
    if (diff <= 7) results.push({ person: p, diff, date: bday });
  }
  return results.sort((a, b) => a.diff - b.diff);
}

// ── CSV parsing helpers ────────────────────────────────────

// Parse a single CSV line, respecting quoted fields
function splitCSVLine(line) {
  const cells = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  cells.push(cur.trim());
  return cells.map(c => c.replace(/^["']|["']$/g, "").trim());
}

function titleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// If "Smith, John" → "John Smith"; also title-cases
function normalizeName(raw) {
  const trimmed = raw.trim();
  const commaFlip = trimmed.match(/^([^,]+),\s*(.+)$/);
  if (commaFlip) return titleCase(`${commaFlip[2].trim()} ${commaFlip[1].trim()}`);
  return titleCase(trimmed);
}

// Parse a birthday string into MM-DD format
function parseBirthdayStr(raw) {
  if (!raw) return "";
  const cleaned = raw.trim();
  // YYYY-MM-DD (ISO format - e.g. 2009-01-15)
  const iso = cleaned.match(/^\d{4}[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (iso) return `${iso[1].padStart(2, "0")}-${iso[2].padStart(2, "0")}`;
  // MM/DD or MM-DD or M/D (e.g. 03/15, 3-15)
  const numeric = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
  if (numeric) return `${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
  // Month name: "March 15", "15 March", "March 15, 2005"
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const lower = cleaned.toLowerCase();
  for (let mi = 0; mi < months.length; mi++) {
    if (lower.includes(months[mi])) {
      const dayMatch = cleaned.match(/\b(\d{1,2})\b/);
      if (dayMatch) return `${String(mi + 1).padStart(2, "0")}-${dayMatch[1].padStart(2, "0")}`;
    }
  }
  return "";
}

function parseCSV(text) {
  const rawLines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!rawLines.length) return [];

  const firstCells = splitCSVLine(rawLines[0]);
  const firstNorm = firstCells.map(c => c.toLowerCase().replace(/[^a-z]/g, ""));

  // Detect header row by looking for name/date keywords
  const nameKws = ["name","first","last","fname","lname","given","surname","family","student","person","contact"];
  const hasHeader = firstNorm.some(c => nameKws.some(kw => c.includes(kw)));

  const headers = hasHeader ? firstNorm : [];
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;

  // Locate name columns
  const firstNameIdx = headers.findIndex(h =>
    h === "firstname" || h === "fname" || h === "givenname" || h === "given" ||
    h === "first" || h.startsWith("first")
  );
  const lastNameIdx = headers.findIndex(h =>
    h === "lastname" || h === "lname" || h === "surname" || h === "familyname" ||
    h === "last" || h.startsWith("last") || h === "family"
  );
  const fullNameIdx = (firstNameIdx < 0 && lastNameIdx < 0)
    ? headers.findIndex(h => h.includes("name") || h.includes("student") || h.includes("person") || h.includes("contact"))
    : -1;

  // Locate birthday column
  const bdayIdx = headers.findIndex(h =>
    h.includes("birth") || h.includes("bday") || h.includes("dob") || h === "bd" || h === "birthday"
  );

  // For headerless files, sniff which column looks like a date
  const fallbackBdayIdx = (() => {
    if (hasHeader || !dataLines.length) return -1;
    const sample = splitCSVLine(dataLines[0]);
    for (let i = 1; i < sample.length; i++) {
      if (parseBirthdayStr(sample[i])) return i;
    }
    return -1;
  })();

  return dataLines.map(line => {
    const cells = splitCSVLine(line);
    if (!cells.length || !cells[0]) return null;

    let name = "";
    if (hasHeader) {
      if (firstNameIdx >= 0 && lastNameIdx >= 0) {
        // Separate first + last columns → join as "First Last"
        const first = (cells[firstNameIdx] || "").trim();
        const last = (cells[lastNameIdx] || "").trim();
        name = titleCase(`${first} ${last}`.trim());
      } else if (firstNameIdx >= 0) {
        name = titleCase((cells[firstNameIdx] || "").trim());
      } else if (lastNameIdx >= 0) {
        name = titleCase((cells[lastNameIdx] || "").trim());
      } else if (fullNameIdx >= 0) {
        name = normalizeName(cells[fullNameIdx] || "");
      } else {
        // No recognized column — fall back to first cell
        name = normalizeName(cells[0] || "");
      }
    } else {
      name = normalizeName(cells[0] || "");
    }

    if (!name || name.length < 2) return null;

    const bi = hasHeader ? bdayIdx : fallbackBdayIdx;
    const birthday = bi >= 0 && cells[bi] ? parseBirthdayStr(cells[bi]) : "";

    return { name, birthday };
  }).filter(Boolean);
}

// ── Component ──────────────────────────────────────────────

function Confetti() {
  const pieces = Array.from({ length: 38 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2.5,
    duration: 2.8 + Math.random() * 2,
    size: 7 + Math.random() * 8,
    color: ["#6b9e78","#8eba95","#5b8fa8","#7a8082","#4a7a60","#8eba95","#5b8fa8"][i % 7],
    rotate: Math.random() * 360,
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:50, overflow:"hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute",
          left: `${p.x}%`,
          top: -20,
          width: p.size,
          height: p.size * 0.55,
          background: p.color,
          borderRadius: 2,
          transform: `rotate(${p.rotate}deg)`,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          opacity: 0,
        }} />
      ))}
    </div>
  );
}

// Isolated ticker — its own state so parent never rerenders on each tick
function CountdownTicker({ targetTs }) {
  const [remaining, setRemaining] = React.useState(Math.max(0, targetTs - Date.now()));
  React.useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, targetTs - Date.now())), 1000);
    return () => clearInterval(t);
  }, [targetTs]);
  const totalSecs = Math.floor(remaining / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = n => String(n).padStart(2, "0");
  const label = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return <p style={{ fontSize:13, color:"#7a8082", margin:0, fontVariantNumeric:"tabular-nums" }}>{label}</p>;
}

function useCountdown(targetTs) {
  const [remaining, setRemaining] = React.useState(Math.max(0, targetTs - Date.now()));
  React.useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, targetTs - Date.now())), 1000);
    return () => clearInterval(t);
  }, [targetTs]);
  const totalSecs = Math.floor(remaining / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = n => String(n).padStart(2, "0");
  return d > 0
    ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`
    : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function AllPrayedScreen({ prayedCount, praySessionCount, total, onWeek, onKeepPraying }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => { setTimeout(() => setShow(true), 100); }, []);

  // Calculate next Monday midnight ET — stable, computed once
  const nextMonday = React.useMemo(() => {
    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const etNow = new Date(etStr);
    const day = etNow.getDay();
    const daysUntil = day === 1 ? 7 : (8 - day) % 7 || 7;
    const monET = new Date(etNow);
    monET.setDate(etNow.getDate() + daysUntil);
    monET.setHours(0, 0, 0, 0);
    const utcOffset = now.getTime() - etNow.getTime();
    return monET.getTime() + utcOffset;
  }, []);

  const isMonday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay() === 1;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 24px 40px", gap:20, textAlign:"center" }}>
      {/* Confetti is its own isolated component — never rerenders from countdown ticks */}
      {show && <Confetti />}
      <div style={{ animation:"celebPulse 2s ease-in-out infinite", lineHeight:1 }}>
        <svg width="64" height="64" viewBox="0 0 20 20">
          <path d="M10,2 L11.768,8.232 L18,10 L11.768,11.768 L10,18 L8.232,11.768 L2,10 L8.232,8.232 Z" fill="#6b9e78" />
        </svg>
      </div>
      <h2 style={{ fontFamily:"'Lora', Georgia, serif", fontSize:34, fontWeight:400, color:"#e8e0d4", margin:0, lineHeight:1.2 }}>
        Everyone's been<br/>prayed for!
      </h2>
      <p style={{ fontSize:14, color:"#6b9e78", margin:0, fontWeight:500 }}>
        {praySessionCount > prayedCount ? praySessionCount : prayedCount} of {total} this week
      </p>
      {isMonday ? (
        <p style={{ fontSize:13, color:"#7a8082", margin:0, lineHeight:1.7, maxWidth:280 }}>
          The week just reset — keep the momentum going!
        </p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"center" }}>
          <p style={{ fontSize:13, color:"#7a8082", margin:0 }}>Check Back Monday</p>
          <CountdownTicker targetTs={nextMonday} />
        </div>
      )}
      <button onClick={() => onKeepPraying()} style={{ background:C.accent, border:"none", color:C.bg, borderRadius:12, padding:"13px 28px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", boxShadow:"0 4px 20px rgba(107,158,120,0.3)" }}>
        Keep Praying
      </button>
      <button onClick={onWeek} style={{ background:"none", border:"1px solid #333839", color:"#7a8082", borderRadius:10, padding:"10px 20px", fontSize:13, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
        View Week Summary →
      </button>
    </div>
  );
}


function getSetup() {
  try { const r = localStorage.getItem("letspray-setup"); return r ? JSON.parse(r) : null; }
  catch (_e) { return null; }
}

function SetupScreen({ onComplete }) {
  const [name, setName] = React.useState("");
  const [sub, setSub] = React.useState("");
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [err, setErr] = React.useState("");

  function submit() {
    if (!name.trim()) return setErr("Please enter your ministry name.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    if (pw !== pw2) return setErr("Passwords don’t match.");
    const data = { name: name.trim(), sub: sub.trim(), password: pw };
    try { localStorage.setItem("letspray-setup", JSON.stringify(data)); } catch (_e) {}
    onComplete(data);
  }

  const inputStyle = { width:"100%", boxSizing:"border-box", background:"#222527", border:"1px solid #333839", borderRadius:10, color:"#e8e0d4", padding:"12px 14px", fontSize:15, fontFamily:"'Inter', system-ui, sans-serif", outline:"none" };
  const labelStyle = { fontSize:11, color:"#7a8082", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600, display:"block", marginBottom:5 };

  return (
    <div style={{ minHeight:"100vh", background:"#1a1c1e", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px" }}>
      <svg width="48" height="48" viewBox="0 0 20 20" style={{ marginBottom:16 }}>
        <path d="M10,2 L11.768,8.232 L18,10 L11.768,11.768 L10,18 L8.232,11.768 L2,10 L8.232,8.232 Z" fill="#6b9e78" />
      </svg>
      <h1 style={{ fontFamily:"'Lora', Georgia, serif", fontSize:28, fontWeight:600, color:"#e8e0d4", margin:"0 0 6px", textAlign:"center" }}>Let’s Pray</h1>
      <p style={{ fontSize:13, color:"#7a8082", margin:"0 0 32px", textAlign:"center" }}>First-time setup — takes about 30 seconds</p>
      <div style={{ width:"100%", maxWidth:360, display:"flex", flexDirection:"column", gap:12 }}>
        <div><label style={labelStyle}>Ministry Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. First Baptist Students" style={inputStyle} /></div>
        <div><label style={labelStyle}>Subtitle <span style={{ opacity:0.5, fontWeight:400, textTransform:"none" }}>(optional)</span></label><input value={sub} onChange={e => setSub(e.target.value)} placeholder='e.g. "Let’s Pray" or leave blank' style={inputStyle} /></div>
        <div><label style={labelStyle}>Admin Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Choose a password (6+ characters)" style={inputStyle} /></div>
        <div><label style={labelStyle}>Confirm Password</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Re-enter password" style={inputStyle} /></div>
        {err && <p style={{ color:"#c07070", fontSize:13, margin:0 }}>{err}</p>}
        <button onClick={submit} style={{ background:"#6b9e78", border:"none", color:"#fff", borderRadius:12, padding:"14px 0", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", marginTop:4 }}>Get Started</button>
      </div>
    </div>
  );
}

export default function App() {
  const [setup, setSetup] = React.useState(() => getSetup());
  if (!setup) return <SetupScreen onComplete={s => setSetup(s)} />;
  const ADMIN_PASSWORD = setup.password;
  const MINISTRY_NAME = setup.name;
  const MINISTRY_SUB = setup.sub || "";

  const [people, setPeople] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("pray");
  const [order, setOrder] = useState("random");
  const [filter, setFilter] = useState("all");
  const [cardIdx, setCardIdx] = useState(0);
  const [deckIds, setDeckIds] = useState([]);
  const [ready, setReady] = useState(() => !shouldShowTap());
  const [pinnedPersonId, setPinnedPersonId] = useState(null);
  const [keepPrayingMode, setKeepPrayingMode] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Swipe
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [cardAnim, setCardAnim] = useState("idle"); // idle | exiting-left | exiting-right | entering-left | entering-right

  // People mgmt
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("student");
  const [addGroup, setAddGroup] = useState("hs");
  const [search, setSearch] = useState("");
  const [editBdayFor, setEditBdayFor] = useState(null);
  const [editNameFor, setEditNameFor] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [confirmPromo, setConfirmPromo] = useState(false);
  const [confirmClearInactive, setConfirmClearInactive] = useState(false);
  const [weekHistory, setWeekHistory] = useState([]);
  const [bdayInput, setBdayInput] = useState("");

  // Prayer requests
  const [reqFor, setReqFor] = useState(null);
  const [reqText, setReqText] = useState("");

  // Import
  const [importData, setImportData] = useState(null);
  const fileRef = useRef(null);

  const saveTimer = useRef(null);
  const pollTimer = useRef(null);
  const isSaving = useRef(false);

  // Admin auth
  const [adminAuthed, setAdminAuthedState] = useState(() => isAdminAuthed());
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminPwError, setAdminPwError] = useState("");
  const [pendingView, setPendingView] = useState(null);

  useEffect(() => {
    // Check if push notifications are supported
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;

    if (hasSW && hasPush) {
      // Full push support (Android, or iOS 16.4+ on home screen)
      setPushSupported(true);
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) setPushEnabled(true);
        });
      }).catch(() => {});
    } else if (isIos && !isStandalone) {
      // iOS in browser — needs to add to home screen first
      setPushSupported("ios-prompt");
    } else if (isIos && isStandalone && !hasPush) {
      // iOS on home screen but iOS < 16.4 — push not supported
      setPushSupported("ios-unsupported");
    } else if (hasSW && !hasPush) {
      // SW available but no PushManager — unsupported browser
      setPushSupported(false);
    }
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
  @keyframes tapPulse { 0%,100%{opacity:1} 50%{opacity:0.65} }
  @keyframes flyOutLeft  { to { transform: translateX(-110%) rotate(-8deg); opacity: 0; } }
  @keyframes flyOutRight { to { transform: translateX(110%)  rotate(8deg);  opacity: 0; } }
  @keyframes flyInLeft   { from { transform: translateX(110%)  rotate(6deg);  opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes flyInRight  { from { transform: translateX(-110%) rotate(-6deg); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes confettiFall { 0% { transform: translateY(-20px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
  @keyframes celebPulse { 0%,100%{transform:scale(1) filter:drop-shadow(0 0 0px #6b9e78)} 50%{transform:scale(1.1) filter:drop-shadow(0 0 12px #6b9e78)} }
  @keyframes bdayGlow { 0%,100%{box-shadow:0 0 8px 2px rgba(255,255,255,0.2), 0 0 0 0 rgba(255,255,255,0)} 50%{box-shadow:0 0 18px 6px rgba(255,255,255,0.35), 0 0 32px 12px rgba(255,255,255,0.1)} }
  @keyframes bdaySpin { 0%{transform:rotate(-8deg) scale(1.08)} 50%{transform:rotate(8deg) scale(1.15)} 100%{transform:rotate(-8deg) scale(1.08)} }
`;
    document.head.appendChild(style);
    return () => { link.remove(); style.remove(); };
  }, []);

  // Load from KV + snapshot previous week if it just rolled over
  useEffect(() => {
    (async () => {
      try {
        const [data, history] = await Promise.all([apiLoad(), apiLoadHistory()]);
        if (data.length > 0) setPeople(data);

        const currentWeekStart = getWeekStartET();
        const currentWeekDate = new Date(currentWeekStart).toLocaleDateString("en-US", { timeZone: "America/New_York" });
        const lastSnapshotDate = history.length > 0
          ? new Date(history[0].weekStart).toLocaleDateString("en-US", { timeZone: "America/New_York" })
          : null;

        if (lastSnapshotDate !== currentWeekDate) {
          const prevWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;
          const prevWeekDateStr = getPrevWeekDateStringET();
          // Use date string comparison — immune to timestamp precision issues
          const prevWeekPrayed = data.filter(p =>
            p.prayedWeekDate === prevWeekDateStr ||
            // Fallback for records before prayedWeekDate was introduced
            (!p.prayedWeekDate && p.prayedAt && p.prayedAt >= prevWeekStart && p.prayedAt < currentWeekStart)
          );
          const prevWeekCount = prevWeekPrayed.reduce((sum, p) =>
            sum + (p.prayedWeekDate === prevWeekDateStr && p.weekPrayCount ? p.weekPrayCount : 1), 0
          );
          const total = data.filter(p => p.active !== false).length;
          const newEntry = { weekStart: currentWeekStart, prevWeekStart, prevWeekDateStr, count: prevWeekCount, total };
          const updated = [newEntry, ...history].slice(0, 52);
          setWeekHistory(updated);
          await apiSaveHistory(updated);
        } else {
          setWeekHistory(history);
        }
        setLoaded(true);
      } catch {
        setTimeout(async () => {
          try {
            const data = await apiLoad();
            if (data.length > 0) setPeople(data);
          } catch (_e) {}
          setLoaded(true);
        }, 3000);
      }
    })();
  }, []);

  // Track whether current people state came from a remote poll (no save needed)
  const fromPoll = useRef(false);
  const lastSaved = useRef(null);
  const pendingChange = useRef(false); // true while user has unsaved changes

  // Save to KV (debounced 500ms — fast enough to beat 15s poll)
  useEffect(() => {
    if (!loaded) return;
    if (fromPoll.current) { fromPoll.current = false; return; }
    pendingChange.current = true; // mark that user has changes in flight
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (people.length === 0) { pendingChange.current = false; return; }
      const snapshot = JSON.stringify(people);
      if (snapshot === lastSaved.current) { pendingChange.current = false; return; }
      isSaving.current = true;
      await apiSave(people).catch(() => {});
      lastSaved.current = snapshot;
      isSaving.current = false;
      pendingChange.current = false;
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [people, loaded]);

  // Poll for remote changes every 15s — skip entirely if user has unsaved changes
  useEffect(() => {
    if (!loaded) return;
    const poll = async () => {
      // Skip poll if user is actively making changes or a save is in flight
      if (isSaving.current || pendingChange.current) return;
      try {
        const fresh = await apiLoad();
        if (fresh.length === 0) return;
        const freshStr = JSON.stringify(fresh);
        setPeople(prev => {
          if (prev.length > 0 && fresh.length === 0) return prev;
          if (JSON.stringify(prev) === freshStr) return prev;
          fromPoll.current = true;
          return fresh;
        });
      } catch (_e) {}
    };
    pollTimer.current = setInterval(poll, 15000);
    return () => clearInterval(pollTimer.current);
  }, [loaded]);

  const activePeople = people.filter(p => p.active !== false);

  const getFiltered = useCallback(() => {
    let list = activePeople;
    if (filter === "students") list = list.filter(p => p.type === "student");
    if (filter === "leaders") list = list.filter(p => p.type === "leader");
    if (filter === "hs") list = list.filter(p => p.group === "hs");
    if (filter === "ms") list = list.filter(p => p.group === "ms");
    if (filter === "hs-students") list = list.filter(p => p.type === "student" && p.group === "hs");
    if (filter === "ms-students") list = list.filter(p => p.type === "student" && p.group === "ms");
    if (filter === "hs-leaders") list = list.filter(p => p.type === "leader" && p.group === "hs");
    if (filter === "ms-leaders") list = list.filter(p => p.type === "leader" && p.group === "ms");
    return list;
  }, [people, filter]);

  const buildDeck = useCallback((filterOverride) => {
    const f = filterOverride ?? filter;
    let list = activePeople;
    if (f === "students") list = list.filter(p => p.type === "student");
    if (f === "leaders") list = list.filter(p => p.type === "leader");
    if (f === "hs") list = list.filter(p => p.group === "hs");
    if (f === "ms") list = list.filter(p => p.group === "ms");
    if (f === "hs-students") list = list.filter(p => p.type === "student" && p.group === "hs");
    if (f === "ms-students") list = list.filter(p => p.type === "student" && p.group === "ms");
    if (f === "hs-leaders") list = list.filter(p => p.type === "leader" && p.group === "hs");
    if (f === "ms-leaders") list = list.filter(p => p.type === "leader" && p.group === "ms");
    // Always exclude prayed-this-week from swipe deck
    const unprayed = list.filter(p => !withinWeek(p.prayedAt));
    const shuffled = shuffle(unprayed.map(p => p.id));
    // Move today's birthday person to front if they're in the deck
    const todayBdayId = unprayed.find(p => getBirthdayStatus(p.birthday)?.today)?.id;
    if (todayBdayId) {
      const idx = shuffled.indexOf(todayBdayId);
      if (idx > 0) { shuffled.splice(idx, 1); shuffled.unshift(todayBdayId); }
    }
    setDeckIds(shuffled);
    setCardIdx(0);
    setPinnedPersonId(null);
    setKeepPrayingMode(false);
    setDropdownOpen(false);
    if (shouldShowTap()) setReady(false); else setReady(true);
  }, [people, filter]);

  useEffect(() => { if (loaded) buildDeck(); }, [loaded, filter, order]);

  // When someone gets marked as prayed, remove them from deck immediately
  useEffect(() => {
    if (!loaded) return;
    setDeckIds(prev => {
      const prayedSet = new Set(activePeople.filter(p => withinWeek(p.prayedAt)).map(p => p.id));
      const filtered = prev.filter(id => !prayedSet.has(id));
      if (filtered.length !== prev.length) { setCardIdx(i => Math.min(i, Math.max(filtered.length - 1, 0))); }
      return filtered;
    });
  }, [people]);

  const deck = (() => {
    if (order === "alpha") return getFiltered().filter(p => !withinWeek(p.prayedAt)).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (order === "oldest") return getFiltered().filter(p => !withinWeek(p.prayedAt)).slice().sort((a, b) => (a.prayedAt || 0) - (b.prayedAt || 0));
    const map = Object.fromEntries(activePeople.map(p => [p.id, p]));
    return deckIds.map(id => map[id]).filter(Boolean);
  })();

  const pinnedPerson = pinnedPersonId ? activePeople.find(p => p.id === pinnedPersonId) ?? null : null;
  const current = pinnedPerson ?? deck[cardIdx] ?? null;

  const prayedPeople = activePeople.filter(p => withinWeek(p.prayedAt));

  // Streak: consecutive weeks where count >= total (everyone prayed for)
  const streak = React.useMemo(() => {
    if (!weekHistory.length) return 0;
    let count = 0;
    for (const w of weekHistory) {
      if (w.total > 0 && w.count >= w.total) count++;
      else break;
    }
    return count;
  }, [weekHistory]);
  const prayedCount = prayedPeople.length; // unique people prayed
  const praySessionCount = prayedPeople.reduce((sum, p) => sum + (p.weekPrayCount || 1), 0); // total sessions this week
  const upcomingBdays = getUpcomingBirthdays(activePeople);
  const urgentBdays = upcomingBdays.filter(b => b.diff <= 3).length;
  const todayBdayPrayed = upcomingBdays.filter(b => b.diff === 0 && withinWeek(b.person.prayedAt) && !isBdayDismissed(b.person.id));

  function goToPerson(personId) {
    setView("pray");
    setDropdownOpen(false);
    const deckIdx = deck.findIndex(p => p.id === personId);
    if (deckIdx >= 0) {
      setPinnedPersonId(null);
      setCardIdx(deckIdx);
    } else {
      setPinnedPersonId(personId);
    }
    if (!ready) { setReady(true); recordTapShown(); }
  }

  function nav(dir, animate = false) {
    setReqFor(null);
    setSwipeDelta(0);
    setPinnedPersonId(null);
    setCardIdx(i => {
      let n = i + dir;
      if (n < 0) n = deck.length - 1;
      if (n >= deck.length) n = 0;
      return n;
    });
  }

  function navWithAnim(dir) {
    const exitAnim = dir > 0 ? "exiting-left" : "exiting-right";
    const enterAnim = dir > 0 ? "entering-left" : "entering-right";
    setCardAnim(exitAnim);
    setTimeout(() => {
      if (keepPrayingMode) {
        // In keep praying mode the deck is empty — pick a new random person
        const p = activePeople;
        if (p.length) {
          const pick = p[Math.floor(Math.random() * p.length)];
          setPinnedPersonId(pick.id);
          setReqFor(null);
        }
      } else {
        nav(dir);
      }
      setCardAnim(enterAnim);
      setTimeout(() => setCardAnim("idle"), 320);
    }, 200);
  }

  function selectFromDropdown(personId) {
    setDropdownOpen(false);
    setReqFor(null);
    // If person is in unprayed deck, jump to their index
    const deckIdx = deck.findIndex(p => p.id === personId);
    if (deckIdx >= 0) {
      setPinnedPersonId(null);
      setCardIdx(deckIdx);
    } else {
      // Already prayed — pin their card
      setPinnedPersonId(personId);
    }
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
    setSwipeDelta(0);
  }

  function handleTouchMove(e) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!isSwiping && Math.abs(dy) > Math.abs(dx)) return;
    setIsSwiping(true);
    e.preventDefault();
    setSwipeDelta(dx);
  }

  function handleTouchEnd() {
    const delta = swipeDelta;
    setIsSwiping(false);
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(delta) > 55) {
      const dir = delta < 0 ? "left" : "right";
      setCardAnim(`exiting-${dir}`);
      setTimeout(() => {
        if (keepPrayingMode) {
          const p = activePeople;
          if (p.length) { setPinnedPersonId(p[Math.floor(Math.random() * p.length)].id); setReqFor(null); }
        } else {
          nav(delta < 0 ? 1 : -1);
        }
        setSwipeDelta(0);
        setCardAnim(`entering-${dir === "left" ? "left" : "right"}`);
        setTimeout(() => setCardAnim("idle"), 320);
      }, 220);
    } else {
      setSwipeDelta(0);
    }
  }

  function markPrayed() {
    if (!current) return;
    setPeople(prev => prev.map(p => {
      if (p.id !== current.id) return p;
      const weekStart = getWeekStartET();
      const inSameWeek = p.prayedAt && p.prayedAt >= weekStart;
      const weekDateStr = getWeekDateStringET();
      return { ...p, prayedAt: Date.now(), prayedWeek: weekStart, prayedWeekDate: weekDateStr, prayCount: (p.prayCount || 0) + 1, weekPrayCount: inSameWeek ? (p.weekPrayCount || 1) + 1 : 1, updatedAt: Date.now() };
    }));
    if (current?.id) dismissBday(current.id);
    setPinnedPersonId(null);
    setKeepPrayingMode(false); // return to celebration screen after Pray Again
  }

  function startKeepPraying(pool) {
    const p = pool || activePeople;
    if (!p.length) return;
    const pick = p[Math.floor(Math.random() * p.length)];
    setKeepPrayingMode(true);
    setPinnedPersonId(pick.id);
    setReqFor(null);
    setReady(true);
  }

  function unmarkPrayed() {
    if (!current) return;
    setPeople(prev => prev.map(p => p.id === current.id ? { ...p, prayedAt: null, updatedAt: Date.now() } : p));
  }

  const [addGrade, setAddGrade] = useState("");
  const [addBday, setAddBday] = useState("");
  const [peopleSort, setPeopleSort] = useState("name");
  const [peopleTypeFilter, setPeopleTypeFilter] = useState("all");
  const [rosterGroup, setRosterGroup] = useState("all"); // all | ms | hs | leader
  const [rosterSort, setRosterSort] = useState("name"); // name | grade | birthday

  function addPerson() {
    if (!addName.trim()) return;
    const newId = genId();
    setPeople(prev => [...prev, { id: newId, name: addName.trim(), type: addType, group: addType === "student" ? addGroup : null, grade: addType === "student" && addGrade ? Number(addGrade) : null, active: true, prayedAt: null, prayerRequests: [], birthday: addBday.trim() || "", updatedAt: Date.now() }]);
    setAddBday("");
    setAddName("");
    setAddGrade("");
    setJustAddedId(newId);
    setTimeout(() => setJustAddedId(null), 8000);
  }

  function cycleGroup(id) {
    setPeople(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.type === "leader") return { ...p, group: p.group === "hs" ? "ms" : p.group === "ms" ? null : "hs", updatedAt: Date.now() };
      return { ...p, group: p.group === "hs" ? "ms" : p.group === "ms" ? null : "hs", updatedAt: Date.now() };
    }));
  }

  function toggleType(id) {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, type: p.type === "student" ? "leader" : "student", updatedAt: Date.now() } : p));
  }

  function deactivate(id) { setPeople(prev => prev.map(p => p.id === id ? { ...p, active: false, updatedAt: Date.now() } : p)); }
  function restore(id) { setPeople(prev => prev.map(p => p.id === id ? { ...p, active: true, updatedAt: Date.now() } : p)); }


  function saveBirthday(id, val) {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, birthday: val, updatedAt: Date.now() } : p));
    setEditBdayFor(null);
    setBdayInput("");
  }

  function saveName(id) {
    if (!nameInput.trim()) return;
    setPeople(prev => prev.map(p => p.id === id ? { ...p, name: nameInput.trim(), updatedAt: Date.now() } : p));
    setEditNameFor(null);
    setNameInput("");
  }

  function promoteGrades() {
    setPeople(prev => prev.map(p => {
      if (p.type !== "student" || !p.grade) return p;
      if (Number(p.grade) >= 12) return { ...p, active: false };
      const newGrade = Number(p.grade) + 1;
      const newGroup = Number(p.grade) === 8 ? "hs" : p.group;
      return { ...p, grade: newGrade, group: newGroup };
    }));
    setConfirmPromo(false);
  }

  function addRequest(personId) {
    if (!reqText.trim()) return;
    setPeople(prev => prev.map(p => p.id === personId ? { ...p, prayerRequests: [...(p.prayerRequests || []), reqText.trim()], updatedAt: Date.now() } : p));
    setReqText(""); setReqFor(null);
  }

  function removeRequest(personId, idx) {
    setPeople(prev => prev.map(p => p.id === personId ? { ...p, prayerRequests: p.prayerRequests.filter((_, i) => i !== idx), updatedAt: Date.now() } : p));
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImportData(parseCSV(ev.target.result));
    reader.readAsText(file);
    e.target.value = "";
  }

  function confirmImport() {
    const existing = new Set(people.map(p => p.name.toLowerCase()));
    const toAdd = (importData || [])
      .filter(p => !existing.has(p.name.toLowerCase()))
      .map(p => ({ id: genId(), name: p.name, type: "student", group: null, active: true, prayedAt: null, prayerRequests: [], birthday: p.birthday || "" }));
    setPeople(prev => [...prev, ...toAdd]);
    setImportData(null);
    setView("people");
  }

  function handleTabClick(v) {
    if ((v === "people" || v === "import") && !adminAuthed) {
      setPendingView(v);
      setAdminPwInput("");
      setAdminPwError("");
      setShowAdminPrompt(true);
    } else {
      setView(v);
    }
  }

  async function recalculateHistory() {
    const currentWeekStart = getWeekStartET();
    const currentWeekDateStr = getWeekDateStringET();
    const newHistory = [];
    for (let i = 1; i <= 3; i++) {
      const wStart = currentWeekStart - i * 7 * 24 * 60 * 60 * 1000;
      const wEnd   = currentWeekStart - (i - 1) * 7 * 24 * 60 * 60 * 1000;
      // Build date string for this week's Monday
      const wDate = new Date(wStart);
      const etStr = wDate.toLocaleString("en-US", { timeZone: "America/New_York" });
      const etD = new Date(etStr);
      const wDateStr = `${etD.getMonth()+1}/${etD.getDate()}/${etD.getFullYear()}`;
      const prayed = people.filter(p =>
        p.prayedWeekDate === wDateStr ||
        (!p.prayedWeekDate && p.prayedAt && p.prayedAt >= wStart && p.prayedAt < wEnd)
      );
      const count = prayed.reduce((sum, p) =>
        sum + (p.prayedWeekDate === wDateStr && p.weekPrayCount ? p.weekPrayCount : 1), 0
      );
      if (count > 0) {
        newHistory.push({ weekStart: wEnd, prevWeekStart: wStart, prevWeekDateStr: wDateStr, count, total: activePeople.length });
      }
    }
    setWeekHistory(newHistory);
    await apiSaveHistory(newHistory);
  }




  function submitAdminPw() {
    if (adminPwInput === ADMIN_PASSWORD) {
      setAdminAuthed(true);
      setAdminAuthedState(true);
      setShowAdminPrompt(false);
      if (pendingView) { setView(pendingView); setPendingView(null); }
    } else {
      setAdminPwError("Incorrect password.");
      setAdminPwInput("");
    }
  }

  if (!loaded) {
    return <div style={S.root}><p style={{ color: C.cream, fontFamily: "Lora, Georgia, serif", textAlign: "center", marginTop: 80, fontSize: 20 }}>Loading…</p></div>;
  }

  const bdayStatus = current ? getBirthdayStatus(current.birthday) : null;
  const prayedThis = activePeople.filter(p => withinWeek(p.prayedAt)).sort((a, b) => b.prayedAt - a.prayedAt);
  const notPrayedThis = activePeople.filter(p => !withinWeek(p.prayedAt)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.logoWrap}>
          <svg width="16" height="16" viewBox="0 0 20 20" style={{ flexShrink:0, marginTop:2 }}><path d="M10,2 L11.768,8.232 L18,10 L11.768,11.768 L10,18 L8.232,11.768 L2,10 L8.232,8.232 Z" fill="#6b9e78" /></svg>
          <div style={{ display:"flex", flexDirection:"column", lineHeight:1 }}>
            <span style={S.logoText}>{MINISTRY_NAME}</span>
            {MINISTRY_SUB && <span style={S.logoSub}>{MINISTRY_SUB}</span>}
          </div>
        </div>
        <div style={{ ...S.weekBar, cursor: "pointer" }} onClick={() => setView("week")}>
          <Heart size={13} color={C.accent} fill={C.accent} />
          <span style={S.weekText}>{prayedCount >= activePeople.length ? praySessionCount : prayedCount} / {activePeople.length} this week</span>
          {urgentBdays > 0 && <span style={{ ...S.bdayAlert, ...(upcomingBdays.some(b => b.diff === 0 && !isBdayDismissed(b.person.id)) ? { animation:"bdayGlow 1.6s ease-in-out infinite" } : {}) }}><Cake size={12} /><span style={{lineHeight:1}}>{urgentBdays}</span></span>}
        </div>
      </header>

      {/* Progress */}
      <div style={S.progressTrack}>
        <div style={{ ...S.progressFill, width: activePeople.length ? `${Math.min(100, ((prayedCount >= activePeople.length ? praySessionCount : prayedCount) / activePeople.length) * 100)}%` : "0%" }} />
      </div>

      {/* Tabs */}
      <nav style={S.tabs}>
        {[["pray","Pray"],["week","Week"],["roster","Roster"]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ ...S.tab, ...(view === v ? S.tabActive : {}) }}>{label}</button>
        ))}
        {adminAuthed && [["people","People"],["report","Report"],["import","Import"]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ ...S.tab, ...(view === v ? S.tabActive : {}) }}>{label}</button>
        ))}
      </nav>

      {/* Admin password modal */}
      {showAdminPrompt && (
        <div style={S.modalOverlay} onClick={() => setShowAdminPrompt(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Admin Access</p>
            <input
              autoFocus
              type="password"
              value={adminPwInput}
              onChange={e => setAdminPwInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitAdminPw(); if (e.key === "Escape") setShowAdminPrompt(false); }}
              placeholder="Password"
              style={S.modalInput}
            />
            {adminPwError && <p style={S.modalError}>{adminPwError}</p>}
            <div style={S.modalBtns}>
              <button onClick={submitAdminPw} style={S.confirmBtn}>Unlock</button>
              <button onClick={() => setShowAdminPrompt(false)} style={S.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PRAY ─── */}
      {view === "pray" && (
        <div style={S.prayWrap}>
          <div style={S.controls}>
            <div style={S.togglePill}>
              <button onClick={() => { setOrder("random"); buildDeck(); }} style={{ ...S.toggleOpt, ...(order === "random" ? S.toggleOptOn : {}) }}>Shuffle</button>
              <button onClick={() => { setOrder("alpha"); setCardIdx(0); if (shouldShowTap()) setReady(false); }} style={{ ...S.toggleOpt, ...(order === "alpha" ? S.toggleOptOn : {}) }}>A–Z</button>
              <button onClick={() => { setOrder("oldest"); setCardIdx(0); if (shouldShowTap()) setReady(false); }} style={{ ...S.toggleOpt, ...(order === "oldest" ? S.toggleOptOn : {}) }}>Time</button>
            </div>
            <select value={filter} onChange={e => { setFilter(e.target.value); setCardIdx(0); if (shouldShowTap()) setReady(false); }} style={S.filterSelect}>
              <option value="all">Everyone</option>
              <option value="ms-students">MS Students</option>
              <option value="hs-students">HS Students</option>
              <option value="leaders">Leaders</option>
            </select>
            {order === "random" && (
              <button onClick={() => buildDeck()} style={S.reshuffleBtn} title="Reshuffle"><RotateCcw size={14} /></button>
            )}
          </div>

          {deck.length === 0 && !pinnedPerson && !keepPrayingMode ? (
            activePeople.length === 0 ? (
              <div style={S.empty}>
                <BookOpen size={40} color={C.muted} />
                <p style={S.emptyTitle}>No one here yet</p>
                <p style={S.emptySub}>Add people in the People tab or import a CSV.</p>
              </div>
            ) : filter === "all" ? (
              <>
                {todayBdayPrayed.map(({ person }) => (
                  <div key={person.id} style={{ position:"relative", width:"100%", marginBottom:8 }}>
                    <button onClick={() => { dismissBday(person.id); setPinnedPersonId(person.id); setReqFor(null); setReady(true); setPeople(p => [...p]); }} style={S.bdayBanner}>
                      <Cake size={14} style={{marginRight:6, flexShrink:0, verticalAlign:"middle"}} /> Today is {person.name}{"’"}s birthday! Tap to pray.
                    </button>
                    <button onClick={e => { e.stopPropagation(); dismissBday(person.id); setPeople(p => [...p]); }} style={S.bdayDismiss}>{"✕"}</button>
                  </div>
                ))}
                <AllPrayedScreen prayedCount={prayedCount} praySessionCount={praySessionCount} total={activePeople.length} onWeek={() => setView("week")} onKeepPraying={startKeepPraying} />
              </>
            ) : (
              <div style={S.empty}>
                <Heart size={36} fill={C.prayedGreen} color={C.prayedGreen} />
                <p style={S.emptyTitle}>All prayed for!</p>
                <p style={S.emptySub}>Everyone in this group has been prayed for this week.</p>
                <button onClick={() => startKeepPraying(getFiltered())} style={{ background:C.accent, border:"none", color:C.bg, borderRadius:12, padding:"13px 28px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", boxShadow:"0 4px 20px rgba(201,152,42,0.3)", marginTop:8 }}>
                  Keep Praying
                </button>
              </div>
            )
          ) : null}
          {(deck.length > 0 || pinnedPerson || keepPrayingMode) ? (
            <>
              {!ready && !pinnedPerson ? (
                /* ── Tap to Begin splash ── */
                <div
                  style={S.cardOuter}
                  onClick={() => { setReady(true); recordTapShown(); }}
                >
                  <div style={{ ...S.cardGhost, transform: "rotate(2deg) translateY(6px)", opacity: 0.35 }} />
                  <div style={{ ...S.cardGhost, transform: "rotate(-1.5deg) translateY(3px)", opacity: 0.55 }} />
                  <div style={{ ...S.card, ...S.tapCard }}>
                    <svg width="52" height="52" viewBox="0 0 20 20" style={{ marginBottom: 12, flexShrink:0 }}><path d="M10,2 L11.768,8.232 L18,10 L11.768,11.768 L10,18 L8.232,11.768 L2,10 L8.232,8.232 Z" fill="#6b9e78" /></svg>
                    <h2 style={S.tapTitle}>Tap to Begin</h2>
                    <p style={S.tapSub}>{deck.length} {filter === "all" ? "people" : filter.replace("-", " ")} ready</p>
                  </div>
                </div>
              ) : (
                <>
                  {todayBdayPrayed.map(({ person }) => (
                    <div key={person.id} style={{ position:"relative", width:"100%", marginBottom:8 }}>
                      <button onClick={() => { dismissBday(person.id); setPinnedPersonId(person.id); setReqFor(null); setPeople(p => [...p]); }} style={S.bdayBanner}>
                        <Cake size={14} style={{marginRight:6, flexShrink:0, verticalAlign:"middle"}} /> Today is {person.name}{"’"}s birthday! Tap to pray.
                      </button>
                      <button onClick={e => { e.stopPropagation(); dismissBday(person.id); setPeople(p => [...p]); }} style={S.bdayDismiss}>{"✕"}</button>
                    </div>
                  ))}
                  <div style={S.swipeHint}>← swipe to navigate →</div>

                  <div style={S.cardOuter} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                    <div style={{ ...S.cardGhost, transform: "rotate(2deg) translateY(6px)", opacity: 0.35 }} />
                    <div style={{ ...S.cardGhost, transform: "rotate(-1.5deg) translateY(3px)", opacity: 0.55 }} />
                    <div style={{
                      ...S.card,
                      ...(withinWeek(current?.prayedAt) ? S.cardDone : {}),
                      ...(isSwiping ? {
                        transform: `translateX(${swipeDelta}px) rotate(${swipeDelta * 0.04}deg)`,
                        opacity: Math.max(0.4, 1 - Math.abs(swipeDelta) / 300),
                        transition: "none",
                      } : {}),
                      ...(cardAnim === "exiting-left"  ? { animation: "flyOutLeft  0.22s ease-in forwards" } : {}),
                      ...(cardAnim === "exiting-right" ? { animation: "flyOutRight 0.22s ease-in forwards" } : {}),
                      ...(cardAnim === "entering-left" ? { animation: "flyInLeft  0.3s cubic-bezier(.22,.68,0,1.2) forwards" } : {}),
                      ...(cardAnim === "entering-right"? { animation: "flyInRight 0.3s cubic-bezier(.22,.68,0,1.2) forwards" } : {}),
                    }}>
                      {/* Badge row */}
                      <div style={S.badgeRow}>
                        <div style={{ ...S.badge, ...(current?.type === "leader" ? S.leaderBadge : S.studentBadge) }}>
                          {current?.type === "leader" ? "Leader" : "Student"}
                        </div>
                        {current?.group && (
                          <div style={{ ...S.badge, ...(current.group === "hs" ? S.hsBadge : S.msBadge) }}>
                            {current.group.toUpperCase()}
                          </div>
                        )}
                        {current?.type === "student" && current?.grade && (
                          <div style={{ ...S.badge, ...S.gradeBadgeLg }}>
                            {ordinal(current.grade)} Gr
                          </div>
                        )}
                      </div>

                      {/* Photo — taped to bottom-right corner, absolutely positioned */}
                      {current?.photoUrl && (
                        <div style={{
                          position: "absolute",
                          top: 20,
                          right: 20,
                          zIndex: 3,
                          display: "inline-block",
                        }}>
                          {/* Tape strip */}
                          <div style={{
                            position: "absolute",
                            top: -7,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: 42,
                            height: 12,
                            background: "rgba(255,255,255,0.55)",
                            borderRadius: 2,
                            zIndex: 2,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          }} />
                          <img
                            src={current.photoUrl}
                            alt={current.name}
                            onClick={() => { setLightboxUrl(current.photoUrl); setLightboxName(current.name); }}
                            style={{
                              width: 88,
                              height: 66,
                              objectFit: "cover",
                              display: "block",
                              borderRadius: 2,
                              transform: `rotate(${photoRotation(current.id)}deg)`,
                              boxShadow: "0 3px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)",
                              border: "3px solid #f0ebe4",
                              position: "relative",
                              zIndex: 1,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      )}

                      {/* Name — primary */}
                      <h2 style={S.cardName}>{current?.name}</h2>

                      {/* Birthday — secondary info, below name */}
                      {bdayStatus && (
                        <div style={{ ...S.bdayChip, ...(bdayStatus.urgent ? S.bdayChipUrgent : {}), ...(bdayStatus.today && !isBdayDismissed(current?.id) ? { animation: "bdayGlow 1.6s ease-in-out infinite", fontSize: 14, padding: "7px 16px" } : {}) }}>
                          <Cake size={14} style={{ marginRight:6, flexShrink:0, ...(bdayStatus.today ? { animation:"bdaySpin 2s ease-in-out infinite" } : {}) }} />
                          {bdayStatus.label.replace("🎂 ", "")}
                        </div>
                      )}
                      {current?.birthday && !bdayStatus && (
                        <div style={S.bdayQuiet}>
                          <Cake size={12} style={{ marginRight: 6, opacity: 0.5 }} />
                          <span>{formatBirthday(current.birthday)}</span>
                        </div>
                      )}

                      {/* Last prayed — tertiary */}
                      <div style={S.cardPrayedRow}>
                        {withinWeek(current?.prayedAt) ? (
                          <span style={S.prayedChip}>✓ Prayed {timeAgo(current.prayedAt)}</span>
                        ) : current?.prayedAt ? (
                          <span style={S.lastPrayedChip}>Last Prayed For: {timeAgo(current.prayedAt)}</span>
                        ) : (
                          <span style={S.neverChip}>Not yet prayed for</span>
                        )}
                      </div>

                      {(current?.prayerRequests || []).length > 0 && (
                        <div style={S.reqBox}>
                          <p style={S.reqLabel}>Prayer Requests</p>
                          {current.prayerRequests.map((req, i) => (
                            <div key={i} style={S.reqItem}>
                              <span style={S.reqDot}>◆</span>
                              <span style={S.reqText}>{req}</span>
                              <button onClick={() => removeRequest(current.id, i)} style={S.reqRemove}><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      {reqFor === current?.id ? (
                        <div style={S.reqInputRow}>
                          <input autoFocus value={reqText} onChange={e => setReqText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") addRequest(current.id); if (e.key === "Escape") setReqFor(null); }}
                            placeholder="Enter prayer request…" style={S.reqInput} />
                          <button onClick={() => addRequest(current.id)} style={S.reqAddBtn}>Add</button>
                          <button onClick={() => setReqFor(null)} style={S.reqCancelBtn}><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setReqFor(current?.id)} style={S.addReqTrigger}>
                          <Plus size={13} style={{ marginRight: 4 }} /> Add Request
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={S.navRow}>
                    <button onClick={() => navWithAnim(-1)} style={S.navArrow}><ChevronLeft size={22} /></button>
                    <span style={S.counter}>
                      {pinnedPerson ? "★" : `${cardIdx + 1}`}
                      <span style={{ color: C.muted }}> / </span>
                      {deck.length}
                    </span>
                    <button onClick={() => navWithAnim(1)} style={S.navArrow}><ChevronRight size={22} /></button>
                  </div>

                  {withinWeek(current?.prayedAt) && !pinnedPerson && !keepPrayingMode ? (
                    <div style={S.prayedActions}>
                      <div style={S.prayedConfirm}><Heart size={16} fill={C.prayedGreen} color={C.prayedGreen} style={{ marginRight: 7 }} /> Prayed!</div>
                      {!pinnedPerson && <button onClick={unmarkPrayed} style={S.undoBtn}>Undo</button>}
                      {pinnedPerson && <button onClick={() => setPinnedPersonId(null)} style={S.undoBtn}>Back</button>}
                    </div>
                  ) : (
                    <button onClick={markPrayed} style={S.prayBtn}>
                      <Heart size={16} style={{ marginRight: 8 }} /> {(pinnedPerson || keepPrayingMode) && withinWeek(current?.prayedAt) ? "Pray Again" : "Mark as Prayed"}
                    </button>
                  )}

                  {/* Quick-find dropdown */}
                  {(() => {
                    const dropList = getFiltered().slice().sort((a, b) => a.name.localeCompare(b.name));
                    return (
                      <div style={S.ddWrap}>
                        <button onClick={() => setDropdownOpen(o => !o)} style={S.ddToggle}>
                          <span>Select a specific name</span>
                          <span style={{ fontSize: 10, opacity: 0.5 }}>{dropdownOpen ? "▲" : "▼"}</span>
                        </button>
                        {dropdownOpen && (
                          <div style={S.ddList}>
                            {dropList.map(p => (
                              <button key={p.id} onClick={() => selectFromDropdown(p.id)}
                                style={{ ...S.ddItem, ...(withinWeek(p.prayedAt) ? S.ddItemPrayed : {}) }}>
                                <span>{p.name}</span>
                                <span style={S.ddItemMeta}>
                                  {withinWeek(p.prayedAt) ? "✓ prayed" : ""}
                                  {p.group ? ` ${p.group.toUpperCase()}` : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ─── WEEK SUMMARY ─── */}
      {view === "week" && (
        <div style={S.weekWrap}>
          <h2 style={S.weekTitle}>This Week</h2>

          {upcomingBdays.length > 0 && (
            <div style={S.weekSection}>
              <div style={S.sectionHead}>
                <Cake size={13} color={C.accent} style={{ marginRight: 7 }} />
                <span style={S.sectionTitle}>Upcoming Birthdays</span>
              </div>
              {upcomingBdays.map(({ person, diff, date }) => (
                <div key={person.id} onClick={() => goToPerson(person.id)} style={{ ...S.weekRow, ...(diff === 0 ? { background: C.faint } : {}), cursor: "pointer" }}>
                  <div>
                    <div style={S.weekName}>{person.name}</div>
                    <div style={{ ...S.weekMeta, display:"flex", alignItems:"center", gap:4 }}>{diff === 0 && <Cake size={11} color={C.accent} />}{diff === 0 ? "Today!" : diff === 1 ? "Tomorrow" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {person.group && <span style={{ ...S.badgeSm, ...(person.group === "hs" ? S.hsBadgeSm : S.msBadgeSm) }}>{person.group.toUpperCase()}</span>}
                    <span style={{ ...S.badgeSm, ...(person.type === "leader" ? S.leaderBadgeSm : S.studentBadgeSm) }}>{person.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
{streak > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:C.accentBg, border:`1px solid ${C.accent}44`, borderRadius:12 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" style={{ flexShrink:0 }}><path d="M10,2 L11.768,8.232 L18,10 L11.768,11.768 L10,18 L8.232,11.768 L2,10 L8.232,8.232 Z" fill="#6b9e78" /></svg>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                <span style={{ fontSize:10, color:C.accent, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'Inter', system-ui, sans-serif" }}>Prayer Streak</span>
                <span style={{ fontSize:14, color:C.cream, fontFamily:"'Lora', Georgia, serif", lineHeight:1.3 }}>
                  {streak} week{streak !== 1 ? "s" : ""} in a row — everyone prayed for
                </span>
              </div>
            </div>
          )}

          <div style={S.weekSection}>
            <div style={S.sectionHead}>
              <Heart size={13} fill={C.prayedGreen} color={C.prayedGreen} style={{ marginRight: 7 }} />
              <span style={S.sectionTitle}>Prayed For — {prayedThis.length}</span>
            </div>
            {prayedThis.length === 0
              ? <p style={S.weekEmpty}>No one marked yet this week.</p>
              : prayedThis.map(p => (
                <div key={p.id} onClick={() => goToPerson(p.id)} style={{ ...S.weekRow, cursor: "pointer" }}>
                  <div>
                    <div style={{ ...S.weekName, display:"flex", alignItems:"center", gap:6 }}>{p.name}{(p.weekPrayCount || 0) >= 2 ? <span style={{ fontSize:11, color:C.accent, fontWeight:700, background:C.faint, padding:"1px 6px", borderRadius:8 }}>x{p.weekPrayCount}</span> : null}</div>
                    <div style={S.weekMeta}>{timeAgo(p.prayedAt)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(p.prayerRequests || []).length > 0 && <span style={S.reqCountBadge}>{p.prayerRequests.length} req</span>}
                    <span style={{ color: C.prayedGreen, fontSize: 18 }}>✓</span>
                  </div>
                </div>
              ))
            }
          </div>

          <div style={S.weekSection}>
            <div style={S.sectionHead}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", border: `1.5px solid ${C.muted}`, marginRight: 7, flexShrink: 0 }} />
              <span style={S.sectionTitle}>Still Waiting — {notPrayedThis.length}</span>
            </div>
            {notPrayedThis.length === 0 ? (
              <div style={S.allPrayedBanner}>
                <Heart size={22} fill={C.accent} color={C.accent} />
                <span style={S.allPrayedText}>Everyone prayed for this week!</span>
              </div>
            ) : notPrayedThis.map(p => (
              <div key={p.id} onClick={() => goToPerson(p.id)} style={{ ...S.weekRow, cursor: "pointer" }}>
                <div>
                  <div style={{ ...S.weekName, color: C.muted }}>{p.name}</div>
                  {p.prayedAt && <div style={S.weekMeta}>Last: {timeAgo(p.prayedAt)}</div>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {p.group && <span style={{ ...S.badgeSm, ...(p.group === "hs" ? S.hsBadgeSm : S.msBadgeSm) }}>{p.group.toUpperCase()}</span>}
                  <span style={{ ...S.badgeSm, ...(p.type === "leader" ? S.leaderBadgeSm : S.studentBadgeSm) }}>{p.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── PEOPLE ─── */}
      {view === "people" && (
        <div style={S.peopleWrap}>
          {/* ── Add person form ── */}
          <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px", display:"flex", flexDirection:"column", gap:8, marginBottom:4 }}>
            <p style={{ margin:0, fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600 }}>Add Person</p>
            <input value={addName} onChange={e => setAddName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPerson()} placeholder="Full name" style={{ ...S.addInput, margin:0 }} />
            <div style={{ display:"flex", gap:8 }}>
              <select value={addType} onChange={e => { setAddType(e.target.value); }} style={{ ...S.addTypeSelect, flex:1 }}>
                <option value="student">Student</option>
                <option value="leader">Leader</option>
              </select>
              <select value={addGroup} onChange={e => setAddGroup(e.target.value)} style={{ ...S.addTypeSelect, flex:1 }}>
                <option value="hs">HS</option>
                <option value="ms">MS</option>
              </select>
              {addType === "student" && (
                <select value={addGrade} onChange={e => { const g = e.target.value; setAddGrade(g); if (g) setAddGroup(Number(g) >= 9 ? "hs" : "ms"); }} style={{ ...S.addTypeSelect, flex:1 }}>
                  <option value="">Grade</option>
                  {[5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={addBday} onChange={e => setAddBday(e.target.value)} placeholder="Birthday MM-DD (optional)" style={{ ...S.addInput, flex:1, margin:0, fontSize:13 }} />
              <button onClick={addPerson} style={{ ...S.addPersonBtn, width:44, height:44 }}><Plus size={18} /></button>
            </div>
          </div>

          <div style={S.statRow}>
            {[[`${activePeople.length}`, "total"], [`${activePeople.filter(p => p.group === "hs").length}`, "HS"], [`${activePeople.filter(p => p.group === "ms").length}`, "MS"], [`${prayedCount}`, "prayed ✓"]].map(([n, l]) => (
              <div key={l} style={S.statChip}><span style={S.statNum}>{n}</span><span style={S.statLbl}>{l}</span></div>
            ))}
          </div>

          {/* Type filter */}
          <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:6 }}>
            {[["all","All"],["student","Students"],["leader","Leaders"]].map(([val, label]) => (
              <button key={val} onClick={() => setPeopleTypeFilter(val)} style={{ background:"none", border:"none", borderBottom: peopleTypeFilter === val ? `2px solid ${C.accent}` : "2px solid transparent", color: peopleTypeFilter === val ? C.cream : C.muted, fontSize:13, fontWeight: peopleTypeFilter === val ? 500 : 400, padding:"2px 0", cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…" style={{ ...S.addInput, marginBottom: 4 }} />
          <div style={{ display:"flex", gap:16, marginBottom:10, justifyContent:"center" }}>
            {[["name","A–Z"],["group","MS/HS"],["grade","Grade"],["birthday","Birthday"]].map(([val, label]) => (
              <button key={val} onClick={() => setPeopleSort(val)} style={{ background:"none", border:"none", borderBottom: peopleSort === val ? `2px solid ${C.accent}` : "2px solid transparent", color: peopleSort === val ? C.cream : C.muted, fontSize:13, fontWeight: peopleSort === val ? 500 : 400, padding:"2px 0", cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", transition:"color 0.15s" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={S.personList}>
            {activePeople.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (peopleTypeFilter === "all" || p.type === peopleTypeFilter)).slice().sort((a, b) => {
              if (peopleSort === "group") {
                const ga = a.group === "ms" ? 0 : a.group === "hs" ? 1 : 2;
                const gb = b.group === "ms" ? 0 : b.group === "hs" ? 1 : 2;
                return ga !== gb ? ga - gb : a.name.localeCompare(b.name);
              }
              if (peopleSort === "grade") {
                if (a.type === "leader" && b.type !== "leader") return 1;
                if (a.type !== "leader" && b.type === "leader") return -1;
                const ga = Number(a.grade) || 99;
                const gb = Number(b.grade) || 99;
                return ga !== gb ? ga - gb : a.name.localeCompare(b.name);
              }
              if (peopleSort === "birthday") {
                const ma = a.birthday ? parseInt(a.birthday.split("-")[0] || "99") : 99;
                const da = a.birthday ? parseInt(a.birthday.split("-")[1] || "99") : 99;
                const mb = b.birthday ? parseInt(b.birthday.split("-")[0] || "99") : 99;
                const db = b.birthday ? parseInt(b.birthday.split("-")[1] || "99") : 99;
                return ma !== mb ? ma - mb : da !== db ? da - db : a.name.localeCompare(b.name);
              }
              return a.name.localeCompare(b.name);
            }).map(p => (
              <div key={p.id} style={S.personCard}>
                <div style={S.personRow}>
                  <div style={S.personLeft}>
                    {editNameFor === p.id ? (
                      <div style={S.nameEditRow}>
                        <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveName(p.id); if (e.key === "Escape") setEditNameFor(null); }}
                          style={S.nameInput} />
                        <button onClick={() => saveName(p.id)} style={S.reqAddBtn}>Save</button>
                        <button onClick={() => setEditNameFor(null)} style={S.reqCancelBtn}><X size={12} /></button>
                      </div>
                    ) : (
                      <div style={S.nameRow}>
                        <span style={S.personName}>{p.name}</span>
                        <button onClick={() => { setEditNameFor(p.id); setNameInput(p.name); setEditBdayFor(null); }} style={S.editNameBtn} title="Edit name">✎</button>
                      </div>
                    )}
                    <div style={S.personMeta}>
                      <span style={{ ...S.badgeSm, ...(p.type === "leader" ? S.leaderBadgeSm : S.studentBadgeSm) }}>{p.type}</span>
                      {p.group && <span style={{ ...S.badgeSm, ...(p.group === "hs" ? S.hsBadgeSm : S.msBadgeSm) }}>{p.group.toUpperCase()}</span>}
                      {p.type === "student" && p.grade && <span style={S.gradeBadge}>{ordinal(p.grade)} Gr</span>}
                      {withinWeek(p.prayedAt) && <span style={S.prayedSmall}>✓ prayed</span>}
                      {(p.prayerRequests || []).length > 0 && <span style={S.reqCountBadge}>{p.prayerRequests.length} req</span>}
                      {p.birthday && <span style={S.bdayBadgeSm}><Cake size={9} style={{ marginRight: 3 }} />{formatBirthday(p.birthday)}</span>}
                    </div>
                  </div>
                  <div style={S.personActions}>
                    <button onClick={() => { setEditBdayFor(editBdayFor === p.id ? null : p.id); setBdayInput(p.birthday || ""); setEditNameFor(null); }}
                      style={{ ...S.iconBtn, color: p.birthday ? C.accent : C.muted }} title="Set birthday"><Cake size={13} /></button>
                    <button onClick={() => cycleGroup(p.id)} style={{ ...S.iconBtn, color: p.group === "hs" ? "#7aafc4" : p.group === "ms" ? "#8eba95" : C.muted }} title="Cycle HS/MS/none">
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.02em" }}>{p.group ? p.group.toUpperCase() : "—"}</span>
                    </button>
                    <button onClick={() => toggleType(p.id)} style={S.iconBtn} title="Toggle role"><RefreshCw size={13} /></button>
                    <button onClick={() => deactivate(p.id)} style={{ ...S.iconBtn, color: C.muted }} title="Make inactive"><Trash2 size={13} /></button>
                  </div>
                </div>
                {editBdayFor === p.id && (
                  <div style={S.bdayEditRow}>
                    <Cake size={13} style={{ color: C.accent, flexShrink: 0 }} />
                    <input autoFocus value={bdayInput} onChange={e => setBdayInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveBirthday(p.id, parseBirthdayStr(bdayInput)); if (e.key === "Escape") setEditBdayFor(null); }}
                      placeholder="MM-DD  e.g. 03-15" style={S.bdayInput} />
                    <button onClick={() => saveBirthday(p.id, parseBirthdayStr(bdayInput))} style={S.reqAddBtn}>Save</button>
                    {p.birthday && <button onClick={() => saveBirthday(p.id, "")} style={S.reqCancelBtn} title="Clear"><X size={12} /></button>}
                  </div>
                )}
                {p.type === "student" && (
                  <div style={S.gradeRow}>
                    <span style={S.gradeLabel}>Grade</span>
                    <select value={p.grade || ""} onChange={e => setPeople(prev => prev.map(q => q.id === p.id ? { ...q, grade: e.target.value ? Number(e.target.value) : null, updatedAt: Date.now() } : q))}
                      style={S.gradeSelect}>
                      <option value="">—</option>
                      {[5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>{`Grade ${g}`}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* End-of-year grade promotion */}
          <div style={S.promoteSection}>
            {!confirmPromo ? (
              <button onClick={() => setConfirmPromo(true)} style={S.promoteBtn}>
                🎓 End of Year — Promote All Grades
              </button>
            ) : (
              <div style={S.promoteConfirm}>
                <p style={S.promoteConfirmText}>Move every student up one grade? 12th graders will be made inactive.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={promoteGrades} style={S.confirmBtn}>Yes, Promote</button>
                  <button onClick={() => setConfirmPromo(false)} style={S.cancelBtn}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {people.filter(p => p.active === false).length > 0 && (
            <div style={S.inactiveSection}>
              <p style={S.inactiveHeading}>Inactive</p>
              {people.filter(p => p.active === false).map(p => (
                <div key={p.id} style={S.inactiveRow}>
                  <span style={S.inactiveName}>{p.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => restore(p.id)} style={S.restoreBtn}>Restore</button>
                    <button onClick={() => deletePerm(p.id)} style={S.deleteBtn}>Delete</button>
                  </div>
                </div>
              ))}
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:8 }}>
              {!confirmClearInactive ? (
                <button onClick={() => setConfirmClearInactive(true)} style={{ background:"none", border:"none", color:"#8a5050", fontSize:12, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
                  Clear all inactive…
                </button>
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:C.muted }}>Remove all inactive?</span>
                  <button onClick={clearAllInactive} style={{ background:"#8a5050", border:"none", color:"#fff", borderRadius:6, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>Yes, clear</button>
                  <button onClick={() => setConfirmClearInactive(false)} style={S.cancelBtn}>Cancel</button>
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      )}


      {/* ─── ROSTER ─── */}
      {view === "roster" && (
        <div style={S.importWrap}>
          {/* Group filter */}
          <div style={{ display:"flex", gap:0, marginBottom:12, borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
            {[["all","All"],["ms","MS"],["hs","HS"],["leader","Leaders"]].map(([val, label]) => (
              <button key={val} onClick={() => setRosterGroup(val)} style={{ flex:1, background: rosterGroup === val ? C.accent : C.surface, border:"none", color: rosterGroup === val ? "#fff" : C.muted, padding:"9px 0", fontSize:13, fontWeight: rosterGroup === val ? 600 : 400, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", transition:"background 0.15s" }}>
                {label}
              </button>
            ))}
          </div>

          {/* Sort filter */}
          <div style={{ display:"flex", gap:16, marginBottom:12, justifyContent:"center" }}>
            {[["name","A–Z"],["grade","Grade"],["birthday","Birthday"]].map(([val, label]) => (
              <button key={val} onClick={() => setRosterSort(val)} style={{ background:"none", border:"none", borderBottom: rosterSort === val ? `2px solid ${C.accent}` : "2px solid transparent", color: rosterSort === val ? C.cream : C.muted, fontSize:13, fontWeight: rosterSort === val ? 500 : 400, padding:"2px 0", cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
                {label}
              </button>
            ))}
          </div>

          {/* People list */}
          <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
            {activePeople
              .filter(p => rosterGroup === "all" ? true : rosterGroup === "leader" ? p.type === "leader" : p.group === rosterGroup && p.type === "student")
              .slice().sort((a, b) => {
                if (rosterSort === "grade") {
                  const ga = Number(a.grade) || 99;
                  const gb = Number(b.grade) || 99;
                  return ga !== gb ? ga - gb : a.name.localeCompare(b.name);
                }
                if (rosterSort === "birthday") {
                  // Sort by days until next birthday (soonest first, just-passed at end)
                  const daysUntil = (bday) => {
                    if (!bday) return 9999;
                    const [m, d] = bday.split("-").map(Number);
                    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
                    const thisYear = new Date(now.getFullYear(), m - 1, d);
                    let diff = Math.ceil((thisYear - now) / 86400000);
                    if (diff < 0) diff += 365; // already passed this year — push to end
                    return diff;
                  };
                  const da = daysUntil(a.birthday);
                  const db = daysUntil(b.birthday);
                  return da !== db ? da - db : a.name.localeCompare(b.name);
                }
                return a.name.localeCompare(b.name);
              })
              .map(p => {
                const bdayFmt = p.birthday ? (() => { const [m, d] = p.birthday.split("-"); const date = new Date(2000, parseInt(m)-1, parseInt(d)); return date.toLocaleDateString("en-US", { month:"short", day:"numeric" }); })() : null;
                return (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", padding:"11px 14px", background:C.surface, borderRadius:8, gap:12 }}>
                    {/* Photo */}

                    {/* Text — left aligned below name */}
                    <div style={{ display:"flex", flexDirection:"column", gap:3, flex:1, minWidth:0 }}>
                      <span style={{ fontSize:15, color:C.cream, fontFamily:"'Lora', Georgia, serif" }}>{p.name}</span>
                      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {p.type === "student" && p.grade && (
                          <span style={{ fontSize:13, color:C.muted, fontWeight:600 }}>{ordinal(p.grade)} Grade</span>
                        )}
                        {p.type === "leader" && p.group && (
                          <span style={{ fontSize:13, color:C.muted, fontWeight:600 }}>{p.group.toUpperCase()}</span>
                        )}
                        {bdayFmt && <span style={{ fontSize:13, color:C.muted, display:"flex", alignItems:"center", gap:3 }}><Cake size={12} />{bdayFmt}</span>}
                      </div>
                    </div>
                    {/* Group badge */}
                    {p.group && <span style={{ fontSize:10, fontWeight:600, color: p.group === "hs" ? "#7aafc4" : C.accent, background: p.group === "hs" ? C.studentBg : C.accentBg, borderRadius:6, padding:"2px 7px", flexShrink:0 }}>{p.group.toUpperCase()}</span>}
                  </div>
                );
              })
            }
            {activePeople.filter(p => rosterGroup === "all" ? true : rosterGroup === "leader" ? p.type === "leader" : p.group === rosterGroup && p.type === "student").length === 0 && (
              <p style={{ textAlign:"center", color:C.muted, fontSize:13, padding:"32px 0" }}>No one in this group yet.</p>
            )}
          </div>
        </div>
      )}


      {/* ─── REPORT ─── */}
      {view === "report" && (
        <div style={S.importWrap}>
          <div style={S.reportBox}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}><BarChart2 size={16} color={C.accent} /><p style={{ ...S.reportTitle, margin:0 }}>Weekly Prayer Report</p></div>
              <div style={{ display:"flex", gap:12 }}>
                <button onClick={recalculateHistory} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
                  recalculate
                </button>
                {weekHistory.length > 0 && (
                  <button onClick={async () => { setWeekHistory([]); await apiSaveHistory([]); }} style={{ background:"none", border:"none", color:C.muted, fontSize:11, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif" }}>
                    clear
                  </button>
                )}
              </div>
            </div>
            {weekHistory.length === 0 ? (
              <p style={S.reportEmpty}>Data will appear here after the first Monday reset.</p>
            ) : weekHistory.map((w, i) => {
              const pct = w.total > 0 ? Math.round((w.count / w.total) * 100) : 0;
              const weekEndTs = w.weekStart - 1;
              const label = i === 0
                ? `${getWeekLabel(w.prevWeekStart)} – ${getWeekLabel(weekEndTs)} (last week)`
                : `${getWeekLabel(w.prevWeekStart)} – ${getWeekLabel(weekEndTs)}`;
              return (
                <div key={w.weekStart} style={S.reportRow}>
                  <div style={S.reportRowTop}>
                    <span style={S.reportWeekLabel}>{label}</span>
                    <span style={S.reportCount}>{w.count} / {w.total}</span>
                  </div>
                  <div style={S.reportBar}>
                    <div style={{ ...S.reportBarFill, width: `${pct}%` }} />
                  </div>
                  <span style={S.reportPct}>{pct}% prayed for</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── IMPORT ─── */}
      {view === "import" && (
        <div style={S.importWrap}>
          {/* Export */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12 }}>
            <div>
              <p style={{ margin:0, fontSize:14, color:C.cream, fontWeight:500 }}>Export Roster</p>
              <p style={{ margin:"2px 0 0", fontSize:12, color:C.muted }}>Download all active people as a CSV</p>
            </div>
            <button onClick={exportRoster} style={{ background:C.accent, border:"none", color:"#fff", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Inter', system-ui, sans-serif", display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <Upload size={14} />Export
            </button>
          </div>

          <h3 style={S.importTitle}>Import CSV</h3>
          <p style={S.importDesc}>
            Just export whatever roster you already have. The importer only looks for name and birthday columns — everything else is ignored.
          </p>

          <div style={S.importRulesBox}>
            <div style={S.importRule}>
              <span style={{ ...S.importRuleIcon, fontFamily:"monospace", fontSize:13 }}>ID</span>
              <div>
                <strong style={{ color: C.cream }}>Names</strong> — recognizes columns like <code style={S.code}>Name</code>, <code style={S.code}>First Name</code>, <code style={S.code}>Last Name</code>, <code style={S.code}>Student</code>. Separate first/last columns are joined automatically. "Smith, John" format is flipped to "John Smith".
              </div>
            </div>
            <div style={S.importRule}>
              <Cake size={16} color={C.muted} style={{ flexShrink:0, marginTop:2 }} />
              <div>
                <strong style={{ color: C.cream }}>Birthdays</strong> — recognizes <code style={S.code}>Birthday</code>, <code style={S.code}>DOB</code>, <code style={S.code}>Birthdate</code>. Accepts MM/DD, MM-DD, or "March 15".
              </div>
            </div>
            <div style={S.importRule}>
              <span style={{ ...S.importRuleIcon, fontFamily:"monospace", fontSize:13 }}>ST</span>
              <div>All imported people start as <strong style={{ color: C.cream }}>Students</strong>. Change roles in the People tab after importing.</div>
            </div>
          </div>

          <pre style={S.csvPreview}>{`Last Name,First Name,Grade,Email,DOB\nSmith,John,10,j@school.edu,03/15\nLee,Sarah,11,s@school.edu,11-02\nBrown,Mike,9,,`}</pre>
          <p style={S.importNote}>Above: a messy real-world export — Grade and Email columns are simply ignored.</p>

          <button onClick={() => fileRef.current.click()} style={S.uploadBtn}>
            <Upload size={16} style={{ marginRight: 8 }} /> Choose File
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />

          {importData && (
            <div style={S.previewBox}>
              <p style={S.previewTitle}>Preview — {importData.length} people found</p>
              <div style={S.previewScroll}>
                {importData.slice(0, 12).map((p, i) => (
                  <div key={i} style={S.previewRow}>
                    <span style={S.previewName}>{p.name}</span>
                    {p.birthday
                      ? <span style={S.bdayBadgeSm}><Cake size={9} style={{ marginRight: 3 }} />{formatBirthday(p.birthday)}</span>
                      : <span style={{ fontSize: 11, color: C.faint }}>no birthday</span>
                    }
                  </div>
                ))}
                {importData.length > 12 && <p style={S.moreText}>and {importData.length - 12} more</p>}
              </div>
              <div style={S.previewBtnRow}>
                <button onClick={confirmImport} style={S.confirmBtn}>Import All</button>
                <button onClick={() => setImportData(null)} style={S.cancelBtn}>Cancel</button>
              </div>
            </div>
          )}


        </div>
      )}
      {/* Admin footer link */}
      <div style={S.adminFooter}>
        {adminAuthed
          ? <button onClick={() => { setAdminAuthedState(false); localStorage.removeItem(ADMIN_KEY); setView("pray"); }} style={S.adminLink}>lock admin</button>
          : <button onClick={() => { setAdminPwInput(""); setAdminPwError(""); setShowAdminPrompt(true); }} style={S.adminLink}>admin</button>
        }
      </div>
    </div>
  );
}

/* ── Colors ─────────────────────────────────────────────── */
const C = {
  bg: "#1a1c1e",        // deep charcoal
  surface: "#222527",   // slightly lighter charcoal
  card: "#272b2e",      // card surface
  border: "#333839",    // subtle border
  accent: "#6b9e78",    // sage green
  accentLight: "#8eba95", // lighter sage
  accentBg: "#1e2820",  // sage tinted bg
  cream: "#e8e0d4",     // warm white
  muted: "#7a8082",     // cool grey
  faint: "#2e3235",     // very dark grey
  student: "#5b8fa8",   // steel blue
  studentBg: "#1a262e", // dark blue
  leader: "#6b9e78",    // sage (same as accent)
  leaderBg: "#1e2820",
  prayedGreen: "#6b9e78",
  prayedBg: "#1e2820",
};

/* ── Styles ─────────────────────────────────────────────── */
const S = {
  root: { minHeight: "100vh", background: C.bg, color: C.cream, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 0" },
  logoWrap: { display: "flex", alignItems: "center", gap: 8 },
  logoCross: { fontSize: 18, color: C.accent },
  logoText: { fontFamily: "'Lora', Georgia, serif", fontSize: 24, fontWeight: 600, color: C.cream, letterSpacing: "0.01em" },
  weekBar: { display: "flex", alignItems: "center", gap: 6, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px" },
  weekText: { fontSize: 12, color: C.muted },
  bdayAlert: { fontSize: 11, background: C.faint, color: C.accent, borderRadius: 10, padding: "2px 7px 2px 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, verticalAlign: "middle" },
  progressTrack: { margin: "14px 20px 0", height: 3, background: C.faint, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.6s ease" },
  tabs: { display: "flex", borderBottom: `1px solid ${C.border}`, margin: "14px 0 0" },
  tab: { flex: 1, background: "none", border: "none", color: C.muted, padding: "10px 0", cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 400, letterSpacing: "0.04em", transition: "color 0.2s" },
  tabActive: { color: C.cream, borderBottom: `2px solid ${C.accent}`, marginBottom: -1, fontWeight: 600 },
  // PRAY
  prayWrap: { flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px 28px" },
  controls: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  togglePill: { display: "flex", background: C.faint, borderRadius: 20, padding: 2 },
  toggleOpt: { background: "none", border: "none", color: C.muted, padding: "5px 14px", borderRadius: 18, cursor: "pointer", fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif", transition: "all 0.2s" },
  toggleOptOn: { background: C.surface, color: C.cream, fontWeight: 500 },
  filterSelect: { background: C.faint, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer", outline: "none", flex: 1 },
  reshuffleBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 20, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  bdayDismiss: { position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.border, cursor:"pointer", fontSize:14, padding:"4px 6px", lineHeight:1 },
  bdayBanner: { background: C.faint, border: `1px solid ${C.accent}`, borderRadius: 12, color: C.accentLight, padding: "12px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", textAlign: "center", width: "100%", marginBottom: 8, animation: "bdayGlow 1.6s ease-in-out infinite" },
  swipeHint: { fontSize: 11, color: C.faint, textAlign: "center", marginBottom: 8, letterSpacing: "0.05em" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 60 },
  emptyTitle: { fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.muted, margin: 0 },
  emptySub: { fontSize: 13, color: C.faint, margin: 0, textAlign: "center" },
  cardOuter: { position: "relative", margin: "0 0 20px", touchAction: "pan-y" },
  cardGhost: { position: "absolute", inset: 0, background: "#242729", borderRadius: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" },
  card: { position: "relative", backgroundColor: C.card, background: `repeating-linear-gradient(${C.card}, ${C.card} 27px, #2e3235 27px, #2e3235 28px)`, backgroundPositionY: "52px", border: "1px solid rgba(255,255,255,0.06)", borderTop: `1px solid ${C.accent}33`, borderRadius: 16, padding: "28px 24px 22px", display: "flex", flexDirection: "column", gap: 0, boxShadow: `0 2px 0 ${C.accent}18 inset, 0 12px 48px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)`, userSelect: "none", willChange: "transform" },
  cardDone: { background: "#1d2620", border: "1px solid rgba(107,158,120,0.2)", borderTop: "1px solid rgba(107,158,120,0.35)" },
  badge: { display: "inline-flex", alignSelf: "flex-start", padding: "3px 11px", borderRadius: 12, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 },
  studentBadge: { background: C.studentBg, color: C.student, border: `1px solid ${C.student}33` },
  leaderBadge: { background: C.leaderBg, color: C.leader, border: `1px solid ${C.leader}33` },
  cardName: { fontFamily: "'Lora', Georgia, serif", fontSize: 34, fontWeight: 500, lineHeight: 1.2, color: C.cream, margin: "6px 0 12px", letterSpacing: "-0.01em" },
  bdayChip: { display: "inline-flex", alignItems: "center", background: C.faint, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 10, padding: "5px 12px", fontSize: 14, marginBottom: 12, gap: 4 },
  bdayChipUrgent: { background: C.accentBg, border: `1px solid ${C.accent}`, color: C.accentLight, fontWeight: 500 },
  bdayQuiet: { display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: C.muted, marginBottom: 10 },
  cardPrayedRow: { marginBottom: 18, marginTop: 4 },
  prayedChip: { fontSize: 12, color: C.prayedGreen, background: C.accentBg, padding: "3px 10px", borderRadius: 10 },
  lastPrayedChip: { fontSize: 13, color: C.muted, lineHeight: 1.4 },
  neverChip: { fontSize: 13, color: C.muted, fontStyle: "italic" },
  reqBox: { background: C.faint, borderRadius: 10, padding: "12px 14px", marginBottom: 14 },
  reqLabel: { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" },
  reqItem: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  reqDot: { color: C.accent, fontSize: 8, marginTop: 3, flexShrink: 0 },
  reqText: { flex: 1, fontSize: 13, color: C.cream, lineHeight: 1.4 },
  reqRemove: { background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 },
  reqInputRow: { display: "flex", gap: 6, alignItems: "center", marginTop: 4 },
  reqInput: { flex: 1, background: C.faint, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, padding: "7px 10px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" },
  reqAddBtn: { background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  reqCancelBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  addReqTrigger: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", alignSelf: "flex-start", marginTop: 8, fontFamily: "'Inter', system-ui, sans-serif" },
  navRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 16 },
  navArrow: { background: C.surface, border: `1px solid ${C.border}`, color: C.muted, borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  counter: { fontFamily: "'Lora', Georgia, serif", fontSize: 18, color: C.muted, minWidth: 60, textAlign: "center" },
  prayBtn: { background: C.accent, border: "none", color: "#fff", borderRadius: 12, padding: "14px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", boxShadow: `0 4px 24px rgba(107,158,120,0.4)`, letterSpacing: "0.02em" },
  prayedActions: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12 },
  prayedConfirm: { display: "flex", alignItems: "center", color: C.prayedGreen, fontSize: 15, fontWeight: 500 },
  undoBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  // WEEK
  weekWrap: { flex: 1, padding: "16px 20px 32px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" },
  weekTitle: { fontFamily: "'Lora', Georgia, serif", fontSize: 28, color: C.cream, margin: 0, fontWeight: 400 },
  weekSection: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" },
  sectionHead: { display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg },
  sectionTitle: { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 500 },
  weekRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.faint}` },
  weekName: { fontSize: 14, color: C.cream },
  weekMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  weekEmpty: { fontSize: 13, color: C.faint, padding: "16px 14px", margin: 0, textAlign: "center", fontStyle: "italic" },
  allPrayedBanner: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "22px 14px" },
  allPrayedText: { fontFamily: "'Lora', Georgia, serif", fontSize: 18, color: C.accent, textAlign: "center" },
  // PEOPLE
  peopleWrap: { flex: 1, padding: "16px 20px 28px", display: "flex", flexDirection: "column", gap: 10 },
  addRow: { display: "flex", gap: 8 },
  addInput: { flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.cream, padding: "10px 12px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" },
  addTypeSelect: { background: C.surface, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: "10px 10px", fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer", outline: "none" },
  addPersonBtn: { background: C.accent, border: "none", color: "#fff", borderRadius: 10, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  statRow: { display: "flex", gap: 6 },
  statChip: { flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  statNum: { fontSize: 18, fontFamily: "'Lora', Georgia, serif", color: C.cream },
  statLbl: { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" },
  personList: { display: "flex", flexDirection: "column", gap: 4 },
  personCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" },
  personRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px" },
  personLeft: { display: "flex", flexDirection: "column", gap: 4 },
  personName: { fontSize: 14, color: C.cream },
  personMeta: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  badgeSm: { fontSize: 10, padding: "2px 8px", borderRadius: 8, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 },
  studentBadgeSm: { background: C.studentBg, color: C.student },
  leaderBadgeSm: { background: C.leaderBg, color: C.leader },
  prayedSmall: { fontSize: 11, color: C.prayedGreen },
  reqCountBadge: { fontSize: 11, color: C.accent, background: C.faint, padding: "1px 7px", borderRadius: 8 },
  bdayBadgeSm: { display: "inline-flex", alignItems: "center", fontSize: 10, color: C.muted, background: C.faint, padding: "1px 7px", borderRadius: 8 },
  personActions: { display: "flex", gap: 6 },
  iconBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  gradeBadge: { fontSize: 10, padding: "2px 7px", borderRadius: 8, background: C.faint, color: C.muted, fontWeight: 500 },
  gradeBadgeLg: { background: C.faint, color: C.muted, border: `1px solid ${C.border}`, marginBottom: 0 },
  gradeRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderTop: `1px solid ${C.faint}`, background: C.surface },
  gradeLabel: { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 },
  gradeSelect: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.cream, padding: "4px 8px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer", outline: "none" },
  promoteSection: { marginTop: 4 },
  promoteBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: "11px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", width: "100%", textAlign: "left" },
  promoteConfirm: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 },
  promoteConfirmText: { fontSize: 13, color: C.cream, margin: 0, lineHeight: 1.5 },
  nameRow: { display: "flex", alignItems: "center", gap: 6 },
  editNameBtn: { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 },
  nameEditRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 2 },
  nameInput: { flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, padding: "5px 8px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", outline: "none", minWidth: 0 },
  bdayEditRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.faint}`, background: C.surface },
  bdayInput: { flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, padding: "6px 10px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" },
  inactiveSection: { marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  inactiveHeading: { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" },
  inactiveRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.faint}` },
  inactiveName: { fontSize: 13, color: C.muted },
  restoreBtn: { background: "none", border: `1px solid ${C.border}`, color: C.leader, borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  deleteBtn: { background: "none", border: `1px solid rgba(138,80,80,0.4)`, color: "#8a5050", borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  // IMPORT
  importWrap: { flex: 1, padding: "16px 20px 28px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" },
  importTitle: { fontFamily: "'Lora', Georgia, serif", fontSize: 26, color: C.cream, margin: 0, fontWeight: 400 },
  importDesc: { fontSize: 13, color: C.muted, margin: 0 },
  importNote: { fontSize: 12, color: C.muted, margin: "0" },
  importRulesBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 0", display: "flex", flexDirection: "column" },
  importRule: { display: "flex", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${C.faint}`, fontSize: 12, color: C.muted, lineHeight: 1.5, alignItems: "flex-start" },
  importRuleIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  code: { background: C.faint, padding: "1px 6px", borderRadius: 4, fontSize: 11, color: C.accent, fontFamily: "monospace" },
  csvPreview: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6, fontFamily: "monospace", overflowX: "auto" },
  uploadBtn: { background: C.surface, border: `1px solid ${C.border}`, color: C.cream, borderRadius: 10, padding: "12px 20px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "'Inter', system-ui, sans-serif", alignSelf: "flex-start" },
  previewBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" },
  previewTitle: { fontSize: 12, color: C.muted, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" },
  previewScroll: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" },
  previewRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.faint}` },
  previewName: { fontSize: 13, color: C.cream },
  moreText: { fontSize: 12, color: C.muted, margin: "6px 0 0", textAlign: "center" },
  previewBtnRow: { display: "flex", gap: 8, marginTop: 12 },
  confirmBtn: { background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  cancelBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  // WEEKLY REPORT
  reportBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px" },
  reportTitle: { fontSize: 13, color: C.accent, fontWeight: 500, margin: "0 0 12px" },
  reportEmpty: { fontSize: 12, color: C.muted, margin: 0, fontStyle: "italic" },
  reportRow: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 },
  reportRowTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  reportWeekLabel: { fontSize: 12, color: C.muted },
  reportCount: { fontSize: 16, fontFamily: "'Lora', Georgia, serif", color: C.cream },
  reportBar: { height: 6, background: C.faint, borderRadius: 3, overflow: "hidden" },
  reportBarFill: { height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.accentLight})`, borderRadius: 3, transition: "width 0.6s ease" },
  reportPct: { fontSize: 11, color: C.muted },
  // REMINDERS
  reminderSection: { margin: "16px 20px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 },
  reminderSetupBtn: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, padding: "10px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", textAlign: "left" },
  iosDismiss: { background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", alignSelf: "flex-start", marginTop: 4 },
  timeInput: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.cream, padding: "6px 10px", fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", outline: "none", cursor: "pointer" },
    reminderOffBtn: { background: "none", border: `1px solid ${C.border}`, color: "#8a5050", borderRadius: 10, padding: "9px 0", fontSize: 12, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif" },
  // ADMIN FOOTER
  adminFooter: { display: "flex", justifyContent: "center", padding: "12px 0 20px", marginTop: "auto" },
  adminLink: { background: "none", border: "none", color: C.border, fontSize: 11, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.06em" },
  // MODAL
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 },
  modalBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 14 },
  modalTitle: { fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.cream, margin: 0, textAlign: "center" },
  modalInput: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.cream, padding: "12px 14px", fontSize: 16, fontFamily: "'Inter', system-ui, sans-serif", outline: "none", textAlign: "center", letterSpacing: "0.08em" },
  modalError: { fontSize: 12, color: "#c07070", margin: 0, textAlign: "center" },
  modalBtns: { display: "flex", gap: 8 },
  // DROPDOWN
  ddWrap: { marginTop: 12, display: "flex", flexDirection: "column" },
  ddToggle: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, padding: "10px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", justifyContent: "space-between", alignItems: "center" },
  ddList: { background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column" },
  ddItem: { background: "none", border: "none", borderBottom: `1px solid ${C.faint}`, color: C.cream, padding: "11px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left" },
  ddItemPrayed: { color: C.muted },
  ddItemMeta: { fontSize: 11, color: C.muted, marginLeft: 8, flexShrink: 0, background: C.faint, borderRadius: 6, padding: "2px 7px" },
  // TAP TO BEGIN
  tapCard: { cursor: "pointer", alignItems: "center", justifyContent: "center", minHeight: 220, gap: 10, animation: "tapPulse 2s ease-in-out infinite" },
  tapCross: { fontSize: 28, color: C.accent, marginBottom: 8 },
  tapTitle: { fontFamily: "'Lora', Georgia, serif", fontSize: 36, fontWeight: 400, color: C.cream, margin: 0, textAlign: "center" },
  tapSub: { fontSize: 13, color: C.muted, margin: 0, textAlign: "center" },
  // GROUP BADGES
  badgeRow: { display: "flex", gap: 6, marginBottom: 14 },
  hsBadge: { background: C.studentBg, color: "#7aafc4", border: "1px solid #7aafc433", marginBottom: 0 },
  msBadge: { background: C.faint, color: "#8eba95", border: "1px solid #6b9e7833", marginBottom: 0 },
  hsBadgeSm: { background: C.studentBg, color: "#7aafc4" },
  msBadgeSm: { background: C.faint, color: "#8eba95" },
};
