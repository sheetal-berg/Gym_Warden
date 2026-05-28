(() => {
  'use strict';

  const STORE_KEY = 'gymWarden.v05.state';
  const OLD_KEYS = ['gymWarden.v04.state', 'gymWarden.v03.state', 'gymWarden.v02.state', 'gymWarden.v01.state'];
  const DEFAULT_STATE = {
    version: '0.5.0',
    settings: { weeklyTarget: 4, debtPerMiss: 100, weekStartsOn: 0 },
    logs: {},
    weekAdjustments: {},
    meta: { initializedAt: Date.now(), lastExportAt: null }
  };

  let state = loadState();
  let selectedProofFile = null;
  let selectedPreviewUrl = null;

  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {};
  const bindEls = () => {
    [
      'settingsBtn','closeSettingsBtn','settingsPanel','weekRange','progressTitle','progressSubtitle','weekDots','taxRisk','taxText',
      'workoutDate','selectedDateBadge','proofFile','fileDropText','proofPreview','exerciseMinutes','minutesLabel','evidenceNote',
      'logWorkoutBtn','clearDateBtn','formMessage','reduceTargetBtn','skipWeekBtn','clearRecoveryBtn','targetOverridePanel',
      'targetOverride','overrideReason','saveOverrideBtn','recoveryMessage','historyCount','trendList','weeklyTarget','debtPerMiss','weekStartsOn',
      'saveSettingsBtn','exportBtn','importFile'
    ].forEach(id => { els[id] = $(id); });
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEls();
    initializeDefaults();
    attachEvents();
    render();
    registerServiceWorker();
  });

  function initializeDefaults() {
    if (!els.workoutDate.value) els.workoutDate.value = todayKey();
    if (!state.meta?.initializedAt) state.meta.initializedAt = Date.now();
    saveState();
  }

  function attachEvents() {
    els.settingsBtn.addEventListener('click', () => {
      els.settingsPanel.hidden = false;
      els.settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.closeSettingsBtn.addEventListener('click', () => { els.settingsPanel.hidden = true; });
    els.workoutDate.addEventListener('change', () => { clearTempProof(); renderDateForm(); render(); });
    $$('input[name="proofType"]').forEach(input => input.addEventListener('change', () => { clearTempProof(); renderProofMode(); }));
    els.proofFile.addEventListener('change', handleProofFile);
    els.logWorkoutBtn.addEventListener('click', logWorkout);
    els.clearDateBtn.addEventListener('click', clearSelectedDate);
    els.reduceTargetBtn.addEventListener('click', () => {
      els.targetOverridePanel.hidden = !els.targetOverridePanel.hidden;
      if (!els.targetOverride.value) els.targetOverride.value = Math.max(0, weekSummary().target - 1);
      if (!els.overrideReason.value) els.overrideReason.value = 'Recovery adjustment';
    });
    els.skipWeekBtn.addEventListener('click', () => applyWeekAdjustment(0, 'Recovery week'));
    els.clearRecoveryBtn.addEventListener('click', clearWeekAdjustment);
    els.saveOverrideBtn.addEventListener('click', () => {
      const value = Number(els.targetOverride.value);
      if (!Number.isInteger(value) || value < 0 || value > 7) {
        showMessage(els.recoveryMessage, 'Enter a target from 0 to 7.', 'error');
        return;
      }
      applyWeekAdjustment(value, els.overrideReason.value || 'Recovery adjustment');
    });
    els.saveSettingsBtn.addEventListener('click', saveSettings);
    els.exportBtn.addEventListener('click', exportData);
    els.importFile.addEventListener('change', importData);
  }

  function loadState() {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try { return mergeState(JSON.parse(raw)); } catch {}
    }
    for (const key of OLD_KEYS) {
      const oldRaw = localStorage.getItem(key);
      if (!oldRaw) continue;
      try {
        const migrated = migrateOldState(JSON.parse(oldRaw));
        localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
        return migrated;
      } catch {}
    }
    const fresh = clone(DEFAULT_STATE);
    localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function mergeState(input) {
    const next = clone(DEFAULT_STATE);
    next.version = '0.5.0';
    next.settings = {
      weeklyTarget: Number(input?.settings?.weeklyTarget ?? input?.settings?.target ?? next.settings.weeklyTarget),
      debtPerMiss: Number(input?.settings?.debtPerMiss ?? input?.settings?.penalty ?? next.settings.debtPerMiss),
      weekStartsOn: Number(input?.settings?.weekStartsOn ?? next.settings.weekStartsOn)
    };
    next.logs = sanitizeLogs(input?.logs || {});
    next.weekAdjustments = input?.weekAdjustments || {};
    next.meta = { ...next.meta, ...(input?.meta || {}) };
    return next;
  }

  function sanitizeLogs(logs) {
    const clean = {};
    Object.entries(logs).forEach(([date, log]) => {
      if (!isDateKey(date)) return;
      if (!log || log.status !== 'completed') return;
      clean[date] = {
        date,
        status: 'completed',
        mode: log.mode === 'emergency' ? 'emergency' : 'full',
        proofType: ['photo','health','manual','gymPhoto','appleHealth','workoutApp'].includes(log.proofType) ? normalizeProofType(log.proofType) : 'manual',
        proofProvided: Boolean(log.proofProvided || log.proofData || log.fileName),
        fileName: log.fileName || '',
        exerciseMinutes: log.exerciseMinutes || '',
        note: log.note || log.notes || '',
        completedAt: log.completedAt || Date.now()
      };
    });
    return clean;
  }

  function migrateOldState(old) {
    const next = clone(DEFAULT_STATE);
    next.meta.initializedAt = old?.meta?.initializedAt || Date.now();
    next.meta.migratedAt = Date.now();
    next.settings.weeklyTarget = Number(old?.settings?.weeklyTarget || 4);
    next.settings.debtPerMiss = Number(old?.settings?.debtPerMiss || old?.settings?.penalty || 100);
    next.settings.weekStartsOn = Number(old?.settings?.weekStartsOn ?? 0);
    next.weekAdjustments = old?.weekAdjustments || {};
    next.logs = sanitizeLogs(old?.logs || old?.sessions || {});
    return next;
  }

  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function render() {
    renderHero();
    renderTax();
    renderDateForm();
    renderRecovery();
    renderTrend();
    renderSettings();
    renderProofMode();
  }

  function renderHero() {
    const summary = weekSummary();
    const start = summary.start;
    const end = addDays(start, 6);
    els.weekRange.textContent = `${formatShort(start)}–${formatShort(end)}`;
    els.progressTitle.textContent = `${summary.completed} of ${summary.target} done`;
    if (summary.target === 0) {
      els.progressSubtitle.textContent = 'Recovery week is active.';
    } else if (summary.completed >= summary.target) {
      els.progressSubtitle.textContent = 'Weekly target completed. Cat tax avoided.';
    } else {
      els.progressSubtitle.textContent = `${summary.remaining} workout${summary.remaining === 1 ? '' : 's'} left before ${formatShort(addDays(summary.start, 6))}.`;
    }
    els.weekDots.innerHTML = '';
    const target = Math.max(summary.target, 1);
    const logs = completedLogsForWeek(start);
    for (let i = 0; i < target; i++) {
      const dot = document.createElement('span');
      dot.className = 'progress-dot';
      if (summary.target === 0) dot.classList.add('skipped');
      else if (logs[i]) dot.classList.add(logs[i].mode === 'emergency' ? 'emergency' : 'done');
      els.weekDots.appendChild(dot);
    }
  }

  function renderTax() {
    const summary = weekSummary();
    els.taxRisk.textContent = `$${summary.potentialDebt}`;
    if (summary.target === 0) {
      els.taxText.textContent = 'Recovery week: no cat tax.';
    } else {
      els.taxText.textContent = `$${state.settings.debtPerMiss} per missed workout.`;
    }
  }

  function renderDateForm() {
    const key = selectedDateKey();
    const log = state.logs[key];
    els.selectedDateBadge.textContent = key === todayKey() ? 'Today' : formatShort(parseKey(key));
    if (log) {
      setRadio('completionMode', log.mode || 'full');
      setRadio('proofType', log.proofType || 'manual');
      els.exerciseMinutes.value = log.exerciseMinutes || '';
      els.evidenceNote.value = log.note || '';
      if (!selectedProofFile) {
        els.fileDropText.textContent = log.proofProvided ? 'Proof was submitted earlier' : 'Add proof image';
        els.proofPreview.hidden = true;
        els.proofPreview.innerHTML = '';
      }
    } else if (!selectedProofFile) {
      setRadio('completionMode', 'full');
      setRadio('proofType', 'photo');
      els.exerciseMinutes.value = '';
      els.evidenceNote.value = '';
      els.fileDropText.textContent = 'Add proof image';
      els.proofPreview.hidden = true;
      els.proofPreview.innerHTML = '';
    }
  }

  function renderProofMode() {
    const proof = getRadio('proofType');
    const needsFile = proof === 'photo';
    els.fileArea.hidden = proof === 'health' || proof === 'manual';
    els.minutesLabel.textContent = proof === 'health' ? 'Exercise minutes' : 'Exercise minutes, optional';
    els.exerciseMinutes.placeholder = proof === 'health' ? 'Required if no screenshot. Example: 52' : 'Example: 52';
    if (!needsFile) {
      els.proofFile.value = '';
      selectedProofFile = null;
      revokePreviewUrl();
      els.proofPreview.hidden = true;
      els.proofPreview.innerHTML = '';
    }
  }

  function renderRecovery() {
    const adjustment = state.weekAdjustments[weekIdForDate()] || null;
    if (adjustment) {
      els.recoveryMessage.className = 'form-message ok';
      els.recoveryMessage.textContent = adjustment.targetOverride === 0
        ? 'Recovery week is active.'
        : `This week target is adjusted to ${adjustment.targetOverride}.`;
      els.targetOverride.value = adjustment.targetOverride ?? '';
      els.overrideReason.value = adjustment.reason || '';
    } else {
      els.recoveryMessage.className = 'form-message';
      els.recoveryMessage.textContent = '';
      els.targetOverride.value = '';
      els.overrideReason.value = '';
    }
  }

  function renderTrend() {
    const starts = trackedWeekStarts(8);
    els.historyCount.textContent = `${starts.length} week${starts.length === 1 ? '' : 's'}`;
    if (!starts.length) {
      els.trendList.innerHTML = '<p class="subcopy">No history yet.</p>';
      return;
    }
    els.trendList.innerHTML = starts.map(start => {
      const s = weekSummary(start);
      const label = `${formatShort(start)}–${formatShort(addDays(start, 6))}`;
      const status = s.target === 0 ? 'Recovery' : s.completed >= s.target ? 'Met' : s.closed ? 'Missed' : 'Current';
      const dots = trendDots(s, start);
      const debt = s.closed ? s.debt : s.potentialDebt;
      const debtLabel = s.closed ? 'debt' : 'at risk';
      return `
        <div class="trend-row">
          <div>
            <strong>${label}</strong>
            <small>${s.completed}/${s.target} completed · $${debt} ${debtLabel}</small>
            ${dots}
          </div>
          <strong>${status}</strong>
        </div>`;
    }).join('');
  }

  function trendDots(summary, start) {
    const logs = completedLogsForWeek(start);
    const count = Math.max(summary.target, 1);
    let html = '<div class="trend-dots">';
    for (let i = 0; i < count; i++) {
      let cls = 'trend-dot';
      if (summary.target === 0) cls += ' skipped';
      else if (logs[i]) cls += logs[i].mode === 'emergency' ? ' emergency' : ' done';
      html += `<span class="${cls}"></span>`;
    }
    html += '</div>';
    return html;
  }

  function renderSettings() {
    els.weeklyTarget.value = state.settings.weeklyTarget;
    els.debtPerMiss.value = state.settings.debtPerMiss;
    els.weekStartsOn.value = String(state.settings.weekStartsOn);
  }

  function handleProofFile(event) {
    selectedProofFile = event.target.files?.[0] || null;
    revokePreviewUrl();
    if (!selectedProofFile) {
      els.fileDropText.textContent = 'Add proof image';
      els.proofPreview.hidden = true;
      els.proofPreview.innerHTML = '';
      return;
    }
    selectedPreviewUrl = URL.createObjectURL(selectedProofFile);
    els.fileDropText.textContent = selectedProofFile.name || 'Image selected';
    els.proofPreview.innerHTML = `<img src="${selectedPreviewUrl}" alt="Selected proof preview">`;
    els.proofPreview.hidden = false;
  }

  function logWorkout() {
    const date = selectedDateKey();
    if (!isDateKey(date)) {
      showMessage(els.formMessage, 'Pick a valid workout date.', 'error');
      return;
    }
    const proofType = getRadio('proofType');
    const mode = getRadio('completionMode');
    const minutes = String(els.exerciseMinutes.value || '').trim();
    const note = String(els.evidenceNote.value || '').trim();
    const hasFile = Boolean(selectedProofFile);

    if (proofType === 'photo' && !hasFile && !state.logs[date]?.proofProvided) {
      showMessage(els.formMessage, 'Add a proof image or choose Apple Health/manual proof.', 'error');
      return;
    }
    if (proofType === 'health' && !minutes && !note && !hasFile) {
      showMessage(els.formMessage, 'Enter exercise minutes or add a note for Apple Health proof.', 'error');
      return;
    }
    if (proofType === 'manual' && note.length < 8) {
      showMessage(els.formMessage, 'Manual logs need a short note.', 'error');
      return;
    }
    if (mode === 'emergency' && note.length < 8) {
      showMessage(els.formMessage, 'Emergency saves need a short note.', 'error');
      return;
    }

    state.logs[date] = {
      date,
      status: 'completed',
      mode,
      proofType,
      proofProvided: proofType === 'photo' ? Boolean(hasFile || state.logs[date]?.proofProvided) : proofType !== 'manual',
      fileName: selectedProofFile?.name || state.logs[date]?.fileName || '',
      exerciseMinutes: minutes,
      note,
      completedAt: Date.now()
    };
    saveState();
    clearTempProof(true);
    showMessage(els.formMessage, `Logged ${formatShort(parseKey(date))}.`, 'ok');
    render();
  }

  function clearSelectedDate() {
    const key = selectedDateKey();
    if (state.logs[key]) {
      delete state.logs[key];
      saveState();
      showMessage(els.formMessage, `Cleared ${formatShort(parseKey(key))}.`, 'ok');
    } else {
      showMessage(els.formMessage, 'Nothing logged for this date.', 'error');
    }
    clearTempProof();
    render();
  }

  function applyWeekAdjustment(target, reason) {
    state.weekAdjustments[weekIdForDate()] = {
      weekStart: weekIdForDate(),
      targetOverride: target,
      reason: reason || 'Recovery adjustment',
      updatedAt: Date.now()
    };
    saveState();
    els.targetOverridePanel.hidden = true;
    render();
  }

  function clearWeekAdjustment() {
    delete state.weekAdjustments[weekIdForDate()];
    saveState();
    els.targetOverridePanel.hidden = true;
    render();
  }

  function saveSettings() {
    const weeklyTarget = Number(els.weeklyTarget.value);
    const debtPerMiss = Number(els.debtPerMiss.value);
    const weekStartsOn = Number(els.weekStartsOn.value);
    if (!Number.isInteger(weeklyTarget) || weeklyTarget < 1 || weeklyTarget > 7) {
      alert('Weekly target must be 1 to 7.');
      return;
    }
    if (!Number.isFinite(debtPerMiss) || debtPerMiss < 0) {
      alert('Debt per missed workout must be 0 or higher.');
      return;
    }
    state.settings.weeklyTarget = weeklyTarget;
    state.settings.debtPerMiss = debtPerMiss;
    state.settings.weekStartsOn = weekStartsOn === 1 ? 1 : 0;
    saveState();
    render();
  }

  function exportData() {
    const exportState = clone(state);
    exportState.meta.lastExportAt = Date.now();
    exportState.version = '0.5.0';
    const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-warden-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        state = mergeState(parsed);
        saveState();
        clearTempProof();
        render();
        alert('Backup imported.');
      } catch {
        alert('Could not import backup. Make sure it is a Gym Warden JSON file.');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function selectedDateKey() { return els.workoutDate.value || todayKey(); }
  function todayKey() { return dateKey(new Date()); }
  function isDateKey(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
  function normalizeProofType(type) {
    if (type === 'gymPhoto' || type === 'workoutApp') return 'photo';
    if (type === 'appleHealth') return 'health';
    return type;
  }
  function getRadio(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value; }
  function setRadio(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  function showMessage(el, msg, type) {
    el.textContent = msg;
    el.className = `form-message ${type || ''}`.trim();
  }

  function weekSummary(start = weekStart(new Date())) {
    const target = targetForWeek(start);
    const logs = completedLogsForWeek(start);
    const completed = logs.length;
    const remaining = Math.max(0, target - completed);
    const closed = isPastWeek(start);
    const debt = closed ? remaining * state.settings.debtPerMiss : 0;
    const potentialDebt = remaining * state.settings.debtPerMiss;
    return { start, target, logs, completed, remaining, closed, debt, potentialDebt };
  }

  function targetForWeek(start = weekStart(new Date())) {
    const adj = state.weekAdjustments[dateKey(start)];
    if (adj && adj.targetOverride !== undefined && adj.targetOverride !== null && adj.targetOverride !== '') {
      return Math.max(0, Number(adj.targetOverride));
    }
    return Math.max(1, Number(state.settings.weeklyTarget || 4));
  }

  function completedLogsForWeek(start = weekStart(new Date())) {
    const keys = weekKeys(start);
    return keys.map(k => state.logs[k]).filter(log => log?.status === 'completed');
  }

  function trackedWeekStarts(limit = 8) {
    const current = weekStart(new Date());
    const first = firstTrackedWeekStart();
    const starts = [];
    let cursor = new Date(current);
    while (cursor >= first && starts.length < limit) {
      starts.push(new Date(cursor));
      cursor = addDays(cursor, -7);
    }
    if (!starts.length) starts.push(current);
    return starts;
  }

  function firstTrackedWeekStart() {
    const dates = [...Object.keys(state.logs || {}), ...Object.keys(state.weekAdjustments || {})].filter(isDateKey).sort();
    if (dates.length) return weekStart(parseKey(dates[0]));
    return weekStart(new Date(state.meta.initializedAt || Date.now()));
  }

  function weekKeys(start) { return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i))); }
  function weekIdForDate(d = new Date()) { return dateKey(weekStart(d)); }
  function weekStart(d) {
    const date = stripTime(d instanceof Date ? d : parseKey(d));
    const startDay = Number(state.settings.weekStartsOn ?? 0);
    const diff = (date.getDay() - startDay + 7) % 7;
    return addDays(date, -diff);
  }
  function isPastWeek(start) { return addDays(start, 7) <= stripTime(new Date()); }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return stripTime(d); }
  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseKey(key) {
    const [y,m,d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function dateKey(date) {
    const d = stripTime(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function formatShort(date) { return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  function clearTempProof(keepFileMeta = false) {
    if (!keepFileMeta) els.proofFile.value = '';
    selectedProofFile = null;
    revokePreviewUrl();
    els.fileDropText.textContent = 'Add proof image';
    els.proofPreview.hidden = true;
    els.proofPreview.innerHTML = '';
  }

  function revokePreviewUrl() {
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
    selectedPreviewUrl = null;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }
})();
