const config = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = config.url || '';
const SUPABASE_ANON_KEY = config.anonKey || '';

if (!window.supabase) throw new Error('Supabase library not loaded.');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Missing SUPABASE_CONFIG in supabase-config.js');

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

const PRAYERS = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
const DEFAULT_CHECKPOINTS = [5, 10, 20, 30, 40];
const DAY_MS = 24 * 60 * 60 * 1000;

const appState = {
  currentUser: null,
  currentProfile: null,
  currentProgress: null,
  currentAdmin: null,
  checkpoints: [...DEFAULT_CHECKPOINTS],
  adminUsers: [],
  selectedAdminUserId: null,
  popupResolve: null
};

window.addEventListener('DOMContentLoaded', async () => {
  setupPopup();
  setupEventListeners();
  bindAuthListener();
  await withLoader('Loading your challenge...', async () => {
    await restoreSession();
  });
});

function setupEventListeners() {
  addClick('nav-home', () => displayPage('home-page'));
  addClick('nav-login', () => displayPage('login-page'));
  addClick('nav-register', () => displayPage('register-page'));
  addClick('nav-dashboard', async () => {
    await withLoader('Opening dashboard...', async () => {
      await refreshCurrentUserState();
      displayPage('dashboard-page');
    });
  });
  addClick('nav-admin-dashboard', async () => {
    await withLoader('Opening admin panel...', async () => {
      await refreshCurrentUserState();
      displayPage('admin-dashboard-page');
    });
  });
  addClick('nav-leaderboard', async () => {
    await withLoader('Loading leaderboard...', async () => {
      await updateLeaderboard();
      displayPage('leaderboard-page');
    });
  });
  addClick('nav-logout', logout);
  addClick('hero-login-btn', async () => {
    showLoader('Opening login...');
    await delay(250);
    hideLoader();
    displayPage('login-page');
  });
  addClick('hero-register-btn', async () => {
    showLoader('Opening registration...');
    await delay(250);
    hideLoader();
    displayPage('register-page');
  });
  addClick('refresh-history-btn', async () => withLoader('Refreshing history...', loadMyHistory));
  addClick('refresh-users-btn', async () => withLoader('Refreshing users...', loadAdminUsers));
  addClick('save-checkpoints-btn', async () => withLoader('Saving checkpoints...', saveCheckpoints));
  addClick('set-streak-btn', async () => withLoader('Updating streak...', adminSetStreak));
  addClick('apply-lifeline-btn', async () => withLoader('Applying lifeline change...', adminAdjustLifelines));
  addClick('delete-user-btn', async () => withLoader('Deleting user data...', adminDeleteUser));

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', async (e) => withLoader('Signing you in...', () => handleLogin(e)));

  const registerForm = document.getElementById('register-form');
  if (registerForm) registerForm.addEventListener('submit', async (e) => withLoader('Creating your account...', () => handleRegister(e)));

  const salahForm = document.getElementById('salah-form');
  if (salahForm) salahForm.addEventListener('submit', async (e) => withLoader('Submitting your Salah entry...', () => handleSalahSubmit(e)));

  document.querySelectorAll('.status-checkbox').forEach(cb => cb.addEventListener('change', handleStatusCheckboxChange));
  document.querySelectorAll('.takbeer-checkbox').forEach(cb => cb.addEventListener('change', handleTakbeerCheckboxChange));
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.addEventListener('click', () => showAdminTab(btn.dataset.tab)));

  const search = document.getElementById('admin-user-search');
  if (search) search.addEventListener('input', renderAdminUsersTable);
}

function addClick(id, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', async (e) => {
    e.preventDefault();
    await handler(e);
  });
}

function setupPopup() {
  const okBtn = document.getElementById('popup-ok-btn');
  okBtn.addEventListener('click', () => closePopup(true));
}

function showLoader(text = 'Loading...') {
  const loader = document.getElementById('global-loader');
  document.getElementById('loader-text').textContent = text;
  loader.classList.remove('hidden');
}

function hideLoader() {
  document.getElementById('global-loader').classList.add('hidden');
}

