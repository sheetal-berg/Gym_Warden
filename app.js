const STORE_KEY = "gymWarden.v03";
const OLD_KEYS = ["gymWarden.v02", "gymWarden.v01"];
const DEFAULT_STATE = {
  settings: {
    weeklyTarget: 4,
    penalty: 100,
    weekStartsOn: 0,
    accountabilityContacts: ""
  },
  logs: {},
  weekAdjustments: {},
  meta: { initializedAt: Date.now(), migratedAt: null }
};

let state = loadState();
let selectedProofDataUrl = null;

function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0,0,0,0); return x; }
function formatShort(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function todayKey() { return dateKey(new Date()); }
function weekStart(d = new Date()) {
  const startOn = Number(state.settings.weekStartsOn ?? 0);
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const diff = (x.getDay() - startOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function weekIdForDate(d = new Date()) { return dateKey(weekStart(d)); }
function weekRangeFromStart(start) { return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i))); }
function weekEnd(start) { const e = addDays(start, 6); e.setHours(23,59,59,999); return e; }
function isPastWeek(start) { return new Date() > weekEnd(start); }
function selectedMode() { return document.querySelector("input[name='mode']:checked")?.value || "full"; }
function selectedProofType() { return document.querySelector("input[name='proofType']:checked")?.value || "gymPhoto"; }
function currentSelectedDateKey() { return $("workoutDateInput").value || todayKey(); }
function safeClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function loadState() {
  const existing = localStorage.getItem(STORE_KEY);
  if (existing) {
    try { return mergeState(JSON.parse(existing)); } catch {}
  }
  for (const key of OLD_KEYS) {
    const oldRaw = localStorage.getItem(key);
    if (!oldRaw) continue;
    try {
      const migrated = migrateOldState(JSON.parse(oldRaw));
      saveSpecific(migrated);
      return migrated;
    } catch {}
  }
  const fresh = safeClone(DEFAULT_STATE);
  fresh.meta.initializedAt = Date.now();
  saveSpecific(fresh);
  return fresh;
}
function mergeState(value) {
  const next = safeClone(DEFAULT_STATE);
  next.settings = { ...next.settings, ...(value.settings || {}) };
  next.logs = value.logs || {};
  next.weekAdjustments = value.weekAdjustments || {};
  next.meta = { ...next.meta, ...(value.meta || {}) };
  if (!next.meta.initializedAt) next.meta.initializedAt = Date.now();
  return next;
}
function migrateOldState(old) {
  const next = safeClone(DEFAULT_STATE);
  next.settings.weeklyTarget = Number(old.settings?.weeklyTarget || 4);
  next.settings.penalty = 100;
  next.settings.weekStartsOn = 0;
  next.settings.accountabilityContacts = old.settings?.accountabilityContacts || "";
  next.weekAdjustments = old.weekAdjustments || {};
  next.meta.initializedAt = Date.now();
  next.meta.migratedAt = Date.now();

  if (old.logs) {
    Object.values(old.logs).forEach(l => {
      if (!l?.date || l.status !== "completed") return;
      next.logs[l.date] = {
        date: l.date,
        status: "completed",
        mode: l.mode || "full",
        proofType: l.proofType || "gymPhoto",
        proofData: l.proofData || l.endProof || l.startProof || "",
        exerciseMinutes: l.exerciseMinutes || "",
        notes: l.notes || l.note || "Migrated from older Gym Warden version.",
        completedAt: l.completedAt || Date.now(),
        migratedFrom: "v02"
      };
    });
  }
  if (old.sessions) {
    Object.values(old.sessions).forEach(s => {
      if (!s?.date || s.status !== "completed") return;
      next.logs[s.date] = {
        date: s.date,
        status: "completed",
        mode: s.mode || "full",
        proofType: "gymPhoto",
        proofData: s.endProof || s.startProof || "",
        exerciseMinutes: "",
        notes: s.notes || s.note || "Migrated from older Gym Warden version.",
        completedAt: s.completedAt || Date.now(),
        migratedFrom: "v01"
      };
    });
  }
  return next;
}
function saveSpecific(value) { localStorage.setItem(STORE_KEY, JSON.stringify(value)); }
function saveState() { saveSpecific(state); }

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
  const unverified = completed.filter(l => l.proofType === "manual" || !l.proofData).length;
  const remaining = Math.max(0, target - completed.length);
  const closed = isPastWeek(start);
  const missed = closed ? remaining : 0;
  const debt = missed * Number(state.settings.penalty || 0);
  const potentialDebt = remaining * Number(state.settings.penalty || 0);
  const adjustment = state.weekAdjustments[dateKey(start)] || null;
  return { start, target, completed: completed.length, full, emergency, unverified, remaining, closed, missed, debt, potentialDebt, adjustment };
}
function firstTrackedWeekStart() {
  const dates = Object.keys(state.logs || {});
  const adjustmentDates = Object.keys(state.weekAdjustments || {});
  const all = [...dates, ...adjustmentDates];
  if (all.length) {
    const earliest = all.sort()[0];
    return weekStart(parseKey(earliest));
  }
  return weekStart(new Date(state.meta.initializedAt || Date.now()));
}
function trackedWeekStarts(max = 12) {
  const current = weekStart(new Date());
  const first = firstTrackedWeekStart();
  const starts = [];
  let s = current;
  while (s >= first && starts.length < max) {
    starts.push(new Date(s));
    s = addDays(s, -7);
  }
  return starts;
}
function historicalDebt() {
  return trackedWeekStarts(52).reduce((sum, start) => sum + weekSummary(start).debt, 0);
}

