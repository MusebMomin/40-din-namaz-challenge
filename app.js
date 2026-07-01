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
const MILESTONE_REWARDS = [10, 20, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

const appState = {
  currentUser: null,
  currentProfile: null,
  currentProgress: null,
  currentAdmin: null,
  checkpoints: [...DEFAULT_CHECKPOINTS],
  adminUsers: [],
  selectedAdminUserId: null,
  popupResolve: null,
  stateLoadedAt: null  // timestamp of last successful loadUserContext
};

// Simple in-memory cache for leaderboard (60-second TTL)
const leaderboardCache = { data: null, ts: 0, TTL: 60_000 };
let _breakCheckDate = null; // guard: run missed-day check at most once per calendar day

window.addEventListener('DOMContentLoaded', async () => {
  setupPopup();
  setupEventListeners();
  setupHamburger();
  bindAuthListener();
  await withLoader('Loading your challenge...', restoreSession);
});

function setupEventListeners() {
  addClick('nav-home', () => displayPage('home-page'));
  addClick('nav-login', () => displayPage('login-page'));
  addClick('nav-register', () => displayPage('register-page'));

  addClick('nav-dashboard', async () =>
    withLoader('Opening dashboard...', async () => {
      await refreshCurrentUserState();
      displayPage('dashboard-page');
    })
  );

  addClick('nav-admin-dashboard', async () =>
    withLoader('Opening admin panel...', async () => {
      await refreshCurrentUserState();
      displayPage('admin-dashboard-page');
    })
  );

  addClick('nav-leaderboard', async () => {
    displayPage('leaderboard-page');
    await updateLeaderboard();
  });

  addClick('nav-logout', logout);

  addClick('hero-login-btn', () => displayPage('login-page'));
  addClick('hero-register-btn', () => displayPage('register-page'));

  addClick('about-challenge-btn', () => {
    document.getElementById('about-modal').classList.remove('hidden');
  });

  addClick('close-about-btn', () => {
    document.getElementById('about-modal').classList.add('hidden');
  });

  const aboutModal = document.getElementById('about-modal');
  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target.id === 'about-modal') {
        aboutModal.classList.add('hidden');
      }
    });
  }

  addClick('refresh-history-btn', async () =>
    withLoader('Refreshing history...', loadMyHistory)
  );

  addClick('refresh-users-btn', async () =>
    withLoader('Refreshing users...', loadAdminUsers)
  );

  addClick('save-checkpoints-btn', async () =>
    withLoader('Saving checkpoints...', saveCheckpoints)
  );

  addClick('set-streak-btn', async () =>
    withLoader('Updating streak...', adminSetStreak)
  );

  addClick('apply-lifeline-btn', async () =>
    withLoader('Applying lifeline change...', adminAdjustLifelines)
  );

  addClick('delete-user-btn', async () =>
    withLoader('Deleting user data...', adminDeleteUser)
  );

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) =>
      withLoader('Signing you in...', () => handleLogin(e))
    );
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) =>
      withLoader('Creating your account...', () => handleRegister(e))
    );
  }

  const salahForm = document.getElementById('salah-form');
  if (salahForm) {
    salahForm.addEventListener('submit', async (e) =>
      withLoader('Submitting your Salah entry...', () => handleSalahSubmit(e))
    );
  }

  document.querySelectorAll('.status-checkbox').forEach((cb) =>
    cb.addEventListener('change', handleStatusCheckboxChange)
  );

  document.querySelectorAll('.takbeer-checkbox').forEach((cb) =>
    cb.addEventListener('change', handleTakbeerCheckboxChange)
  );

  document.querySelectorAll('.admin-tab-btn').forEach((btn) =>
    btn.addEventListener('click', () => showAdminTab(btn.dataset.tab))
  );

  const search = document.getElementById('admin-user-search');
  if (search) {
    let searchTimer;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderAdminUsersTable, 180);
    });
  }
}

function setupHamburger() {
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // Close menu when a nav link is clicked
  menu.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
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
  const btn = document.getElementById('popup-ok-btn');
  if (btn) btn.onclick = () => closePopup(true);
}

function showLoader(text = 'Loading...') {
  const t = document.getElementById('loader-text');
  const box = document.getElementById('global-loader');
  if (t) t.textContent = text;
  if (box) box.classList.remove('hidden');
}

function hideLoader() {
  const box = document.getElementById('global-loader');
  if (box) box.classList.add('hidden');
}

async function withLoader(text, fn) {
  try {
    showLoader(text);
    return await fn();
  } finally {
    hideLoader();
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showPopup({
  title = 'Done',
  message = '',
  emoji = '✨',
  danger = false,
  confirm = false,
  confirmText = 'Yes',
  cancelText = 'Cancel'
}) {
  const modal = document.getElementById('popup-modal');
  const titleEl = document.getElementById('popup-title');
  const msgEl = document.getElementById('popup-message');
  const emojiEl = document.getElementById('popup-emoji');
  const actions = document.getElementById('popup-actions');

  if (!modal || !titleEl || !msgEl || !emojiEl || !actions) return Promise.resolve(false);

  titleEl.textContent = title;
  msgEl.textContent = message;
  emojiEl.textContent = emoji;
  actions.innerHTML = '';

  if (confirm) {
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-light';
    cancel.textContent = cancelText;
    cancel.onclick = () => closePopup(false);

    const ok = document.createElement('button');
    ok.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    ok.textContent = confirmText;
    ok.onclick = () => closePopup(true);

    actions.append(cancel, ok);
  } else {
    const ok = document.createElement('button');
    ok.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    ok.textContent = 'OK';
    ok.onclick = () => closePopup(true);
    actions.append(ok);
  }

  modal.classList.remove('hidden');
  return new Promise((resolve) => {
    appState.popupResolve = resolve;
  });
}

function closePopup(val) {
  const modal = document.getElementById('popup-modal');
  if (modal) modal.classList.add('hidden');
  if (appState.popupResolve) {
    const r = appState.popupResolve;
    appState.popupResolve = null;
    r(val);
  }
}

function bindAuthListener() {
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      clearCurrentState();
      updateNavigation();
      displayPage('login-page');
      return;
    }
    try {
      await loadUserContext(session.user);
      updateNavigation();
    } catch (e) {
      console.error(e);
    }
  });
}