async function withLoader(text, fn) {
  try {
    showLoader(text);
    return await fn();
  } finally {
    hideLoader();
  }
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

function showPopup({ title = 'Done', message = '', emoji = '✨', danger = false, confirm = false, confirmText = 'Yes', cancelText = 'Cancel' }) {
  const modal = document.getElementById('popup-modal');
  document.getElementById('popup-title').textContent = title;
  document.getElementById('popup-message').textContent = message;
  document.getElementById('popup-emoji').textContent = emoji;
  const actions = document.getElementById('popup-actions');
  actions.innerHTML = '';

  if (confirm) {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-light';
    cancelBtn.textContent = cancelText;
    cancelBtn.onclick = () => closePopup(false);
    const okBtn = document.createElement('button');
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    okBtn.textContent = confirmText;
    okBtn.onclick = () => closePopup(true);
    actions.append(cancelBtn, okBtn);
  } else {
    const okBtn = document.createElement('button');
    okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    okBtn.textContent = 'OK';
    okBtn.onclick = () => closePopup(true);
    actions.append(okBtn);
  }

  modal.classList.remove('hidden');
  return new Promise(resolve => { appState.popupResolve = resolve; });
}

function closePopup(value) {
  document.getElementById('popup-modal').classList.add('hidden');
  if (appState.popupResolve) {
    const resolve = appState.popupResolve;
    appState.popupResolve = null;
    resolve(value);
  }
}

function bindAuthListener() {
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      clearCurrentState();
      updateNavigation();
      displayPage('home-page');
      return;
    }
    await loadUserContext(session.user);
    updateNavigation();
  });
}

async function restoreSession() {
  await loadCheckpoints();
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) {
    await loadUserContext(data.session.user);
    updateNavigation();
    displayPage(appState.currentAdmin ? 'admin-dashboard-page' : 'dashboard-page');
  } else {
    updateNavigation();
    displayPage('home-page');
    await updateLeaderboard();
  }
}

async function loadCheckpoints() {
  const { data } = await supabaseClient.from('app_config').select('checkpoints').eq('id', 1).maybeSingle();
  if (data?.checkpoints?.length) appState.checkpoints = data.checkpoints.map(Number).sort((a, b) => a - b);
  const input = document.getElementById('checkpoint-input');
  if (input) input.value = appState.checkpoints.join(',');
}

async function resolveLoginEmail(identifier) {
  const { data, error } = await supabaseClient.rpc('resolve_login_email', { login_input: identifier.toLowerCase() });
  if (error) throw error;
  return data || identifier;
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = document.getElementById('register-name').value.trim();
  const username = document.getElementById('register-username').value.trim().toLowerCase();
  const email = document.getElementById('register-email').value.trim().toLowerCase();
  const password = document.getElementById('register-password').value;

  if (!fullName || !username || !email || !password) {
    await showPopup({ title: 'Missing details', message: 'Please fill all registration fields.', emoji: '📝' });
    return;
  }

  const usernameCheck = await supabaseClient.rpc('is_username_available', { username_input: username });
  if (usernameCheck.error) throw usernameCheck.error;
  if (!usernameCheck.data) {
    await showPopup({ title: 'Username taken', message: 'Please choose another username.', emoji: '⚠️' });
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName }
    }
  });

  if (error) {
    await showPopup({ title: 'Registration failed', message: error.message || 'Unable to create account.', emoji: '❌', danger: true });
    return;
  }

  if (data.user) {
    await supabaseClient.from('profiles').update({ username, full_name: fullName, email }).eq('id', data.user.id);
  }

  document.getElementById('register-form').reset();
  await showPopup({ title: 'Registration successful 🎉', message: 'Your account was created and is now waiting for admin approval.', emoji: '🎉' });
  displayPage('login-page');
}

async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  if (!identifier || !password) {
    await showPopup({ title: 'Login info missing', message: 'Please enter username/email and password.', emoji: '🔐' });
    return;
  }

  const email = await resolveLoginEmail(identifier);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    await showPopup({ title: 'Login failed', message: error.message || 'Invalid login.', emoji: '❌', danger: true });
    return;
  }

  await loadUserContext(data.user);
  document.getElementById('login-form').reset();
  displayPage(appState.currentAdmin ? 'admin-dashboard-page' : 'dashboard-page');
}

async function logout() {
  await supabaseClient.auth.signOut();
  clearCurrentState();
  updateNavigation();
  displayPage('home-page');
}

function clearCurrentState() {
  appState.currentUser = null;
  appState.currentProfile = null;
  appState.currentProgress = null;
  appState.currentAdmin = null;
  appState.selectedAdminUserId = null;
}

async function refreshCurrentUserState() {
  if (appState.currentUser) await loadUserContext(appState.currentUser);
}