function render() {
  renderHero();
  renderSelectedDate();
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
  $("weekMeta").textContent = `${formatShort(start)}–${formatShort(end)} · ${s.remaining} left · $${Number(state.settings.penalty || 0)} per missed workout`;
  let pill = "Unfinished";
  let msg = `You still need ${s.remaining} weight-training day${s.remaining === 1 ? "" : "s"} this week.`;
  if (s.target === 0) { pill = "Sick week"; msg = "This week is marked as skipped/recovery. No debt will be added for this week."; }
  else if (s.completed >= s.target) { pill = "Locked in"; msg = "Weekly target completed. The black cat is satisfied."; }
  else if (s.completed > 0) { pill = "In progress"; msg = `${s.completed} completed. ${s.remaining} more required before the week closes.`; }
  $("statusPill").textContent = pill;
  $("wardenMessage").textContent = msg;
}
function renderSelectedDate() {
  const key = currentSelectedDateKey();
  const log = state.logs[key];
  if (log?.proofData) $("proofPreview").innerHTML = `<img src="${log.proofData}" alt="Saved proof" />`;
  else if (!selectedProofDataUrl) $("proofPreview").innerHTML = "";
  if (log) {
    $("notes").value = log.notes || "";
    $("exerciseMinutesInput").value = log.exerciseMinutes || "";
    const mode = log.mode || "full";
    const proofType = log.proofType || "gymPhoto";
    const modeInput = document.querySelector(`input[name='mode'][value='${mode}']`);
    const proofInput = document.querySelector(`input[name='proofType'][value='${proofType}']`);
    if (modeInput) modeInput.checked = true;
    if (proofInput) proofInput.checked = true;
  } else if (!selectedProofDataUrl) {
    $("notes").value = "";
    $("exerciseMinutesInput").value = "";
    const full = document.querySelector("input[name='mode'][value='full']"); if (full) full.checked = true;
  }
}
function renderStats() {
  const s = weekSummary();
  $("targetCount").textContent = s.target;
  $("completedCount").textContent = s.completed;
  $("remainingCount").textContent = s.remaining;
  $("potentialDebt").textContent = `$${s.potentialDebt}`;
}
function renderReport() {
  const s = weekSummary();
  const adherence = s.target === 0 ? 100 : Math.round((s.completed / s.target) * 100);
  const adjustment = s.adjustment ? `<div class="report-row"><span>Health adjustment</span><strong>${escapeHtml(s.adjustment.reason || "Adjusted")}</strong></div>` : "";
  $("weeklyReport").innerHTML = `
    <div class="report-row"><span>Target weight-training days</span><strong>${s.target}</strong></div>
    <div class="report-row"><span>Completed</span><strong>${s.completed}</strong></div>
    <div class="report-row"><span>Full / emergency</span><strong>${s.full} / ${s.emergency}</strong></div>
    <div class="report-row"><span>Unverified/manual logs</span><strong>${s.unverified}</strong></div>
    <div class="report-row"><span>Remaining this week</span><strong>${s.remaining}</strong></div>
    <div class="report-row"><span>Adherence trend point</span><strong>${adherence}%</strong></div>
    <div class="report-row"><span>Potential current-week debt</span><strong>$${s.potentialDebt}</strong></div>
    <div class="report-row"><span>Historical closed-week debt</span><strong>$${historicalDebt()}</strong></div>
    ${adjustment}`;
}
function renderTrend() {
  const rows = trackedWeekStarts(8).map(start => {
    const s = weekSummary(start);
    const adherence = s.target === 0 ? 100 : Math.round((s.completed / s.target) * 100);
    const label = `${formatShort(start)}–${formatShort(addDays(start, 6))}`;
    const status = s.target === 0 ? "Skipped" : s.completed >= s.target ? "Met" : s.closed ? "Missed" : "In progress";
    return `<div class="trend-row"><div><strong>${label}</strong><small>${s.completed}/${s.target} completed · ${s.unverified} unverified/manual · debt $${s.debt}</small></div><strong>${status} · ${adherence}%</strong></div>`;
  }).join("");
  $("trendList").innerHTML = rows || `<p class="muted">No trend yet. Log your first workout.</p>`;
}
function renderSettings() {
  $("targetInput").value = state.settings.weeklyTarget;
  $("penaltyInput").value = state.settings.penalty;
  $("weekStartInput").value = String(state.settings.weekStartsOn ?? 0);
  $("contactsInput").value = state.settings.accountabilityContacts || "";
  const adj = state.weekAdjustments[weekIdForDate()] || {};
  $("overrideTargetInput").value = adj.targetOverride ?? "";
  $("overrideReasonInput").value = adj.reason || "Illness";
  $("overrideNoteInput").value = adj.note || "";
}
function renderAccountabilityText() { $("accountabilityText").value = accountabilityMessage(); }

