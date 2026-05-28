const STORE_KEY = "gymWarden.v02";
const OLD_KEYS = ["gymWarden.v01"];
const DEFAULT_STATE = {
  settings: {
    weeklyTarget: 4,
    penalty: 50,
    weekStartsOn: 1,
    accountabilityContacts: ""
  },
  logs: {},
  weekAdjustments: {}
};

let state = loadState();
let todayKey = dateKey(new Date());
let selectedStartDataUrl = null;
let selectedEndDataUrl = null;

function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0,0,0,0); return x; }
function formatShort(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function weekStart(d = new Date()) {
  const startOn = Number(state.settings.weekStartsOn ?? 1);
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const diff = (x.getDay() - startOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function weekIdForDate(d = new Date()) { return dateKey(weekStart(d)); }
function weekRangeFromStart(start) { return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i))); }
function currentWeekKeys() { return weekRangeFromStart(weekStart(new Date())); }
function weekEnd(start) { const e = addDays(start, 6); e.setHours(23,59,59,999); return e; }
function isPastWeek(start) { return new Date() > weekEnd(start); }
function safeClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return mergeState(JSON.parse(raw));
    for (const key of OLD_KEYS) {
      const oldRaw = localStorage.getItem(key);
      if (oldRaw) return migrateOldState(JSON.parse(oldRaw));
    }
  } catch {}
  return safeClone(DEFAULT_STATE);
}
function mergeState(parsed) {
  return {
    ...safeClone(DEFAULT_STATE),
    ...parsed,
    settings: { ...safeClone(DEFAULT_STATE).settings, ...(parsed.settings || {}) },
    logs: parsed.logs || parsed.sessions || {},
    weekAdjustments: parsed.weekAdjustments || {}
  };
}
function migrateOldState(old) {
  const next = safeClone(DEFAULT_STATE);
  next.settings.penalty = 50;
  if (old.sessions) {
    Object.values(old.sessions).forEach(s => {
      if (!s?.date) return;
      next.logs[s.date] = {
        date: s.date,
        status: s.status === "completed" ? "completed" : s.status,
        mode: s.mode || "full",
        startProof: s.startProof,
        endProof: s.endProof,
        notes: s.notes || s.note || "",
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        migratedFromV01: true
      };
    });
  }
  saveSpecific(next);
  return next;
}
function saveSpecific(value) { localStorage.setItem(STORE_KEY, JSON.stringify(value)); }
function saveState() { saveSpecific(state); }

function todayLog() { return state.logs[todayKey] || {}; }
function setTodayLog(patch) {
  state.logs[todayKey] = { ...todayLog(), date: todayKey, ...patch };
  saveState();
  render();
}
function selectedMode() { return document.querySelector("input[name='mode']:checked")?.value || "full"; }

function targetForWeek(start = weekStart(new Date())) {
  const adj = state.weekAdjustments[dateKey(start)];
  if (adj && adj.targetOverride !== null && adj.targetOverride !== undefined && adj.targetOverride !== "") {
    return Math.max(0, Number(adj.targetOverride));
  }
  return Math.max(1, Number(state.settings.weeklyTarget || 4));
}
function completedForWeek(start = weekStart(new Date())) {
  return weekRangeFromStart(start).map(k => state.logs[k]).filter(l => l?.status === "completed");
}
function weekSummary(start = weekStart(new Date())) {
  const target = targetForWeek(start);
  const completed = completedForWeek(start);
  const full = completed.filter(l => l.mode !== "emergency").length;
  const emergency = completed.filter(l => l.mode === "emergency").length;
  const remaining = Math.max(0, target - completed.length);
  const closed = isPastWeek(start);
  const missed = closed ? remaining : 0;
  const debt = missed * Number(state.settings.penalty || 0);
  const adjustment = state.weekAdjustments[dateKey(start)] || null;
  return { start, target, completed: completed.length, full, emergency, remaining, closed, missed, debt, adjustment };
}
function rollingWeekStarts(count = 8) {
  const cur = weekStart(new Date());
  return Array.from({ length: count }, (_, i) => addDays(cur, -7 * i));
}
function allClosedDebt() {
  return rollingWeekStarts(26).reduce((sum, start) => sum + weekSummary(start).debt, 0);
}