async function restoreSession() {
  // Run checkpoint fetch and session check in parallel — saves one full RTT
  const [, { data }] = await Promise.all([
    loadCheckpoints(),
    supabaseClient.auth.getSession()
  ]);

  if (data.session?.user) {
    await loadUserContext(data.session.user);
    updateNavigation();
    displayPage(appState.currentAdmin ? 'admin-dashboard-page' : 'dashboard-page');
    // Warm leaderboard cache in background after session restore
    updateLeaderboard().catch(() => {});
  } else {
    updateNavigation();
    displayPage('login-page');
  }
}

async function loadCheckpoints() {
  const { data } = await supabaseClient
    .from('app_config')
    .select('checkpoints')
    .eq('id', 1)
    .maybeSingle();

  if (data?.checkpoints?.length) {
    appState.checkpoints = data.checkpoints.map(Number).sort((a, b) => a - b);
  }

  const input = document.getElementById('checkpoint-input');
  if (input) input.value = appState.checkpoints.join(',');
}

function clearCurrentState() {
  appState.currentUser = null;
  appState.currentProfile = null;
  appState.currentProgress = null;
  appState.currentAdmin = null;
  appState.selectedAdminUserId = null;
  _breakCheckDate = null; // reset so check reruns on next login
  appState.stateLoadedAt = null;
}

function normalizeProgress(row = {}) {
  return {
    ...row,
    streak: row.streak || 0,
    current_lifelines: row.current_lifelines || 0,
    lifelines_earned: row.lifelines_earned || 0,
    lifelines_used: row.lifelines_used || 0,
    current_checkpoint: row.current_checkpoint || 0,
    milestone_rewards: Array.isArray(row.milestone_rewards)
      ? row.milestone_rewards.map(Number)
      : [],
    last_submission_date: row.last_submission_date || null,
    missed_days_count: row.missed_days_count || 0
  };
}

async function resolveLoginEmail(identifier) {
  const { data, error } = await supabaseClient.rpc('resolve_login_email', {
    login_input: identifier.toLowerCase()
  });
  if (error) throw error;
  return data || identifier;
}

async function deriveUniqueUsernameFromEmail(email) {
  let base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 20) || 'user';

  let candidate = base;
  let i = 1;

  while (i < 100) {
    const { data, error } = await supabaseClient.rpc('is_username_available', {
      username_input: candidate
    });
    if (error) throw error;
    if (data) return candidate;
    candidate = `${base}${i}`.slice(0, 24);
    i++;
  }

  return `${base}${Date.now().toString().slice(-4)}`;
}

async function handleRegister(e) {
  e.preventDefault();

  const fullName = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim().toLowerCase();
  const password = document.getElementById('register-password').value;

  if (!fullName || !email || !password) {
    await showPopup({
      title: 'Missing details',
      message: 'Please fill Full Name, Email and Password.',
      emoji: '📝'
    });
    return;
  }

  const username = await deriveUniqueUsernameFromEmail(email);

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName }
    }
  });

  if (error) {
    await showPopup({
      title: 'Registration failed',
      message: error.message || 'Unable to create account.',
      emoji: '❌',
      danger: true
    });
    return;
  }

  if (data.user) {
    await supabaseClient
      .from('profiles')
      .update({ username, full_name: fullName, email })
      .eq('id', data.user.id);
  }

  document.getElementById('register-form').reset();

  await showPopup({
    title: 'Registration successful 🎉',
    message: `Your account was created and your username is ${username}. It is now waiting for admin approval.`,
    emoji: '🎉'
  });

  displayPage('login-page');
}

async function handleLogin(e) {
  e.preventDefault();

  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  if (!identifier || !password) {
    await showPopup({
      title: 'Login info missing',
      message: 'Please enter username/email and password.',
      emoji: '🔐'
    });
    return;
  }

  const email = await resolveLoginEmail(identifier);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    await showPopup({
      title: 'Login failed',
      message: error.message || 'Invalid login.',
      emoji: '❌',
      danger: true
    });
    return;
  }

  await loadUserContext(data.user);
  document.getElementById('login-form').reset();
  displayPage(appState.currentAdmin ? 'admin-dashboard-page' : 'dashboard-page');
  // Warm leaderboard cache in background — don’t block login flow
  updateLeaderboard().catch(() => {});
}

async function loadUserContext(user) {
  appState.currentUser = user;

  const [profileResult, progressResult] = await Promise.all([
    supabaseClient.from('profiles').select('*').eq('id', user.id).single(),
    supabaseClient.from('challenge_progress').select('*').eq('user_id', user.id).single()
  ]);

  if (profileResult.error || progressResult.error) {
    throw profileResult.error || progressResult.error;
  }

  appState.currentProfile = profileResult.data;
  appState.currentProgress = normalizeProgress(progressResult.data);
  appState.currentAdmin = appState.currentProfile.is_admin ? appState.currentProfile : null;
  appState.stateLoadedAt = Date.now();
}

async function refreshCurrentUserState() {
  if (appState.currentUser) await loadUserContext(appState.currentUser);
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
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) page.classList.add('active');

  if (id === 'dashboard-page') updateDashboard();
  if (id === 'admin-dashboard-page') loadAdminDashboard();
}

async function logout() {
  await supabaseClient.auth.signOut();
  clearCurrentState();
  updateNavigation();
  displayPage('home-page');
}