async function loadUserContext(user) {
  appState.currentUser = user;
  const [profileResult, progressResult] = await Promise.all([
    supabaseClient.from('profiles').select('*').eq('id', user.id).single(),
    supabaseClient.from('challenge_progress').select('*').eq('user_id', user.id).single()
  ]);

  if (profileResult.error || progressResult.error) {
    console.error(profileResult.error || progressResult.error);
    throw (profileResult.error || progressResult.error);
  }

  appState.currentProfile = profileResult.data;
  appState.currentProgress = normalizeProgress(progressResult.data);
  appState.currentAdmin = appState.currentProfile.is_admin ? appState.currentProfile : null;
  await loadCheckpoints();
  await updateLeaderboard();
}

function normalizeProgress(row) {
  return {
    ...row,
    streak: row.streak || 0,
    current_lifelines: row.current_lifelines || 0,
    lifelines_earned: row.lifelines_earned || 0,
    lifelines_used: row.lifelines_used || 0,
    current_checkpoint: row.current_checkpoint || 0,
    milestone_rewards: Array.isArray(row.milestone_rewards) ? row.milestone_rewards.map(Number) : []
  };
}

function updateNavigation() {
  const loggedIn = !!appState.currentUser;
  const isAdmin = !!appState.currentAdmin;
  toggleDisplay('nav-login', !loggedIn);
  toggleDisplay('nav-register', !loggedIn);
  toggleDisplay('nav-dashboard', loggedIn && !isAdmin);
  toggleDisplay('nav-admin-dashboard', isAdmin);
  toggleDisplay('nav-logout', loggedIn);
  toggleDisplay('admin-badge', isAdmin, 'inline-block');
}

function toggleDisplay(id, visible, display = 'block') {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden', !visible);
  el.style.display = visible ? display : 'none';
}

function displayPage(id) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');
  if (id === 'dashboard-page') updateDashboard();
  if (id === 'admin-dashboard-page') loadAdminDashboard();
}

async function updateDashboard() {
  if (!appState.currentUser) { displayPage('login-page'); return; }
  await refreshCurrentUserState();
  const p = appState.currentProfile;
  const progress = appState.currentProgress;
  document.getElementById('dashboard-greeting').textContent = `Assalamu Alaikum, ${p.full_name || p.username || p.email}`;
  document.getElementById('status-detail').textContent = p.approved
    ? 'You are approved. Submit today or yesterday only.'
    : 'Your account is waiting for admin approval. Submission unlocks after approval.';
  document.getElementById('current-streak').textContent = progress.streak;
  document.getElementById('lifeline-count').textContent = progress.current_lifelines;
  document.getElementById('current-checkpoint').textContent = progress.current_checkpoint;
  document.getElementById('submission-card').classList.toggle('hidden', !p.approved);
  prepareEntryDateInput();
  renderProgressPath(progress.streak);
  await loadMyHistory();
}

function renderProgressPath(currentStreak) {
  const host = document.getElementById('path-progress');
  host.innerHTML = '';
  const totalDays = 40;
  const rows = 5;
  const perRow = 8;

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'path-row' + (r % 2 ? ' reverse' : '');
    const start = r * perRow + 1;
    const days = Array.from({ length: perRow }, (_, i) => start + i);

    days.forEach(day => {
      const node = document.createElement('div');
      const icon = day <= currentStreak ? '✅' : '📍';
      const classes = ['path-node'];
      if (day <= currentStreak) classes.push('done');
      else classes.push('pending');
      if (day === currentStreak + 1) classes.push('current');
      if (appState.checkpoints.includes(day)) classes.push('checkpoint-node');
      node.className = classes.join(' ');
      node.innerHTML = `<div class="icon">${appState.checkpoints.includes(day) && day > currentStreak ? '🏁' : icon}</div><div class="day">Day ${day}</div>`;
      row.appendChild(node);
    });
    host.appendChild(row);
  }
}

function prepareEntryDateInput() {
  const entryInput = document.getElementById('entry-date');
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY_MS);
  entryInput.max = formatDate(today);
  if (!entryInput.value) entryInput.value = formatDate(today);
}

function formatDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function startOfDay(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr + 'T00:00:00') : new Date(dateOrStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function validateEntryDateWindow(value) {
  if (!value) return { ok: false, message: 'Please choose an entry date.' };
  const today = startOfDay(new Date());
  const yesterday = new Date(today.getTime() - DAY_MS);
  const entry = startOfDay(value);
  if (entry.getTime() === today.getTime() || entry.getTime() === yesterday.getTime()) return { ok: true };
  return { ok: false, message: 'Only today or yesterday can be submitted.' };
}

function showSubmissionWarning(msg) {
  const box = document.getElementById('submission-warning');
  box.textContent = msg || '';
  box.classList.toggle('hidden', !msg);
}

function handleTakbeerCheckboxChange(e) {
  const prayer = e.target.dataset.prayer;
  const jamatBox = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="jamat"]`);
  const noJamat = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="no-jamat"]`);
  const qaza = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="qaza"]`);
  if (e.target.checked) {
    jamatBox.checked = true;
    noJamat.checked = false;
    qaza.checked = false;
  }
}

function handleStatusCheckboxChange(e) {
  const prayer = e.target.dataset.prayer;
  const status = e.target.dataset.status;
  const all = document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`);
  if (e.target.checked) {
    all.forEach(box => { if (box !== e.target) box.checked = false; });
  }
  const takbeer = document.querySelector(`.takbeer-checkbox[data-prayer="${prayer}"]`);
  if (status === 'jamat' && !e.target.checked) takbeer.checked = false;
  if (status !== 'jamat' && e.target.checked) takbeer.checked = false;
}