function render() {
  renderHero();
  renderToday();
  renderStats();
  renderReport();
  renderTrend();
  renderSettings();
  renderAccountabilityText();
}
function renderHero() {
  const s = weekSummary();
  const pct = s.target === 0 ? 100 : Math.min(100, Math.round((s.completed / s.target) * 100));
  $("progressFill").style.width = `${pct}%`;
  $("weekTitle").textContent = `${s.completed} of ${s.target} weight-training days completed`;
  const start = s.start;
  const end = addDays(start, 6);
  $("weekMeta").textContent = `${formatShort(start)}–${formatShort(end)} · ${s.remaining} left · $${Number(state.settings.penalty || 0)} debt per missed workout`;
  const today = todayLog();
  let pill = "Active";
  let msg = "Four flexible lifting days. No fixed Monday-glutes nonsense. Complete the target before the week closes.";
  if (s.target === 0) { pill = "Sick week"; msg = "This week is marked as skipped/recovery. No debt will be added for this week."; }
  else if (s.completed >= s.target) { pill = "Locked in"; msg = "Weekly target completed. The black cat is satisfied."; }
  else if (today.status === "started") { pill = "Proof accepted"; msg = "Start proof is logged. Finish with end proof so today counts."; }
  else if (today.status === "completed") { pill = "Done today"; msg = "Today is counted. Keep the weekly target in view."; }
  else if (s.remaining > 0) { pill = "Unfinished"; msg = `You still need ${s.remaining} weight-training day${s.remaining === 1 ? "" : "s"} this week.`; }
  $("statusPill").textContent = pill;
  $("wardenMessage").textContent = msg;
}
function renderToday() {
  const log = todayLog();
  const stateText = log.status === "completed" ? `Completed: ${log.mode || "full"}` : log.status === "started" ? "Started" : "Not started";
  $("todayState").textContent = stateText;
  $("notes").value = log.notes || "";
  $("startPreview").innerHTML = log.startProof ? `<img src="${log.startProof}" alt="Start proof" />` : "";
  $("endPreview").innerHTML = log.endProof ? `<img src="${log.endProof}" alt="End proof" />` : "";
}
function renderStats() {
  const s = weekSummary();
  $("targetCount").textContent = s.target;
  $("completedCount").textContent = s.completed;
  $("remainingCount").textContent = s.remaining;
  $("debtTotal").textContent = `$${allClosedDebt()}`;
}
function renderReport() {
  const s = weekSummary();
  const adherence = s.target === 0 ? 100 : Math.round((s.completed / s.target) * 100);
  const adjustment = s.adjustment ? `<div class="report-row"><span>Health adjustment</span><strong>${escapeHtml(s.adjustment.reason || "Adjusted")}</strong></div>` : "";
  $("weeklyReport").innerHTML = `
    <div class="report-row"><span>Target weight-training days</span><strong>${s.target}</strong></div>
    <div class="report-row"><span>Completed</span><strong>${s.completed}</strong></div>
    <div class="report-row"><span>Full / emergency</span><strong>${s.full} / ${s.emergency}</strong></div>
    <div class="report-row"><span>Remaining this week</span><strong>${s.remaining}</strong></div>
    <div class="report-row"><span>Week status</span><strong>${s.closed ? "Closed" : "Open"}</strong></div>
    <div class="report-row"><span>Adherence trend point</span><strong>${adherence}%</strong></div>
    ${adjustment}
    <div class="report-row"><span>Closed-week debt</span><strong>$${allClosedDebt()}</strong></div>`;
}
function renderTrend() {
  const rows = rollingWeekStarts(8).map(start => {
    const s = weekSummary(start);
    const adherence = s.target === 0 ? 100 : Math.round((s.completed / s.target) * 100);
    const label = `${formatShort(start)}–${formatShort(addDays(start, 6))}`;
    const status = s.target === 0 ? "Skipped" : s.completed >= s.target ? "Met" : s.closed ? "Missed" : "In progress";
    return `<div class="trend-row"><div><strong>${label}</strong><small>${s.completed}/${s.target} completed · ${s.full} full · ${s.emergency} emergency</small></div><strong>${status} · ${adherence}%</strong></div>`;
  }).join("");
  $("trendList").innerHTML = rows;
}
function renderSettings() {
  $("targetInput").value = state.settings.weeklyTarget;
  $("penaltyInput").value = state.settings.penalty;
  $("weekStartInput").value = String(state.settings.weekStartsOn ?? 1);
  $("contactsInput").value = state.settings.accountabilityContacts || "";
  const adj = state.weekAdjustments[weekIdForDate()] || {};
  $("overrideTargetInput").value = adj.targetOverride ?? "";
  $("overrideReasonInput").value = adj.reason || "Illness";
  $("overrideNoteInput").value = adj.note || "";
}
function renderAccountabilityText() { $("accountabilityText").value = accountabilityMessage(); }