function proofLabel(type) {
  return ({ gymPhoto: "Gym/equipment photo", appleHealth: "Apple Health/Fitness", workoutApp: "Workout app screenshot", manual: "Manual attestation" })[type] || "Proof";
}
function accountabilityMessage() {
  const s = weekSummary();
  if (s.target === 0) {
    return `Gym Warden update: this week is marked as a health/recovery skip. Reason: ${s.adjustment?.reason || "not specified"}. No workout debt should be added this week.`;
  }
  if (s.completed >= s.target) {
    return `Gym Warden weekly update: target met. Completed ${s.completed}/${s.target} weight-training days. Emergency saves: ${s.emergency}. Manual/unverified logs: ${s.unverified}.`;
  }
  return `Gym Warden accountability: I have completed ${s.completed}/${s.target} weight-training days this week and still need ${s.remaining}. If I do not complete the weekly target, I owe $${Number(state.settings.penalty || 0)} per missed workout. Potential debt this week: $${s.potentialDebt}. Do not let me quietly skip.`;
}
function reportText(start = weekStart(new Date())) {
  const s = weekSummary(start);
  const adjustment = s.adjustment ? `\nHealth adjustment: ${s.adjustment.reason || "Adjusted"}${s.adjustment.note ? " — " + s.adjustment.note : ""}` : "";
  return `Gym Warden weekly report\nWeek: ${formatShort(start)}–${formatShort(addDays(start, 6))}\nTarget: ${s.target}\nCompleted: ${s.completed}\nFull: ${s.full}\nEmergency saves: ${s.emergency}\nManual/unverified logs: ${s.unverified}\nRemaining: ${s.remaining}\nPotential current-week debt: $${s.potentialDebt}\nHistorical closed-week debt: $${historicalDebt()}${adjustment}`;
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
  const max = 1200;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.74);
}
function showValidation(text, ok=false) {
  const el = $("validationMessage");
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--warn)";
  setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 7000);
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

