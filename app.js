const PLANS = {
  none: { label: "Rest / no required lift", exercises: [] },
  glutes: { label: "Glutes", exercises: ["Deficit reverse lunges", "Angled machine leg press", "Barbell B-stance hip thrust", "45° hip extension", "Glute med kickback or banded side walk"] },
  shoulders: { label: "Shoulders & Triceps", exercises: ["Push-ups", "Seated dumbbell shoulder press", "Leaning cable lateral raise", "Incline front raise", "Chest-supported rear delt fly", "Sideways incline dumbbell lateral raise"] },
  glutesHams: { label: "Glutes & Hamstrings", exercises: ["Cable single-leg kickback", "Machine lying leg curl", "Barbell Romanian deadlift", "Dumbbell walking lunge", "Banded glute kickback", "Dumbbell hip abduction"] },
  back: { label: "Back & Rear Delts", exercises: ["Cable kneeling single-arm lat pulldown", "Cable close-grip lat pulldown", "Dumbbell incline bench row", "Straight-arm pushdown", "Seated face pulls"] }
};
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STORE_KEY = "gymWarden.v01";
const DEFAULT_STATE = {
  settings: {
    deadline: "21:30",
    warning: "18:30",
    penalty: 25,
    schedule: { 0: "none", 1: "glutes", 2: "shoulders", 3: "none", 4: "glutesHams", 5: "none", 6: "back" }
  },
  sessions: {}
};
let state = loadState();
let todayKey = dateKey(new Date());
let selectedStartDataUrl = null;
let selectedEndDataUrl = null;
let tickHandle = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function $(id) { return document.getElementById(id); }
function dateKey(d) { return d.toISOString().slice(0,10); }
function weekStart(d) { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function minutesBetween(startMs, endMs) { return Math.max(0, Math.floor((endMs - startMs)/60000)); }
function timeToday(hhmm) { const [h,m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h,m,0,0); return d; }
function getTodayPlanKey() { return state.settings.schedule[new Date().getDay()] || "none"; }
function getTodayPlan() { return PLANS[getTodayPlanKey()]; }
function getTodaySession() { return state.sessions[todayKey] || {}; }
function setTodaySession(patch) { state.sessions[todayKey] = { ...getTodaySession(), date: todayKey, planKey: getTodayPlanKey(), ...patch }; saveState(); render(); }

function statusForToday() {
  const planKey = getTodayPlanKey();
  const session = getTodaySession();
  const now = new Date();
  if (planKey === "none") return { mode: "clear", label: "Clear", message: "No required lift today. Recovery still counts. Do not invent junk volume.", countdown: "" };
  if (session.status === "completed") return { mode: "clear", label: "Completed", message: `Completed: ${PLANS[session.planKey].label}. The Warden is satisfied.`, countdown: "" };
  if (session.status === "exception") return { mode: "clear", label: "Exception logged", message: `Valid exception logged: ${session.reason}. Reschedule if this was not a recovery-critical issue.`, countdown: "" };
  const deadline = timeToday(state.settings.deadline);
  const warning = timeToday(state.settings.warning);
  if (now > deadline) return { mode: "danger", label: "Failure Mode", message: `Deadline passed. ${getTodayPlan().label} is now uncompleted unless you log a valid exception or complete an emergency save immediately.`, countdown: "Deadline passed" };
  if (now > warning) return { mode: "watch", label: "Intervention Mode", message: `Start proof is required. You are not negotiating with fatigue — start the minimum version if needed.`, countdown: countdownText(deadline) };
  return { mode: "watch", label: "Watch Mode", message: `${getTodayPlan().label} is due today. Start proof required before completion.`, countdown: countdownText(deadline) };
}
function countdownText(deadline) {
  const diff = deadline - new Date();
  if (diff <= 0) return "Deadline passed";
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hrs}h ${mins}m until deadline (${state.settings.deadline})`;
}

function render() {
  todayKey = dateKey(new Date());
  const planKey = getTodayPlanKey();
  const plan = getTodayPlan();
  const session = getTodaySession();
  const status = statusForToday();
  document.body.classList.remove("mode-clear", "mode-watch", "mode-danger");
  document.body.classList.add(`mode-${status.mode}`);
  $("modePill").textContent = status.label;
  $("modePill").className = `mode-pill ${status.mode}`;
  $("todayTitle").textContent = planKey === "none" ? "No required lift today" : plan.label;
  $("wardenMessage").textContent = status.message;
  $("countdown").textContent = status.countdown;
  renderChecklist(plan, session);
  renderProofs(session);
  renderTimer(session);
  renderStats();
  renderReport();
  renderHistory();
  renderAccountabilityText();
  renderSettings();
}
function renderChecklist(plan, session) {
  $("checklistTitle").textContent = plan.exercises.length ? "Today’s required movements" : "No movement checklist today";
  const selected = new Set(session.completedExercises || []);
  $("exerciseChecklist").innerHTML = plan.exercises.map((ex, idx) => `
    <label class="check-item">
      <input type="checkbox" data-exercise="${idx}" ${selected.has(idx) ? "checked" : ""} />
      <span>${ex}</span>
    </label>`).join("") || `<p class="muted">No required lift scheduled.</p>`;
  $("checklistCount").textContent = `${selected.size} selected`;
  document.querySelectorAll("[data-exercise]").forEach(box => {
    box.addEventListener("change", () => {
      const checked = [...document.querySelectorAll("[data-exercise]:checked")].map(x => Number(x.dataset.exercise));
      setTodaySession({ completedExercises: checked });
    });
  });
}
function renderProofs(session) {
  $("startPreview").innerHTML = session.startProof ? `<img src="${session.startProof}" alt="Start proof" />` : "";
  $("endPreview").innerHTML = session.endProof ? `<img src="${session.endProof}" alt="End proof" />` : "";
  $("notes").value = session.notes || "";
}
function renderTimer(session) {
  if (!session.startedAt) { $("timer").textContent = "Timer: not started"; return; }
  const end = session.completedAt || Date.now();
  const mins = minutesBetween(session.startedAt, end);
  $("timer").textContent = session.completedAt ? `Timer: ${mins} min completed` : `Timer running: ${mins} min`;
}
function weekKeys() { const start = weekStart(new Date()); return Array.from({length:7},(_,i)=>dateKey(addDays(start,i))); }
function weekSummary() {
  const keys = weekKeys();
  let required=0, done=0, emergency=0, exceptions=0, missed=0;
  keys.forEach((key, i) => {
    const dayPlan = state.settings.schedule[i] || "none";
    if (dayPlan === "none") return;
    required++;
    const s = state.sessions[key];
    const isPast = new Date(key+"T23:59:59") < new Date();
    if (s?.status === "completed") { done++; if (s.mode === "emergency") emergency++; }
    else if (s?.status === "exception") exceptions++;
    else if (isPast) missed++;
  });
  return { required, done, emergency, exceptions, missed, debt: missed * Number(state.settings.penalty || 0) };
}
function renderStats() {
  const s = weekSummary();
  $("weeklyRequired").textContent = s.required;
  $("weeklyDone").textContent = s.done;
  $("weeklyMissed").textContent = s.missed;
  $("debtTotal").textContent = `$${s.debt}`;
}
function renderReport() {
  const s = weekSummary();
  const adherence = s.required ? Math.round((s.done + s.exceptions) / s.required * 100) : 100;
  $("weeklyReport").innerHTML = `
    <div class="report-row"><span>Required lifts</span><strong>${s.required}</strong></div>
    <div class="report-row"><span>Completed full/emergency</span><strong>${s.done} / ${s.emergency}</strong></div>
    <div class="report-row"><span>Valid exceptions</span><strong>${s.exceptions}</strong></div>
    <div class="report-row"><span>Unexcused missed</span><strong>${s.missed}</strong></div>
    <div class="report-row"><span>Adherence score</span><strong>${adherence}%</strong></div>
    <div class="report-row"><span>Accountability debt</span><strong>$${s.debt}</strong></div>`;
}
function renderHistory() {
  const rows = Object.values(state.sessions).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  $("historyList").innerHTML = rows.length ? rows.map(s => `
    <div class="history-item"><span>${s.date} — ${PLANS[s.planKey]?.label || "Unknown"}</span><strong>${s.status}${s.mode ? " / "+s.mode : ""}</strong></div>`).join("") : `<p class="muted">No sessions logged yet.</p>`;
}
function reportText() {
  const s = weekSummary();
  return `Gym Warden weekly report\nRequired lifts: ${s.required}\nCompleted: ${s.done}\nEmergency saves: ${s.emergency}\nValid exceptions: ${s.exceptions}\nUnexcused missed: ${s.missed}\nAccountability debt: $${s.debt}`;
}
function renderAccountabilityText() {
  const plan = getTodayPlan();
  const session = getTodaySession();
  let msg;
  if (getTodayPlanKey() === "none") msg = "No required lift today. Recovery day logged.";
  else if (session.status === "completed") msg = `I completed my scheduled ${plan.label} session today. Mode: ${session.mode || "full"}. Exercises checked: ${(session.completedExercises || []).length}.`;
  else if (session.status === "exception") msg = `I did not complete ${plan.label} today. Valid exception logged: ${session.reason}. Note: ${session.note || "none"}.`;
  else msg = `I have not completed my scheduled ${plan.label} session yet. I need to either start now, complete the emergency version, or log a valid exception. Do not let me quietly skip.`;
  $("accountabilityText").value = msg;
}
function renderSettings() {
  $("deadlineInput").value = state.settings.deadline;
  $("warningInput").value = state.settings.warning;
  $("penaltyInput").value = state.settings.penalty;
  const options = Object.entries(PLANS).map(([key, p]) => `<option value="${key}">${p.label}</option>`).join("");
  $("scheduleEditor").innerHTML = DAY_NAMES.map((name, idx) => `
    <div class="schedule-row"><strong>${name}</strong><select data-day="${idx}">${options}</select></div>`).join("");
  document.querySelectorAll("[data-day]").forEach(sel => sel.value = state.settings.schedule[sel.dataset.day] || "none");
}
async function compressImage(file) {
  const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl; });
  const max = 900;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
function selectedMode() { return document.querySelector("input[name='mode']:checked")?.value || "full"; }

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
    if (getTodayPlanKey() === "none") return showValidation("No required lift is scheduled today.");
    if (!selectedStartDataUrl && !getTodaySession().startProof) return showValidation("Start proof photo is required.");
    setTodaySession({ status: "started", startedAt: getTodaySession().startedAt || Date.now(), startProof: selectedStartDataUrl || getTodaySession().startProof });
    selectedStartDataUrl = null; showValidation("Start proof accepted. Timer is running.", true);
  });
  $("completeBtn").addEventListener("click", () => {
    const session = getTodaySession();
    const mode = selectedMode();
    if (getTodayPlanKey() === "none") return showValidation("No required lift is scheduled today.");
    if (!session.startedAt || !session.startProof) return showValidation("Start proof and timer are required before completion.");
    const checked = session.completedExercises || [];
    if (checked.length < 3) return showValidation("At least 3 required movements must be checked.");
    const mins = minutesBetween(session.startedAt, Date.now());
    const minRequired = mode === "emergency" ? 20 : 35;
    if (mins < minRequired) return showValidation(`${mode === "emergency" ? "Emergency" : "Full"} completion requires at least ${minRequired} minutes. Current timer: ${mins} min.`);
    if (!selectedEndDataUrl && !session.endProof) return showValidation("End proof photo is required.");
    setTodaySession({ status: "completed", mode, completedAt: Date.now(), endProof: selectedEndDataUrl || session.endProof, notes: $("notes").value.trim() });
    selectedEndDataUrl = null; showValidation("Workout completed. The Warden is satisfied.", true);
  });
  $("notes").addEventListener("change", () => setTodaySession({ notes: $("notes").value.trim() }));
  document.querySelectorAll("input[name='mode']").forEach(r => r.addEventListener("change", () => {
    $("modeHint").textContent = selectedMode() === "emergency" ? "Emergency save requires 20+ minutes, start/end proof, and at least 3 movements. It preserves adherence but is not full volume." : "Full session requires 35+ minutes, start/end proof, and at least 3 movements.";
  }));
  $("exceptionBtn").addEventListener("click", () => $("exceptionDialog").showModal());
  $("saveExceptionBtn").addEventListener("click", () => {
    setTodaySession({ status: "exception", reason: $("exceptionReason").value, note: $("exceptionNote").value.trim(), exceptionAt: Date.now() });
    showValidation("Valid exception logged. Do not use this for normal fatigue.", true);
  });
  $("copyMessageBtn").addEventListener("click", () => copyText($("accountabilityText").value));
  $("shareMessageBtn").addEventListener("click", async () => {
    const text = $("accountabilityText").value;
    if (navigator.share) await navigator.share({ text }); else await copyText(text);
  });
  $("copyReportBtn").addEventListener("click", () => copyText(reportText()));
  $("saveSettingsBtn").addEventListener("click", () => {
    state.settings.deadline = $("deadlineInput").value || "21:30";
    state.settings.warning = $("warningInput").value || "18:30";
    state.settings.penalty = Number($("penaltyInput").value || 0);
    document.querySelectorAll("[data-day]").forEach(sel => state.settings.schedule[sel.dataset.day] = sel.value);
    saveState(); render(); showValidation("Settings saved.", true);
  });
  $("resetTodayBtn").addEventListener("click", () => {
    if (confirm("Reset today's log?")) { delete state.sessions[todayKey]; saveState(); render(); }
  });
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `gym-warden-export-${todayKey}.json`; a.click(); URL.revokeObjectURL(url);
  });
  $("importInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try { state = JSON.parse(await file.text()); saveState(); render(); showValidation("Import complete.", true); }
    catch { showValidation("Import failed. File was not valid JSON."); }
  });
}
function showValidation(text, ok=false) { const el = $("validationMessage"); el.textContent = text; el.style.color = ok ? "var(--ok)" : "var(--warn)"; setTimeout(()=>{ if (el.textContent === text) el.textContent = ""; }, 4500); }
async function copyText(text) { await navigator.clipboard.writeText(text); showValidation("Copied.", true); }
function registerSW() { if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(()=>{}); }

attachEvents();
render();
registerSW();
tickHandle = setInterval(render, 60000);