function accountabilityMessage() {
  const s = weekSummary();
  const log = todayLog();
  if (log.status === "completed") {
    return `Gym Warden update: I completed a weight-training day today. Mode: ${log.mode || "full"}. Weekly progress: ${s.completed}/${s.target}. Remaining: ${s.remaining}.`;
  }
  if (s.target === 0) {
    return `Gym Warden update: this week is marked as a health/recovery skip. Reason: ${s.adjustment?.reason || "not specified"}. No workout debt should be added this week.`;
  }
  if (s.completed >= s.target) {
    return `Gym Warden weekly update: target met. Completed ${s.completed}/${s.target} weight-training days. Emergency saves: ${s.emergency}.`;
  }
  return `Gym Warden accountability: I have completed ${s.completed}/${s.target} weight-training days this week and still need ${s.remaining}. If I do not complete the weekly target, I owe $${Number(state.settings.penalty || 0)} per missed workout. Do not let me quietly skip.`;
}
function reportText(start = weekStart(new Date())) {
  const s = weekSummary(start);
  const adjustment = s.adjustment ? `\nHealth adjustment: ${s.adjustment.reason || "Adjusted"}${s.adjustment.note ? " — " + s.adjustment.note : ""}` : "";
  return `Gym Warden weekly report\nWeek: ${formatShort(start)}–${formatShort(addDays(start, 6))}\nTarget: ${s.target}\nCompleted: ${s.completed}\nFull: ${s.full}\nEmergency saves: ${s.emergency}\nRemaining: ${s.remaining}\nWeek status: ${s.closed ? "Closed" : "Open"}\nClosed-week debt total: $${allClosedDebt()}${adjustment}`;
}

async function compressImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const max = 1000;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
function showValidation(text, ok=false) {
  const el = $("validationMessage");
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--warn)";
  setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 5500);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showValidation("Copied.", true); }
  catch { showValidation("Copy failed. Select the text manually."); }
}
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch {}
  }
  await copyText(text);
}
function openSms() {
  const msg = $("accountabilityText").value;
  copyText(msg);
  const contacts = (state.settings.accountabilityContacts || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!contacts.length) return showValidation("Message copied. Add a phone number in Settings, then tap Open SMS again.", true);
  window.location.href = `sms:${contacts[0]}`;
  showValidation("Message copied. Paste it into Messages after it opens.", true);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[c]));
}