function validateWorkoutLog({ mode, proofType, proofData, exerciseMinutes, notes }) {
  const hasProofImage = Boolean(proofData);
  const minutes = Number(exerciseMinutes || 0);
  const noteLen = notes.trim().length;
  if (mode === "emergency" && noteLen < 12) return "Emergency save requires a short explanation. This prevents using emergency mode as avoidance.";
  if (proofType === "manual") {
    if (noteLen < 20 && minutes <= 0) return "Manual/no-photo proof requires either Apple Health minutes or a clear note.";
    return "";
  }
  if (proofType === "appleHealth") {
    if (!hasProofImage && minutes <= 0) return "For Apple Health proof, upload a Fitness/Health screenshot or enter exercise minutes.";
    if (!hasProofImage && noteLen < 12) return "If you only enter exercise minutes, add a short note so the proof is auditable later.";
    return "";
  }
  if (!hasProofImage) return "This proof type requires a photo/screenshot. Or choose manual attestation if you truly have no photo.";
  return "";
}

function attachEvents() {
  $("workoutDateInput").value = todayKey();
  $("workoutDateInput").addEventListener("change", () => { selectedProofDataUrl = null; render(); });
  $("proofFile").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    selectedProofDataUrl = await compressImage(file);
    $("proofPreview").innerHTML = `<img src="${selectedProofDataUrl}" alt="Selected proof" />`;
  });
  document.querySelectorAll("input[name='mode']").forEach(r => r.addEventListener("change", () => {
    $("modeHint").textContent = selectedMode() === "emergency"
      ? "Emergency save counts toward weekly adherence but is labeled separately. Add a note explaining why it was reduced."
      : "Full workout counts normally. No checklist and no timer.";
  }));
  document.querySelectorAll("input[name='proofType']").forEach(r => r.addEventListener("change", () => renderAccountabilityText()));
  $("logWorkoutBtn").addEventListener("click", () => {
    const key = currentSelectedDateKey();
    const selectedDate = parseKey(key);
    const tomorrow = addDays(new Date(), 1);
    if (selectedDate > tomorrow) return showValidation("Do not log future workouts.");

    const mode = selectedMode();
    const proofType = selectedProofType();
    const existing = state.logs[key] || {};
    const proofData = selectedProofDataUrl || existing.proofData || "";
    const exerciseMinutes = $("exerciseMinutesInput").value.trim();
    const notes = $("notes").value.trim();
    const error = validateWorkoutLog({ mode, proofType, proofData, exerciseMinutes, notes });
    if (error) return showValidation(error);

    state.logs[key] = {
      date: key,
      status: "completed",
      mode,
      proofType,
      proofData,
      exerciseMinutes,
      notes,
      completedAt: Date.now()
    };
    selectedProofDataUrl = null;
    saveState();
    render();
    showValidation(`${proofLabel(proofType)} logged for ${key}. ${proofType === "manual" || !proofData ? "Marked as manual/unverified." : "Photo/screenshot saved for human review."}`, true);
  });
  $("resetSelectedDateBtn").addEventListener("click", () => {
    const key = currentSelectedDateKey();
    if (!state.logs[key]) return showValidation("No workout log exists for the selected date.");
    if (confirm(`Reset workout log for ${key}?`)) {
      delete state.logs[key]; selectedProofDataUrl = null; $("proofFile").value = ""; saveState(); render(); showValidation("Selected date reset.", true);
    }
  });
  $("healthExceptionBtn").addEventListener("click", () => {
    showValidation("Use Health / sick week controls below to reduce or skip this week. That keeps sickness separate from avoidance.");
    const details = Array.from(document.querySelectorAll("details")).find(d => d.textContent.includes("Health / sick week controls"));
    details?.setAttribute("open", "open");
    setTimeout(() => $("overrideTargetInput")?.focus(), 50);
  });
  $("copyMessageBtn").addEventListener("click", () => copyText($("accountabilityText").value));
  $("shareMessageBtn").addEventListener("click", () => shareText($("accountabilityText").value));
  $("smsMessageBtn").addEventListener("click", openSms);
  $("copyReportBtn").addEventListener("click", () => copyText(reportText()));
  $("shareReportBtn").addEventListener("click", () => shareText(reportText()));
  $("saveSettingsBtn").addEventListener("click", () => {
    state.settings.weeklyTarget = Math.max(1, Math.min(7, Number($("targetInput").value || 4)));
    state.settings.penalty = Math.max(0, Number($("penaltyInput").value || 0));
    state.settings.weekStartsOn = Number($("weekStartInput").value || 0);
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
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym-warden-export-${todayKey()}.json`;
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