function collectPrayerStatus() {
  const out = {};
  for (const prayer of PRAYERS) {
    const checked = Array.from(document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`)).filter(x => x.checked);
    if (checked.length !== 1) return { ok: false, message: `Please select exactly one status for ${titleCase(prayer)}.` };
    out[prayer] = {
      status: checked[0].dataset.status,
      takbeer: document.querySelector(`.takbeer-checkbox[data-prayer="${prayer}"]`).checked
    };
  }
  return { ok: true, payload: out };
}

async function handleSalahSubmit(e) {
  e.preventDefault();
  if (!appState.currentProfile?.approved) {
    await showPopup({ title: 'Approval pending', message: 'Your account needs admin approval before submission.', emoji: '⏳' });
    return;
  }

  const entryDate = document.getElementById('entry-date').value;
  const windowCheck = validateEntryDateWindow(entryDate);
  if (!windowCheck.ok) { showSubmissionWarning(windowCheck.message); return; }
  showSubmissionWarning('');

  const existing = await supabaseClient.from('salah_entries').select('id').eq('user_id', appState.currentUser.id).eq('entry_date', entryDate).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    await showPopup({ title: 'Already submitted', message: 'Duplicate submissions for the same day are not allowed.', emoji: '📅' });
    return;
  }

  const collected = collectPrayerStatus();
  if (!collected.ok) {
    await showPopup({ title: 'Submission incomplete', message: collected.message, emoji: '📝' });
    return;
  }

  const entry = collected.payload;
  const before = appState.currentProgress.streak;
  const evaluation = evaluateSubmissionOutcome(entry, appState.currentProgress);
  const updatePayload = {
    streak: evaluation.streak,
    current_checkpoint: evaluation.checkpoint,
    current_lifelines: evaluation.currentLifelines,
    lifelines_earned: evaluation.lifelinesEarned,
    lifelines_used: evaluation.lifelinesUsed,
    milestone_rewards: evaluation.milestoneRewards,
    last_submission_date: entryDate,
    missed_days_count: 0,
    updated_at: new Date().toISOString()
  };

  const row = {
    user_id: appState.currentUser.id,
    entry_date: entryDate,
    submission_date: formatDate(new Date()),
    submitted_at: new Date().toISOString(),

    fajr_status: entry.fajr.status, fajr_takbeer: entry.fajr.takbeer,
    zuhr_status: entry.zuhr.status, zuhr_takbeer: entry.zuhr.takbeer,
    asr_status: entry.asr.status, asr_takbeer: entry.asr.takbeer,
    maghrib_status: entry.maghrib.status, maghrib_takbeer: entry.maghrib.takbeer,
    isha_status: entry.isha.status, isha_takbeer: entry.isha.takbeer,

    // legacy compatibility columns
    fajr: entry.fajr.status, zuhr: entry.zuhr.status, asr: entry.asr.status, maghrib: entry.maghrib.status, isha: entry.isha.status,

    streak_before_submission: before,
    streak_after_submission: evaluation.streak,
    lifeline_used: evaluation.lifelineUsed,
    streak_broken: evaluation.streakBroken,
    break_reason: evaluation.breakReason
  };

  const inserted = await supabaseClient.from('salah_entries').insert(row).select().single();
  if (inserted.error) throw inserted.error;

  const progressRes = await supabaseClient.from('challenge_progress').update(updatePayload).eq('user_id', appState.currentUser.id).select().single();
  if (progressRes.error) throw progressRes.error;

  appState.currentProgress = normalizeProgress(progressRes.data);
  await insertLifelineEvents(appState.currentUser.id, evaluation.lifelineEvents);
  resetPrayerTable();
  renderProgressPath(appState.currentProgress.streak);
  await loadMyHistory();
  await updateLeaderboard();

  const messages = ['Your Salah entry has been submitted successfully.'];
  let emoji = '✅';
  let title = 'Submission saved';
  if (evaluation.lifelineUsed) { messages.push('🛟 A lifeline was used automatically to protect your streak.'); emoji = '🛟'; title = 'Lifeline used'; }
  if (evaluation.dailyRewardGranted) { messages.push('🎁 You earned +1 lifeline for a perfect Takbeer-e-Ula day.'); emoji = '🎉'; title = 'Congratulations!'; }
  if (evaluation.milestoneRewardsGranted.length) { messages.push(`🏆 Milestone reward unlocked for ${evaluation.milestoneRewardsGranted.join(', ')} day streak.`); emoji = '🏆'; title = 'Milestone achieved!'; }
  if (evaluation.streakBroken && !evaluation.lifelineUsed) { messages.push(`⚠️ Streak reset to checkpoint ${evaluation.checkpoint} because ${evaluation.breakReason}.`); emoji = '⚠️'; title = 'Streak updated'; }
  await showPopup({ title, message: messages.join(' '), emoji });
}

function evaluateSubmissionOutcome(entry, progress) {
  const statuses = PRAYERS.map(p => entry[p].status);
  const takbeers = PRAYERS.map(p => entry[p].takbeer);
  const noJamatCount = statuses.filter(v => v === 'no-jamat').length;
  const hasQaza = statuses.includes('qaza');
  const perfectTakbeerDay = statuses.every(v => v === 'jamat') && takbeers.every(Boolean);

  let streak = progress.streak + 1;
  let checkpoint = highestCheckpointAtOrBelow(streak);
  let currentLifelines = progress.current_lifelines;
  let lifelinesEarned = progress.lifelines_earned;
  let lifelinesUsed = progress.lifelines_used;
  let milestoneRewards = [...progress.milestone_rewards];
  let streakBroken = false;
  let breakReason = null;
  let lifelineUsed = false;
  let dailyRewardGranted = false;
  const milestoneRewardsGranted = [];
  const lifelineEvents = [];

  if (hasQaza) { streakBroken = true; breakReason = 'a Qaza prayer was marked'; }
  else if (noJamatCount >= 2) { streakBroken = true; breakReason = '2 or more No Jamat prayers were marked'; }

  if (streakBroken) {
    if (currentLifelines > 0) {
      currentLifelines -= 1;
      lifelinesUsed += 1;
      lifelineUsed = true;
      streakBroken = false;
      breakReason = 'Lifeline used';
      lifelineEvents.push({ event_type: 'use', count_change: -1, reason: 'Automatic streak protection' });
    } else {
      streak = progress.current_checkpoint;
      checkpoint = progress.current_checkpoint;
    }
  }

  if (!streakBroken && perfectTakbeerDay) {
    currentLifelines += 1;
    lifelinesEarned += 1;
    dailyRewardGranted = true;
    lifelineEvents.push({ event_type: 'earn', count_change: 1, reason: 'Perfect Takbeer-e-Ula day' });
  }

  for (const milestone of [10, 20, 30]) {
    if (streak >= milestone && !milestoneRewards.includes(milestone)) {
      milestoneRewards.push(milestone);
      currentLifelines += 1;
      lifelinesEarned += 1;
      milestoneRewardsGranted.push(milestone);
      lifelineEvents.push({ event_type: 'earn', count_change: 1, reason: `${milestone} day streak milestone` });
    }
  }

  return { streak, checkpoint, currentLifelines, lifelinesEarned, lifelinesUsed, milestoneRewards, streakBroken, breakReason, lifelineUsed, dailyRewardGranted, milestoneRewardsGranted, lifelineEvents };
}

function highestCheckpointAtOrBelow(streak) {
  let cp = 0;
  for (const x of appState.checkpoints) if (x <= streak) cp = x;
  return cp;
}

async function insertLifelineEvents(userId, events) {
  if (!events.length) return;
  const rows = events.map(e => ({ user_id: userId, event_type: e.event_type, count_change: e.count_change, reason: e.reason, created_at: new Date().toISOString(), created_by: appState.currentUser.id }));
  const { error } = await supabaseClient.from('lifeline_events').insert(rows);
  if (error) console.error(error);
}

function resetPrayerTable() {
  document.querySelectorAll('.status-checkbox,.takbeer-checkbox').forEach(cb => cb.checked = false);
}

async function loadMyHistory() {
  const tbody = document.getElementById('history-table-body');
  const { data, error } = await supabaseClient.from('salah_entries').select('*').eq('user_id', appState.currentUser.id).order('entry_date', { ascending: false }).limit(50);
  if (error) throw error;
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="9" class="no-data">No entries yet</td></tr>'; return; }
  tbody.innerHTML = data.map(row => `
    <tr>
      <td>${escapeHtml(row.entry_date)}</td>
      <td>${renderPrayerStatus(row.fajr_status || row.fajr, row.fajr_takbeer)}</td>
      <td>${renderPrayerStatus(row.zuhr_status || row.zuhr, row.zuhr_takbeer)}</td>
      <td>${renderPrayerStatus(row.asr_status || row.asr, row.asr_takbeer)}</td>
      <td>${renderPrayerStatus(row.maghrib_status || row.maghrib, row.maghrib_takbeer)}</td>
      <td>${renderPrayerStatus(row.isha_status || row.isha, row.isha_takbeer)}</td>
      <td>${row.lifeline_used ? 'Yes' : 'No'}</td>
      <td>${escapeHtml(row.break_reason || '-')}</td>
      <td>${formatTimestamp(row.submitted_at)}</td>
    </tr>`).join('');
}

function renderPrayerStatus(status, takbeer) {
  if (!status) return '-';
  if (status === 'jamat' && takbeer) return 'Takbeer-e-Ula';
  if (status === 'no-jamat') return 'No Jamat';
  return titleCase(status);
}

async function updateLeaderboard() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, approved, is_admin, challenge_progress(streak)')
    .eq('approved', true)
    .eq('is_admin', false)
    .order('full_name', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const rows = (data || []).map(item => ({
    id: item.id,
    full_name: item.full_name || 'User',
    streak: item.challenge_progress?.[0]?.streak || 0
  })).sort((a, b) => b.streak - a.streak || a.full_name.localeCompare(b.full_name));

  renderLeaderboardSimple(document.getElementById('preview-leaderboard'), rows.slice(0, 5));
  renderLeaderboardSimple(document.getElementById('leaderboard-body'), rows);
}

function renderLeaderboardSimple(target, rows) {
  if (!target) return;
  if (!rows.length) { target.innerHTML = '<tr><td colspan="3" class="no-data">No approved participants yet</td></tr>'; return; }
  target.innerHTML = rows.map((row, idx) => `<tr><td>#${idx + 1}</td><td>${escapeHtml(row.full_name)}</td><td>${row.streak}</td></tr>`).join('');
}

async function loadAdminDashboard() {
  if (!appState.currentAdmin) { displayPage('login-page'); return; }
  await Promise.all([loadPendingApprovals(), loadAdminUsers()]);
  showAdminTab('pending');
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.getElementById('tab-pending').classList.toggle('hidden', tab !== 'pending');
  document.getElementById('tab-users').classList.toggle('hidden', tab !== 'users');
}

async function loadPendingApprovals() {
  const box = document.getElementById('pending-users-list');
  const { data, error } = await supabaseClient.from('profiles').select('id, full_name, username, email, created_at').eq('approved', false).eq('is_admin', false).order('created_at', { ascending: false });
  if (error) throw error;
  if (!data.length) { box.innerHTML = '<div class="no-data">No pending approvals</div>'; return; }
  box.innerHTML = data.map(u => `
    <div class="pending-card">
      <h4>${escapeHtml(u.full_name || u.username)}</h4>
      <p class="muted">${escapeHtml(u.username)} • ${escapeHtml(u.email)}</p>
      <div class="pending-actions">
        <button class="btn btn-primary approve-btn" data-id="${u.id}">Approve</button>
        <button class="btn btn-danger reject-btn" data-id="${u.id}">Delete</button>
      </div>
    </div>`).join('');

  box.querySelectorAll('.approve-btn').forEach(btn => btn.addEventListener('click', async () => withLoader('Approving user...', () => adminApproveUser(btn.dataset.id))));
  box.querySelectorAll('.reject-btn').forEach(btn => btn.addEventListener('click', async () => withLoader('Deleting user data...', () => adminDeleteUserData(btn.dataset.id))));
}

async function loadAdminUsers() {
  const [profilesRes, progressRes] = await Promise.all([
    supabaseClient.from('profiles').select('id, full_name, username, email, approved, is_admin').order('created_at', { ascending: false }),
    supabaseClient.from('challenge_progress').select('*')
  ]);
  if (profilesRes.error || progressRes.error) throw (profilesRes.error || progressRes.error);
  const progressMap = new Map((progressRes.data || []).map(row => [row.user_id, normalizeProgress(row)]));
  appState.adminUsers = (profilesRes.data || []).map(p => ({
    ...p,
    progress: progressMap.get(p.id) || normalizeProgress({})
  }));
  renderAdminUsersTable();
  if (appState.selectedAdminUserId) await loadAdminUserDetails(appState.selectedAdminUserId);
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-users-table-body');
  const term = (document.getElementById('admin-user-search').value || '').trim().toLowerCase();
  const rows = appState.adminUsers.filter(u => !u.is_admin).filter(u => {
    const text = `${u.full_name} ${u.username} ${u.email}`.toLowerCase();
    return !term || text.includes(term);
  });
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="no-data">No users found</td></tr>'; return; }
  tbody.innerHTML = rows.map(u => `<tr><td>${escapeHtml(u.full_name || '-') }</td><td>${escapeHtml(u.username || '-')}</td><td>${escapeHtml(u.email || '-')}</td><td>${u.progress.streak}</td><td>${u.progress.current_lifelines}</td><td><button class="btn btn-light inspect-btn" data-id="${u.id}">Inspect</button></td></tr>`).join('');
  tbody.querySelectorAll('.inspect-btn').forEach(btn => btn.addEventListener('click', async () => withLoader('Loading user details...', () => loadAdminUserDetails(btn.dataset.id))));
}

async function loadAdminUserDetails(userId) {
  appState.selectedAdminUserId = userId;
  const profile = appState.adminUsers.find(u => u.id === userId);
  const empty = document.getElementById('admin-user-detail-empty');
  const detail = document.getElementById('admin-user-detail');
  if (!profile) return;

  const historyRes = await supabaseClient.from('salah_entries').select('*').eq('user_id', userId).order('entry_date', { ascending: false }).limit(80);
  if (historyRes.error) throw historyRes.error;
  const p = profile.progress;
  document.getElementById('detail-name').textContent = profile.full_name || profile.username;
  document.getElementById('detail-email').textContent = `${profile.username} • ${profile.email}`;
  document.getElementById('detail-streak').textContent = p.streak;
  document.getElementById('detail-lifelines').textContent = p.current_lifelines;
  document.getElementById('detail-earned').textContent = p.lifelines_earned;
  document.getElementById('detail-used').textContent = p.lifelines_used;
  document.getElementById('admin-set-streak').value = p.streak;
  document.getElementById('admin-lifeline-change').value = '';

  const tbody = document.getElementById('admin-detail-history-body');
  const history = historyRes.data || [];
  tbody.innerHTML = history.length ? history.map(row => `<tr><td>${escapeHtml(row.entry_date)}</td><td>${renderPrayerStatus(row.fajr_status || row.fajr, row.fajr_takbeer)}</td><td>${renderPrayerStatus(row.zuhr_status || row.zuhr, row.zuhr_takbeer)}</td><td>${renderPrayerStatus(row.asr_status || row.asr, row.asr_takbeer)}</td><td>${renderPrayerStatus(row.maghrib_status || row.maghrib, row.maghrib_takbeer)}</td><td>${renderPrayerStatus(row.isha_status || row.isha, row.isha_takbeer)}</td><td>${row.streak_before_submission ?? '-'}</td><td>${row.streak_after_submission ?? '-'}</td><td>${escapeHtml(row.break_reason || '-')}</td></tr>`).join('') : '<tr><td colspan="9" class="no-data">No history for this user</td></tr>';

  empty.classList.add('hidden');
  detail.classList.remove('hidden');
}

async function adminApproveUser(userId) {
  const res = await supabaseClient.from('profiles').update({ approved: true }).eq('id', userId).select('full_name').single();
  if (res.error) throw res.error;
  await Promise.all([loadPendingApprovals(), loadAdminUsers(), updateLeaderboard()]);
  await showPopup({ title: 'User approved ✅', message: `${res.data.full_name || 'User'} is now approved.`, emoji: '✅' });
}

async function adminSetStreak() {
  if (!appState.selectedAdminUserId) { await showPopup({ title: 'Select a user', message: 'Choose a user first.', emoji: '👤' }); return; }
  const value = Number(document.getElementById('admin-set-streak').value);
  if (!Number.isFinite(value) || value < 0) { await showPopup({ title: 'Invalid streak', message: 'Enter a valid non-negative streak.', emoji: '⚠️' }); return; }
  const res = await supabaseClient.from('challenge_progress').update({ streak: value, current_checkpoint: highestCheckpointAtOrBelow(value), updated_at: new Date().toISOString() }).eq('user_id', appState.selectedAdminUserId);
  if (res.error) throw res.error;
  await loadAdminUsers();
  await showPopup({ title: 'Streak updated', message: 'Custom streak value saved successfully.', emoji: '📈' });
}

async function adminAdjustLifelines() {
  if (!appState.selectedAdminUserId) { await showPopup({ title: 'Select a user', message: 'Choose a user first.', emoji: '👤' }); return; }
  const delta = Number(document.getElementById('admin-lifeline-change').value);
  if (!Number.isFinite(delta) || delta === 0) { await showPopup({ title: 'Invalid value', message: 'Enter a positive or negative lifeline value.', emoji: '⚠️' }); return; }

  const user = appState.adminUsers.find(u => u.id === appState.selectedAdminUserId);
  const current = user.progress;
  const payload = {
    current_lifelines: Math.max(0, current.current_lifelines + delta),
    lifelines_earned: delta > 0 ? current.lifelines_earned + delta : current.lifelines_earned,
    lifelines_used: delta < 0 ? current.lifelines_used + Math.abs(delta) : current.lifelines_used,
    updated_at: new Date().toISOString()
  };
  const res = await supabaseClient.from('challenge_progress').update(payload).eq('user_id', appState.selectedAdminUserId);
  if (res.error) throw res.error;
  await supabaseClient.from('lifeline_events').insert({ user_id: appState.selectedAdminUserId, event_type: delta > 0 ? 'manual_add' : 'manual_remove', count_change: delta, reason: 'Admin adjustment', created_at: new Date().toISOString(), created_by: appState.currentUser.id });
  await loadAdminUsers();
  await showPopup({ title: 'Lifelines updated', message: 'Lifeline count has been adjusted.', emoji: delta > 0 ? '🎁' : '🛟' });
}

async function adminDeleteUser() {
  if (!appState.selectedAdminUserId) {
    await showPopup({ title: 'Select a user', message: 'Choose a user first.', emoji: '👤' });
    return;
  }
  await adminDeleteUserData(appState.selectedAdminUserId, true);
}

async function adminDeleteUserData(userId, fromDetails = false) {
  const user = appState.adminUsers.find(u => u.id === userId);
  const ok = await showPopup({ title: 'Delete user data?', message: `This will remove website data for ${user?.full_name || user?.username || 'this user'}. Auth user in Supabase may still remain.`, emoji: '🗑️', confirm: true, danger: true, confirmText: 'Delete' });
  if (!ok) return;

  await supabaseClient.from('lifeline_events').delete().eq('user_id', userId);
  await supabaseClient.from('salah_entries').delete().eq('user_id', userId);
  await supabaseClient.from('challenge_progress').delete().eq('user_id', userId);
  const profileDel = await supabaseClient.from('profiles').delete().eq('id', userId);
  if (profileDel.error) throw profileDel.error;

  if (fromDetails) {
    appState.selectedAdminUserId = null;
    document.getElementById('admin-user-detail').classList.add('hidden');
    document.getElementById('admin-user-detail-empty').classList.remove('hidden');
  }
  await Promise.all([loadPendingApprovals(), loadAdminUsers(), updateLeaderboard()]);
  await showPopup({ title: 'User data deleted', message: 'Website profile, progress, entries, and lifeline history were removed.', emoji: '🗑️' });
}

async function saveCheckpoints() {
  const raw = document.getElementById('checkpoint-input').value;
  const values = raw.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!values.length) { await showPopup({ title: 'Invalid checkpoints', message: 'Enter valid numbers separated by commas.', emoji: '⚠️' }); return; }
  const res = await supabaseClient.from('app_config').upsert({ id: 1, checkpoints: values, updated_at: new Date().toISOString(), updated_by: appState.currentUser.id }, { onConflict: 'id' });
  if (res.error) throw res.error;
  appState.checkpoints = values;
  renderProgressPath(appState.currentProgress?.streak || 0);
  await showPopup({ title: 'Checkpoints saved', message: 'Checkpoint milestones updated successfully.', emoji: '🏁' });
}

function titleCase(value) { return value ? value.charAt(0).toUpperCase() + value.slice(1) : value; }
function formatTimestamp(value) { return value ? new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'; }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