function attachEvents() {
  $("startProof").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    selectedStartDataUrl = await compressImage(file);
    $("startPreview").innerHTML = `<img src="${selectedStartDataUrl}" alt="Selected start proof" />`;
  });
  $("endProof").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    selectedEndDataUrl = await compressImage(file);
    $("endPreview").innerHTML = `<img src="${selectedEndDataUrl}" alt="Selected end proof" />`;
  });
  $("startBtn").addEventListener("click", () => {
    if (!selectedStartDataUrl && !todayLog().startProof) return showValidation("Start proof photo is required.");
    setTodayLog({ status: "started", startedAt: todayLog().startedAt || Date.now(), startProof: selectedStartDataUrl || todayLog().startProof });
    selectedStartDataUrl = null;
    showValidation("Start proof accepted. No timer. Finish with end proof when done.", true);
  });
  $("completeBtn").addEventListener("click", () => {
    const log = todayLog();
    const mode = selectedMode();
    const notes = $("notes").value.trim();
    if (!log.startProof && !selectedStartDataUrl) return showValidation("Start proof is required before completion.");
    if (!selectedEndDataUrl && !log.endProof) return showValidation("End proof photo is required.");
    if (mode === "emergency" && notes.length < 8) return showValidation("Emergency save requires a short explanation. This prevents using emergency mode as avoidance.");
    setTodayLog({
      status: "completed",
      mode,
      startedAt: log.startedAt || Date.now(),
      completedAt: Date.now(),
      startProof: log.startProof || selectedStartDataUrl,
      endProof: selectedEndDataUrl || log.endProof,
      notes
    });
    selectedStartDataUrl = null;
    selectedEndDataUrl = null;
    showValidation(mode === "emergency" ? "Emergency save counted. It is not full volume, but it prevents a skip." : "Full weight-training day counted.", true);
  });
  document.querySelectorAll("input[name='mode']").forEach(r => r.addEventListener("change", () => {
    $("modeHint").textContent = selectedMode() === "emergency"
      ? "Emergency save requires start proof, end proof, and a short explanation. It counts toward adherence but is labeled separately in your trend."
      : "Full completion requires start proof and end proof. No workout checklist and no timer.";
  }));
  $("notes").addEventListener("change", () => {
    const log = todayLog();
    if (log.status) setTodayLog({ notes: $("notes").value.trim() });
  });
  $("exceptionBtn").addEventListener("click", () => {
    showValidation("Use the Health / sick week controls below to reduce or skip this week. That keeps illness separate from avoidance.");
    document.querySelector("details:nth-of-type(2)")?.setAttribute("open", "open");
    setTimeout(() => $("overrideTargetInput")?.focus(), 50);
  });
  $("copyMessageBtn").addEventListener("click", () => copyText($("accountabilityText").value));
  $("shareMessageBtn").addEventListener("click", () => shareText($("accountabilityText").value));
  $("smsMessageBtn").addEventListener("click", openSms);
  $("copyReportBtn").addEventListener("click", () => copyText(reportText()));
  $("shareReportBtn").addEventListener("click", () => shareText(reportText()));
  $("saveSettingsBtn").addEventListener("click", () => {
    const target = Math.max(1, Math.min(7, Number($("targetInput").value || 4)));
    state.settings.weeklyTarget = target;
    state.settings.penalty = Math.max(0, Number($("penaltyInput").value || 0));
    state.settings.weekStartsOn = Number($("weekStartInput").value || 1);
    state.settings.accountabilityContacts = $("contactsInput").value.trim();
    saveState(); render(); showValidation("Settings saved.", true);
  });
  $("saveOverrideBtn").addEventListener("click", () => {
    const raw = $("overrideTargetInput").value;
    if (raw === "") return showValidation("Enter a target override, or use Clear adjustment.");
    const normal = Number(state.settings.weeklyTarget || 4);
    const targetOverride = Math.max(0, Math.min(7, Number(raw)));
    if (targetOverride > normal) return showValidation("Override should not be higher than your normal weekly target.");
    state.weekAdjustments[weekIdForDate()] = {
      targetOverride,
      reason: $("overrideReasonInput").value,
      note: $("overrideNoteInput").value.trim(),
      updatedAt: Date.now()
    };
    saveState(); render(); showValidation("Health adjustment saved for this week.", true);
  });
  $("skipWeekBtn").addEventListener("click", () => {
    if (!confirm("Skip the entire current week for health/recovery? This sets the target to 0 for this week only.")) return;
    state.weekAdjustments[weekIdForDate()] = {
      targetOverride: 0,
      reason: $("overrideReasonInput").value || "Illness",
      note: $("overrideNoteInput").value.trim(),
      updatedAt: Date.now()
    };
    saveState(); render(); showValidation("This week is marked as skipped/recovery. No debt will be added for this week.", true);
  });
  $("clearOverrideBtn").addEventListener("click", () => {
    delete state.weekAdjustments[weekIdForDate()];
    saveState(); render(); showValidation("This week is back to your normal target.", true);
  });
  $("resetTodayBtn").addEventListener("click", () => {
    if (!state.logs[todayKey]) return showValidation("No log exists for today.");
    if (confirm("Reset today's proof/completion log?")) { delete state.logs[todayKey]; selectedStartDataUrl = null; selectedEndDataUrl = null; saveState(); render(); showValidation("Today reset.", true); }
  });
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-warden-export-${todayKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $("importInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try { state = mergeState(JSON.parse(await file.text())); saveState(); render(); showValidation("Import complete.", true); }
    catch { showValidation("Import failed. File was not valid JSON."); }
  });
}
function registerSW() { if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {}); }

attachEvents();
render();
registerSW();