async function evaluateMissedDayBreakForCurrentUser() {
  if (!appState.currentUser || !appState.currentProgress) return;

  const todayStr = formatDate(new Date());

  // Only fire once per calendar day per session to prevent double-consuming lifelines
  // when the function is called from both updateDashboard and handleSalahSubmit.
  if (_breakCheckDate === todayStr) return;
  _breakCheckDate = todayStr;

  const today = startOfDay(new Date());
  const last = appState.currentProgress.last_submission_date
    ? startOfDay(appState.currentProgress.last_submission_date)
    : null;

  if (!last) return;

  // Guard against NaN from malformed date strings (e.g. ISO timestamps from DB)
  const missed = Math.max(0, Math.floor((today - last) / DAY_MS));
  if (!Number.isFinite(missed) || missed < 2) return;

  if (appState.currentProgress.current_lifelines > 0) {
    const update = await supabaseClient
      .from('challenge_progress')
      .update({
        current_lifelines: appState.currentProgress.current_lifelines - 1,
        lifelines_used: appState.currentProgress.lifelines_used + 1,
        missed_days_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', appState.currentUser.id)
      .select()
      .single();

    if (!update.error) {
      appState.currentProgress = normalizeProgress(update.data);
      await insertLifelineEvents(appState.currentUser.id, [
        {
          event_type: 'use',
          count_change: -1,
          reason: 'Automatic protection after 2 missed days'
        }
      ]);
    }
  } else {
    const reset = await supabaseClient
      .from('challenge_progress')
      .update({
        streak: appState.currentProgress.current_checkpoint,
        missed_days_count: missed,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', appState.currentUser.id)
      .select()
      .single();

    if (!reset.error) {
      appState.currentProgress = normalizeProgress(reset.data);
    }
  }
}

async function updateDashboard() {
  if (!appState.currentUser) {
    displayPage('login-page');
    return;
  }

  // Skip re-fetching if state was loaded within the last 10 seconds
  // (avoids a redundant round-trip right after restoreSession/login loads fresh data)
  const STATE_FRESH_MS = 10_000;
  const isFresh = appState.stateLoadedAt && (Date.now() - appState.stateLoadedAt < STATE_FRESH_MS);
  if (!isFresh) {
    await refreshCurrentUserState();
  }

  await evaluateMissedDayBreakForCurrentUser();

  const p = appState.currentProfile;
  const progress = appState.currentProgress;

  document.getElementById('dashboard-greeting').textContent =
    `Assalamu Alaikum, ${p.full_name || p.username || p.email}`;

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
  if (!host) return;

  host.innerHTML = '';
  const totalDays = 40;
  const checkpointDays = new Set([5, 15, 25, 35]);

  for (let day = 1; day <= totalDays; day++) {
    const node = document.createElement('div');
    const classes = ['path-node'];

    if (day <= currentStreak) classes.push('done');
    else classes.push('pending');

    if (day === currentStreak + 1) classes.push('current');
    if (checkpointDays.has(day)) classes.push('checkpoint-node');
    if (MILESTONE_REWARDS.includes(day)) classes.push('milestone-node');
    if (day === 40) classes.push('finish-node');

    node.className = classes.join(' ');

    let icon = '📍';
    let iconClass = '';

    if (day <= currentStreak) icon = '✅';
    if (checkpointDays.has(day)) {
      icon = '📍';
      iconClass = 'checkpoint-icon';
    }
    if (MILESTONE_REWARDS.includes(day)) {
      icon = '🎁';
      iconClass = 'milestone-icon';
    }
    if (day === 40) {
      icon = '🏁';
      iconClass = 'finish-icon';
    }

    node.innerHTML = `
      <div class="icon ${iconClass}">${icon}</div>
      <div class="day">Day ${day}</div>
    `;

    if (MILESTONE_REWARDS.includes(day)) {
      const tip = document.createElement('div');
      tip.className = 'milestone-hover';
      tip.textContent = `Reach Day ${day} to unlock +1 lifeline`;
      node.appendChild(tip);

      node.addEventListener('click', () =>
        showPopup({
          title: 'Milestone reward 🎁',
          message: `Complete your streak until Day ${day} to receive +1 lifeline.`,
          emoji: '🎁'
        })
      );
    }

    host.appendChild(node);
  }
}

function prepareEntryDateInput() {
  const entryInput = document.getElementById('entry-date');
  const now = new Date();
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY_MS);

  entryInput.max = formatDate(today);

  if (!entryInput.value) {
    // Default to yesterday before Isha, today after Isha
    entryInput.value = now.getHours() < ISHA_HOUR ? formatDate(yesterday) : formatDate(today);
  }
}

// Renders tap-friendly prayer cards for mobile screens.
// On desktop these are hidden via CSS; the regular table is shown instead.



function formatDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];
}

// Convert yyyy-mm-dd (or ISO timestamp) to dd-mm-yyyy for display only.
// formatDate() must remain yyyy-mm-dd for HTML date inputs and DB storage.
function displayDate(isoStr) {
  if (!isoStr) return '-';
  const parts = String(isoStr).split('T')[0].split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function startOfDay(dateOrStr) {
  // Strip time/timezone component so ISO timestamps like "2026-06-23T00:00:00+05:00"
  // don't produce an Invalid Date when we naively append 'T00:00:00'.
  const dateOnly = typeof dateOrStr === 'string' ? dateOrStr.split('T')[0] : dateOrStr;
  const d = typeof dateOnly === 'string'
    ? new Date(dateOnly + 'T00:00:00')
    : new Date(dateOnly);
  d.setHours(0, 0, 0, 0);
  return d;
}

const ISHA_HOUR = 20; // 8 PM — earliest time today's entry can be submitted

function validateEntryDateWindow(value) {
  if (!value) return { ok: false, message: 'Please choose an entry date.' };

  const now = new Date();
  const today = startOfDay(new Date());
  const yesterday = new Date(today.getTime() - DAY_MS);
  const entry = startOfDay(value);

  if (entry.getTime() === today.getTime()) {
    if (now.getHours() < ISHA_HOUR) {
      return {
        ok: false,
        message: `Today's entry can only be submitted after ${ISHA_HOUR % 12 || 12}:00 PM (Isha time). You can still submit yesterday's entry now.`
      };
    }
    return { ok: true };
  }

  if (entry.getTime() === yesterday.getTime()) {
    return { ok: true };
  }

  return { ok: false, message: 'Only today or yesterday can be submitted.' };
}

function showSubmissionWarning(msg) {
  const box = document.getElementById('submission-warning');
  box.textContent = msg || '';
  box.classList.toggle('hidden', !msg);
}

function handleTakbeerCheckboxChange(e) {
  const prayer = e.target.dataset.prayer;
  const jamat  = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="jamat"]`);
  const noJamat = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="no-jamat"]`);
  const school  = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="no-jamat-school"]`);
  const qaza   = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="qaza"]`);

  if (e.target.checked) {
    jamat.checked   = true;
    noJamat.checked = false;
    if (school) school.checked = false;
    qaza.checked    = false;
  }
}

function handleStatusCheckboxChange(e) {
  const prayer = e.target.dataset.prayer;
  const status = e.target.dataset.status;
  const all = document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`);

  if (e.target.checked) {
    all.forEach((box) => {
      if (box !== e.target) box.checked = false;
    });

    // School = Jamat equivalent: auto-switch to Jamat so it stores correctly
    if (status === 'no-jamat-school') {
      e.target.checked = false;
      const jamat = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="jamat"]`);
      if (jamat) jamat.checked = true;
      return;
    }
  }

  const takbeer = document.querySelector(`.takbeer-checkbox[data-prayer="${prayer}"]`);
  if (status === 'jamat' && !e.target.checked) takbeer.checked = false;
  if (status !== 'jamat' && e.target.checked) takbeer.checked = false;
}

function collectPrayerStatus() {
  const out = {};

  for (const prayer of PRAYERS) {
    const checked = Array.from(
      document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`)
    ).filter((x) => x.checked);

    if (checked.length !== 1) {
      return {
        ok: false,
        message: `Please select exactly one status for ${titleCase(prayer)}.`
      };
    }

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
    await showPopup({
      title: 'Approval pending',
      message: 'Your account needs admin approval before submission.',
      emoji: '⏳'
    });
    return;
  }

  await evaluateMissedDayBreakForCurrentUser();

  const entryDate = document.getElementById('entry-date').value;
  const windowCheck = validateEntryDateWindow(entryDate);

  if (!windowCheck.ok) {
    await showPopup({
      title: 'Cannot submit yet, try after 8pm !',
      message: windowCheck.message,
      emoji: '⏰'
    });
    return;
  }

  showSubmissionWarning('');

  const existing = await supabaseClient
    .from('salah_entries')
    .select('id')
    .eq('user_id', appState.currentUser.id)
    .eq('entry_date', entryDate)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    await showPopup({
      title: 'Already submitted',
      message: 'Duplicate submissions for the same day are not allowed.',
      emoji: '📅'
    });
    return;
  }

  const collected = collectPrayerStatus();
  if (!collected.ok) {
    await showPopup({
      title: 'Submission incomplete',
      message: collected.message,
      emoji: '📝'
    });
    return;
  }

  const entry = collected.payload;
  const before = appState.currentProgress.streak;
  const evaluation = evaluateSubmissionOutcome(entry, appState.currentProgress);

  const row = {
    user_id: appState.currentUser.id,
    entry_date: entryDate,
    submission_date: formatDate(new Date()),
    submitted_at: new Date().toISOString(),

    fajr_status: entry.fajr.status,
    fajr_takbeer: entry.fajr.takbeer,
    zuhr_status: entry.zuhr.status,
    zuhr_takbeer: entry.zuhr.takbeer,
    asr_status: entry.asr.status,
    asr_takbeer: entry.asr.takbeer,
    maghrib_status: entry.maghrib.status,
    maghrib_takbeer: entry.maghrib.takbeer,
    isha_status: entry.isha.status,
    isha_takbeer: entry.isha.takbeer,

    fajr: entry.fajr.status,
    zuhr: entry.zuhr.status,
    asr: entry.asr.status,
    maghrib: entry.maghrib.status,
    isha: entry.isha.status,

    streak_before_submission: before,
    streak_after_submission: evaluation.streak,
    lifeline_used: evaluation.lifelineUsed,
    streak_broken: evaluation.streakBroken,
    break_reason: evaluation.breakReason || evaluation.decrementReason || null
  };

  // Log streak outcome for debugging
  if (evaluation.streakBroken) {
    console.warn(`[Streak] BREAK — before: ${before}, after: ${evaluation.streak}, reason: ${evaluation.breakReason}`);
  } else if (evaluation.streakDecremented) {
    console.info(`[Streak] DECREMENT — before: ${before}, after: ${evaluation.streak}, reason: ${evaluation.decrementReason}`);
  } else {
    console.info(`[Streak] +1 — before: ${before}, after: ${evaluation.streak}`);
  }

  const inserted = await supabaseClient
    .from('salah_entries')
    .insert(row)
    .select()
    .single();

  if (inserted.error) throw inserted.error;

  const progressRes = await supabaseClient
    .from('challenge_progress')
    .update({
      streak: evaluation.streak,
      current_checkpoint: evaluation.checkpoint,
      current_lifelines: evaluation.currentLifelines,
      lifelines_earned: evaluation.lifelinesEarned,
      lifelines_used: evaluation.lifelinesUsed,
      milestone_rewards: evaluation.milestoneRewards,
      last_submission_date: entryDate,
      missed_days_count: 0,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', appState.currentUser.id)
    .select()
    .single();

  if (progressRes.error) throw progressRes.error;

  appState.currentProgress = normalizeProgress(progressRes.data);
  await insertLifelineEvents(appState.currentUser.id, evaluation.lifelineEvents);

  resetPrayerTable();
  renderProgressPath(appState.currentProgress.streak);
  await loadMyHistory();
  leaderboardCache.ts = 0; // invalidate cache after own submission
  await updateLeaderboard();

  const messages = ['Your Salah entry has been submitted successfully.'];
  let emoji = '✅';
  let title = 'Submission saved';

  if (evaluation.lifelineUsed) {
    messages.push('🛟 A lifeline was used automatically to protect your streak.');
    emoji = '🛟';
    title = 'Lifeline used';
  }

  if (evaluation.streakDecremented) {
    messages.push(`📉 Streak reduced by 1 because ${evaluation.decrementReason}.`);
    emoji = '📉';
    title = 'Streak reduced';
  }

  if (evaluation.dailyRewardGranted) {
    messages.push('🎁 You earned +1 lifeline for a perfect Takbeer-e-Ula day.');
    emoji = '🎉';
    title = 'Congratulations!';
  }

  if (evaluation.milestoneRewardsGranted.length) {
    messages.push(`🏆 Milestone reward unlocked for ${evaluation.milestoneRewardsGranted.join(', ')} day streak.`);
    emoji = '🏆';
    title = 'Milestone achieved!';
  }

  if (evaluation.streakBroken && !evaluation.lifelineUsed) {
    messages.push(`⚠️ Streak reset to checkpoint ${evaluation.checkpoint} because ${evaluation.breakReason}.`);
    emoji = '⚠️';
    title = 'Streak updated';
  }

  await showPopup({
    title,
    message: messages.join(' '),
    emoji
  });
}

function evaluateSubmissionOutcome(entry, progress) {
  const statuses = PRAYERS.map((p) => entry[p].status);
  const takbeers = PRAYERS.map((p) => entry[p].takbeer);

  const noJamatCount = statuses.filter((v) => v === 'no-jamat').length;
  const qazaCount    = statuses.filter((v) => v === 'qaza').length;
  const perfectTakbeerDay = statuses.every((v) => v === 'jamat') && takbeers.every(Boolean);

  let streak = progress.streak + 1;
  let checkpoint = highestCheckpointAtOrBelow(streak);
  let currentLifelines = progress.current_lifelines;
  let lifelinesEarned = progress.lifelines_earned;
  let lifelinesUsed = progress.lifelines_used;
  let milestoneRewards = [...progress.milestone_rewards];
  let streakBroken = false;
  let streakDecremented = false;
  let decrementReason = null;
  let breakReason = null;
  let lifelineUsed = false;
  let dailyRewardGranted = false;
  const milestoneRewardsGranted = [];
  const lifelineEvents = [];

  if (qazaCount >= 2) {
    // 2+ Qaza → full streak break
    streakBroken = true;
    breakReason = '2 or more Qaza prayers were marked';
  } else if (qazaCount === 1) {
    // 1 Qaza → streak -1, no break
    streak = Math.max(0, progress.streak - 1);
    checkpoint = highestCheckpointAtOrBelow(streak);
    streakDecremented = true;
    decrementReason = '1 Qaza prayer was marked';
  } else if (noJamatCount >= 2) {
    // 2+ No Jamat → streak -1, no break
    streak = Math.max(0, progress.streak - 1);
    checkpoint = highestCheckpointAtOrBelow(streak);
    streakDecremented = true;
    decrementReason = '2 or more No Jamat prayers were marked';
  }

  if (streakBroken) {
    if (currentLifelines > 0) {
      currentLifelines -= 1;
      lifelinesUsed += 1;
      lifelineUsed = true;
      streakBroken = false;
      breakReason = 'Lifeline used';
      // Streak stays the same — lifeline protects but does not advance
      streak = progress.streak;
      checkpoint = highestCheckpointAtOrBelow(streak);
      lifelineEvents.push({
        event_type: 'use',
        count_change: -1,
        reason: 'Automatic streak protection'
      });
    } else {
      streak = progress.current_checkpoint;
      checkpoint = progress.current_checkpoint;
    }
  }

  // Takbeer reward only on a clean +1 day (no penalty, no break)
  if (!streakBroken && !streakDecremented && perfectTakbeerDay) {
    currentLifelines += 1;
    lifelinesEarned += 1;
    dailyRewardGranted = true;
    lifelineEvents.push({
      event_type: 'earn',
      count_change: 1,
      reason: 'Perfect Takbeer-e-Ula day'
    });
  }

  for (const milestone of MILESTONE_REWARDS) {
    if (streak >= milestone && !milestoneRewards.includes(milestone)) {
      milestoneRewards.push(milestone);
      currentLifelines += 1;
      lifelinesEarned += 1;
      milestoneRewardsGranted.push(milestone);
      lifelineEvents.push({
        event_type: 'earn',
        count_change: 1,
        reason: `${milestone} day streak milestone`
      });
    }
  }

  return {
    streak,
    checkpoint,
    currentLifelines,
    lifelinesEarned,
    lifelinesUsed,
    milestoneRewards,
    streakBroken,
    streakDecremented,
    decrementReason,
    breakReason,
    lifelineUsed,
    dailyRewardGranted,
    milestoneRewardsGranted,
    lifelineEvents
  };
}

function highestCheckpointAtOrBelow(streak) {
  let cp = 0;
  for (const x of appState.checkpoints) {
    if (x <= streak) cp = x;
  }
  return cp;
}

async function insertLifelineEvents(userId, events) {
  if (!events.length) return;

  const rows = events.map((e) => ({
    user_id: userId,
    event_type: e.event_type,
    count_change: e.count_change,
    reason: e.reason,
    created_at: new Date().toISOString(),
    created_by: appState.currentUser.id
  }));

  const { error } = await supabaseClient.from('lifeline_events').insert(rows);
  if (error) console.error(error);
}

function resetPrayerTable() {
  document.querySelectorAll('.status-checkbox,.takbeer-checkbox').forEach((cb) => {
    cb.checked = false;
  });
}

async function loadMyHistory() {
  const tbody = document.getElementById('history-table-body');

  const { data, error } = await supabaseClient
    .from('salah_entries')
    .select('*')
    .eq('user_id', appState.currentUser.id)
    .order('entry_date', { ascending: false })
    .limit(50);

  if (error) throw error;

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">No entries yet</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((row) => `
    <tr>
      <td>${displayDate(row.entry_date)}</td>
      <td>${renderPrayerStatus(row.fajr_status || row.fajr, row.fajr_takbeer)}</td>
      <td>${renderPrayerStatus(row.zuhr_status || row.zuhr, row.zuhr_takbeer)}</td>
      <td>${renderPrayerStatus(row.asr_status || row.asr, row.asr_takbeer)}</td>
      <td>${renderPrayerStatus(row.maghrib_status || row.maghrib, row.maghrib_takbeer)}</td>
      <td>${renderPrayerStatus(row.isha_status || row.isha, row.isha_takbeer)}</td>
      <td>${row.lifeline_used ? 'Yes' : 'No'}</td>
      <td>${escapeHtml(row.break_reason || '-')}</td>
      <td>${formatTimestamp(row.submitted_at)}</td>
    </tr>
  `).join('');
}

function renderPrayerStatus(status, takbeer) {
  if (!status) return '-';
  if (status === 'jamat' && takbeer) return 'Takbeer-e-Ula';
  if (status === 'no-jamat') return 'No Jamat';
  if (status === 'no-jamat-school') return 'School/College';
  return titleCase(status);
}

function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#2563eb', '#0e7490', '#0f766e', '#7c3aed', '#ca8a04', '#dc2626', '#db2777', '#4f46e5'];
  return colors[Math.abs(hash) % colors.length];
}

function initials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('');
}

async function updateLeaderboard(force = false) {
  const now = Date.now();
  if (!force && leaderboardCache.data && now - leaderboardCache.ts < leaderboardCache.TTL) {
    const rows = leaderboardCache.data;
    renderLeaderboard(rows);
    return;
  }

  const [profilesRes, progressRes] = await Promise.all([
    supabaseClient
      .from('profiles')
      .select('id, full_name, approved, is_admin')
      .eq('approved', true)
      .eq('is_admin', false),
    supabaseClient
      .from('challenge_progress')
      .select('user_id, streak')
  ]);

  if (profilesRes.error || progressRes.error) {
    console.error(profilesRes.error || progressRes.error);
    return;
  }

  const streakMap = new Map((progressRes.data || []).map((r) => [r.user_id, r.streak || 0]));

  const rows = (profilesRes.data || [])
    .map((p) => ({
      id: p.id,
      full_name: p.full_name || 'User',
      streak: streakMap.get(p.id) || 0
    }))
    .sort((a, b) => b.streak - a.streak || a.full_name.localeCompare(b.full_name));

  leaderboardCache.data = rows;
  leaderboardCache.ts = Date.now();

  renderLeaderboard(rows);
}

function renderLeaderboard(rows) {
  renderPodium(rows.slice(0, 3));
  renderList(rows.slice(3));
}

function renderPodium(top) {
  const host = document.getElementById('lb-podium');
  if (!host) return;

  if (!top.length) {
    host.innerHTML = '<p class="no-data" style="width:100%">No participants yet.</p>';
    return;
  }

  // Display order: 2nd, 1st, 3rd so #1 is visually tallest in center
  const display = [top[1], top[0], top[2]].filter(Boolean);
  const rankOf = (slot) => slot === top[0] ? 1 : slot === top[1] ? 2 : 3;
  const medals  = ['🥇', '🥈', '🥉'];
  const crowns  = { 1: '👑', 2: '', 3: '' };

  host.innerHTML = display.map((p) => {
    const rank    = rankOf(p);
    const color   = colorFromString(p.full_name);
    const crown   = crowns[rank] ? `<span class="lb-podium-crown">${crowns[rank]}</span>` : '';
    return `
      <div class="lb-podium-slot" data-rank="${rank}">
        <div class="lb-podium-avatar" style="background:${color}">
          ${crown}
          ${initials(p.full_name)}
        </div>
        <div class="lb-podium-name">${escapeHtml(p.full_name)}</div>
        <div class="lb-podium-streak"><strong>${p.streak}</strong> days</div>
        <div class="lb-podium-base">${medals[rank - 1]}</div>
      </div>
    `;
  }).join('');
}

function renderList(rows) {
  const host = document.getElementById('lb-list');
  if (!host) return;

  if (!rows.length) { host.innerHTML = ''; return; }

  const maxStreak = Math.max(...rows.map((r) => r.streak), 1);

  host.innerHTML = rows.map((row, idx) => {
    const rank  = idx + 4;
    const color = colorFromString(row.full_name);
    const pct   = Math.max(4, Math.round((row.streak / maxStreak) * 100));
    const delay = Math.min(idx * 0.05, 0.5);
    return `
      <div class="lb-row" style="animation-delay:${delay}s">
        <div class="lb-rank">#${rank}</div>
        <div class="lb-avatar" style="background:${color}">${initials(row.full_name)}</div>
        <div class="lb-name">${escapeHtml(row.full_name)}</div>
        <div class="lb-streak-bar-wrap">
          <div class="lb-bar-bg"><div class="lb-bar-fill" style="width:${pct}%;animation-delay:${delay + 0.2}s"></div></div>
          <div class="lb-streak-num">${row.streak}</div>
        </div>
      </div>
    `;
  }).join('');
}

// Keep old name as alias so cache path still works
function renderLeaderboardSimple(target, rows) { /* no-op: replaced by renderLeaderboard */ }

async function loadAdminDashboard() {
  if (!appState.currentAdmin) {
    displayPage('login-page');
    return;
  }

  await Promise.all([loadPendingApprovals(), loadAdminUsers()]);
  showAdminTab('pending');
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.tab === tab)
  );

  document.getElementById('tab-pending').classList.toggle('hidden', tab !== 'pending');
  document.getElementById('tab-users').classList.toggle('hidden', tab !== 'users');
}

async function loadPendingApprovals() {
  const box = document.getElementById('pending-users-list');

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, username, email, created_at')
    .eq('approved', false)
    .eq('is_admin', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data.length) {
    box.innerHTML = '<div class="no-data">No pending approvals</div>';
    return;
  }

  box.innerHTML = data.map((u) => `
    <div class="pending-card">
      <h4>${escapeHtml(u.full_name || u.username)}</h4>
      <p class="muted">${escapeHtml(u.username)} • ${escapeHtml(u.email)}</p>
      <div class="pending-actions">
        <button class="btn btn-primary approve-btn" data-id="${u.id}">Approve</button>
        <button class="btn btn-danger reject-btn" data-id="${u.id}">Delete</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.approve-btn').forEach((btn) =>
    btn.addEventListener('click', async () =>
      withLoader('Approving user...', () => adminApproveUser(btn.dataset.id))
    )
  );

  box.querySelectorAll('.reject-btn').forEach((btn) =>
    btn.addEventListener('click', async () =>
      withLoader('Deleting user data...', () => adminDeleteUserData(btn.dataset.id))
    )
  );
}

async function loadAdminUsers() {
  const [profilesRes, progressRes] = await Promise.all([
    supabaseClient
      .from('profiles')
      .select('id, full_name, username, email, approved, is_admin')
      .order('created_at', { ascending: false }),
    supabaseClient.from('challenge_progress').select('*')
  ]);

  if (profilesRes.error || progressRes.error) {
    throw profilesRes.error || progressRes.error;
  }

  const progressMap = new Map(
    (progressRes.data || []).map((row) => [row.user_id, normalizeProgress(row)])
  );

  appState.adminUsers = (profilesRes.data || []).map((p) => ({
    ...p,
    progress: progressMap.get(p.id) || normalizeProgress({})
  }));

  renderAdminUsersTable();

  if (appState.selectedAdminUserId) {
    await loadAdminUserDetails(appState.selectedAdminUserId);
  }
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-users-table-body');
  const term = (document.getElementById('admin-user-search').value || '').trim().toLowerCase();

  const rows = appState.adminUsers
    .filter((u) => !u.is_admin)
    .filter((u) => `${u.full_name} ${u.username} ${u.email}`.toLowerCase().includes(term));

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((u) => `
    <tr>
      <td>${escapeHtml(u.full_name || '-')}</td>
      <td>${escapeHtml(u.username || '-')}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${u.progress.streak}</td>
      <td>${u.progress.current_lifelines}</td>
      <td><button class="btn btn-light inspect-btn" data-id="${u.id}">Inspect</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.inspect-btn').forEach((btn) =>
    btn.addEventListener('click', async () =>
      withLoader('Loading user details...', () => loadAdminUserDetails(btn.dataset.id))
    )
  );
}

async function loadAdminUserDetails(userId) {
  appState.selectedAdminUserId = userId;

  const profile = appState.adminUsers.find((u) => u.id === userId);
  if (!profile) return;

  const historyRes = await supabaseClient
    .from('salah_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(100);

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

  tbody.innerHTML = history.length
    ? history.map((row) => `
      <tr>
        <td>${displayDate(row.entry_date)}</td>
        <td>${renderPrayerStatus(row.fajr_status || row.fajr, row.fajr_takbeer)}</td>
        <td>${renderPrayerStatus(row.zuhr_status || row.zuhr, row.zuhr_takbeer)}</td>
        <td>${renderPrayerStatus(row.asr_status || row.asr, row.asr_takbeer)}</td>
        <td>${renderPrayerStatus(row.maghrib_status || row.maghrib, row.maghrib_takbeer)}</td>
        <td>${renderPrayerStatus(row.isha_status || row.isha, row.isha_takbeer)}</td>
        <td>${row.streak_before_submission ?? '-'}</td>
        <td>${row.streak_after_submission ?? '-'}</td>
        <td>${escapeHtml(row.break_reason || '-')}</td>
        <td><button class="btn btn-danger btn-small delete-entry-btn" data-entry-id="${row.id}">Delete</button></td>
      </tr>
    `).join('')
    : '<tr><td colspan="10" class="no-data">No history for this user</td></tr>';

  document.getElementById('admin-user-detail-empty').classList.add('hidden');
  document.getElementById('admin-user-detail').classList.remove('hidden');
  document.querySelectorAll('.delete-entry-btn').forEach((btn) => {
    btn.addEventListener('click', async () =>
      withLoader('Deleting selected entry...', () => adminDeleteEntry(btn.dataset.entryId))
    );
  });
}

async function adminApproveUser(userId) {
  const res = await supabaseClient
    .from('profiles')
    .update({ approved: true })
    .eq('id', userId)
    .select('full_name')
    .single();

  if (res.error) throw res.error;

  leaderboardCache.ts = 0;
  await Promise.all([loadPendingApprovals(), loadAdminUsers(), updateLeaderboard()]);

  await showPopup({
    title: 'User approved ✅',
    message: `${res.data.full_name || 'User'} is now approved.`,
    emoji: '✅'
  });
}

async function adminSetStreak() {
  if (!appState.selectedAdminUserId) {
    await showPopup({
      title: 'Select a user',
      message: 'Choose a user first.',
      emoji: '👤'
    });
    return;
  }

  const value = Number(document.getElementById('admin-set-streak').value);
  if (!Number.isFinite(value) || value < 0) {
    await showPopup({
      title: 'Invalid streak',
      message: 'Enter a valid non-negative streak.',
      emoji: '⚠️'
    });
    return;
  }

  const res = await supabaseClient
    .from('challenge_progress')
    .update({
      streak: value,
      current_checkpoint: highestCheckpointAtOrBelow(value),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', appState.selectedAdminUserId);

  if (res.error) throw res.error;

  await loadAdminUsers();
  await updateLeaderboard();

  await showPopup({
    title: 'Streak updated',
    message: 'Custom streak value saved successfully.',
    emoji: '📈'
  });
}

async function adminAdjustLifelines() {
  if (!appState.selectedAdminUserId) {
    await showPopup({
      title: 'Select a user',
      message: 'Choose a user first.',
      emoji: '👤'
    });
    return;
  }

  const delta = Number(document.getElementById('admin-lifeline-change').value);
  if (!Number.isFinite(delta) || delta === 0) {
    await showPopup({
      title: 'Invalid value',
      message: 'Enter a positive or negative lifeline value.',
      emoji: '⚠️'
    });
    return;
  }

  const user = appState.adminUsers.find((u) => u.id === appState.selectedAdminUserId);
  const current = user.progress;

  const payload = {
    current_lifelines: Math.max(0, current.current_lifelines + delta),
    lifelines_earned: delta > 0 ? current.lifelines_earned + delta : current.lifelines_earned,
    lifelines_used: delta < 0 ? current.lifelines_used + Math.abs(delta) : current.lifelines_used,
    updated_at: new Date().toISOString()
  };

  const res = await supabaseClient
    .from('challenge_progress')
    .update(payload)
    .eq('user_id', appState.selectedAdminUserId);

  if (res.error) throw res.error;

  await supabaseClient.from('lifeline_events').insert({
    user_id: appState.selectedAdminUserId,
    event_type: delta > 0 ? 'manual_add' : 'manual_remove',
    count_change: delta,
    reason: 'Admin adjustment',
    created_at: new Date().toISOString(),
    created_by: appState.currentUser.id
  });

  await loadAdminUsers();
  await updateLeaderboard();

  await showPopup({
    title: 'Lifelines updated',
    message: 'Lifeline count has been adjusted.',
    emoji: delta > 0 ? '🎁' : '🛟'
  });
}

async function adminDeleteUser() {
  if (!appState.selectedAdminUserId) {
    await showPopup({
      title: 'Select a user',
      message: 'Choose a user first.',
      emoji: '👤'
    });
    return;
  }

  await adminDeleteUserData(appState.selectedAdminUserId, true);
}

async function adminDeleteUserData(userId, fromDetails = false) {
  const user = appState.adminUsers.find((u) => u.id === userId);

  const ok = await showPopup({
    title: 'Delete user data?',
    message: `This will remove website data for ${user?.full_name || user?.username || 'this user'}. Auth user in Supabase may still remain.`,
    emoji: '🗑️',
    confirm: true,
    danger: true,
    confirmText: 'Delete'
  });

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

  await showPopup({
    title: 'User data deleted',
    message: 'Website profile, progress, entries, and lifeline history were removed.',
    emoji: '🗑️'
  });
}

async function adminDeleteEntry(entryId) {
  if (!entryId) return;

  const ok = await showPopup({
    title: 'Delete Salah entry?',
    message: 'This removes the selected Salah entry. The user can submit that date again after deletion.',
    emoji: '🗑️',
    confirm: true,
    danger: true,
    confirmText: 'Delete'
  });
  if (!ok) return;

  const rowRes = await supabaseClient
    .from('salah_entries')
    .select('id, user_id, entry_date')
    .eq('id', entryId)
    .single();

  if (rowRes.error) {
    await showPopup({
      title: 'Delete failed',
      message: rowRes.error.message || 'Unable to load selected entry.',
      emoji: '❌',
      danger: true
    });
    return;
  }

  const userId = rowRes.data.user_id;

  const delRes = await supabaseClient
    .from('salah_entries')
    .delete()
    .eq('id', entryId);

  if (delRes.error) {
    await showPopup({
      title: 'Delete failed',
      message: delRes.error.message || 'Unable to delete selected entry.',
      emoji: '❌',
      danger: true
    });
    return;
  }

  await rebuildUserProgressFromHistory(userId);
  await loadAdminUsers();
  await loadAdminUserDetails(userId);
  await updateLeaderboard();

  await showPopup({
    title: 'Entry deleted',
    message: 'The Salah entry was deleted successfully. The user can now resubmit that date.',
    emoji: '🗑️'
  });
}

async function rebuildUserProgressFromHistory(userId) {
  const historyRes = await supabaseClient
    .from('salah_entries')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (historyRes.error) throw historyRes.error;

  const rows = historyRes.data || [];

  // Important fix:
  // Rebuild ONLY from remaining submission sequence.
  // Do not force gap-based streak reset after deleting an old entry,
  // otherwise deleting one past row can incorrectly collapse streak to 0.
  let progress = normalizeProgress({
    streak: 0,
    current_lifelines: 0,
    lifelines_earned: 0,
    lifelines_used: 0,
    current_checkpoint: 0,
    milestone_rewards: [],
    last_submission_date: null,
    missed_days_count: 0
  });

  for (const row of rows) {
    const payload = {
      fajr: { status: row.fajr_status || row.fajr, takbeer: !!row.fajr_takbeer },
      zuhr: { status: row.zuhr_status || row.zuhr, takbeer: !!row.zuhr_takbeer },
      asr: { status: row.asr_status || row.asr, takbeer: !!row.asr_takbeer },
      maghrib: { status: row.maghrib_status || row.maghrib, takbeer: !!row.maghrib_takbeer },
      isha: { status: row.isha_status || row.isha, takbeer: !!row.isha_takbeer }
    };

    const evaluation = evaluateSubmissionOutcome(payload, progress);

    progress = normalizeProgress({
      ...progress,
      streak: evaluation.streak,
      current_checkpoint: evaluation.checkpoint,
      current_lifelines: evaluation.currentLifelines,
      lifelines_earned: evaluation.lifelinesEarned,
      lifelines_used: evaluation.lifelinesUsed,
      milestone_rewards: evaluation.milestoneRewards,
      last_submission_date: row.entry_date,
      missed_days_count: 0
    });
  }

  const updatePayload = {
    streak: progress.streak,
    current_checkpoint: progress.current_checkpoint,
    current_lifelines: progress.current_lifelines,
    lifelines_earned: progress.lifelines_earned,
    lifelines_used: progress.lifelines_used,
    milestone_rewards: progress.milestone_rewards,
    last_submission_date: progress.last_submission_date,
    missed_days_count: 0,
    updated_at: new Date().toISOString()
  };

  const updateRes = await supabaseClient
    .from('challenge_progress')
    .update(updatePayload)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateRes.error) throw updateRes.error;

  return updateRes.data;
}

async function saveCheckpoints() {
  const raw = document.getElementById('checkpoint-input').value;
  const values = raw
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);

  if (!values.length) {
    await showPopup({
      title: 'Invalid checkpoints',
      message: 'Enter valid numbers separated by commas.',
      emoji: '⚠️'
    });
    return;
  }

  const res = await supabaseClient
    .from('app_config')
    .upsert(
      {
        id: 1,
        checkpoints: values,
        updated_at: new Date().toISOString(),
        updated_by: appState.currentUser.id
      },
      { onConflict: 'id' }
    );

  if (res.error) throw res.error;

  appState.checkpoints = values;
  renderProgressPath(appState.currentProgress?.streak || 0);

  await showPopup({
    title: 'Checkpoints saved',
    message: 'Checkpoint milestones updated successfully.',
    emoji: '🏁'
  });
}

function titleCase(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatTimestamp(value) {
  if (!value) return '-';
  const d = new Date(value);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
