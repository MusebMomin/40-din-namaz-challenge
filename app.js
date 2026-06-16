const config = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = config.url || '';
const SUPABASE_ANON_KEY = config.anonKey || '';

if (!window.supabase) {
    throw new Error('Supabase library not loaded. Include the CDN script before app.js');
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_CONFIG. Add url and anonKey in supabase-config.js');
}

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

const PRAYERS = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
const DAY_MS = 24 * 60 * 60 * 1000;

const appState = {
    currentUser: null,
    currentProfile: null,
    currentProgress: null,
    currentAdmin: null,
    checkpoints: [5, 10, 20, 30, 40],
    selectedAdminUserId: null,
    adminUsers: [],
    pendingRedirectPage: null
};

window.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    bindAuthListener();
    await restoreSession();
});

function setupEventListeners() {
    addClick('nav-home', () => displayPage('home-page'));
    addClick('nav-login', () => displayPage('login-page'));
    addClick('nav-register', () => displayPage('register-page'));
    addClick('nav-dashboard', async () => {
        await refreshCurrentUserState();
        displayPage('dashboard-page');
    });
    addClick('nav-admin-dashboard', async () => {
        await refreshCurrentUserState();
        displayPage('admin-dashboard-page');
    });
    addClick('nav-leaderboard', async () => {
        await updateLeaderboard();
        displayPage('leaderboard-page');
    });
    addClick('nav-logout', logout);
    addClick('hero-login-btn', () => displayPage('login-page'));
    addClick('hero-register-btn', () => displayPage('register-page'));
    addClick('refresh-history-btn', loadMyHistory);
    addClick('refresh-users-btn', loadAdminUsers);
    addClick('save-checkpoints-btn', saveCheckpoints);
    addClick('set-streak-btn', adminSetStreak);
    addClick('apply-lifeline-btn', adminAdjustLifelines);

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const salahForm = document.getElementById('salah-form');
    if (salahForm) salahForm.addEventListener('submit', handleSalahSubmit);

    document.querySelectorAll('.status-checkbox').forEach(cb => {
        cb.addEventListener('change', handleStatusCheckboxChange);
    });

    document.querySelectorAll('.takbeer-checkbox').forEach(cb => {
        cb.addEventListener('change', handleTakbeerCheckboxChange);
    });

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => showAdminTab(btn.dataset.tab));
    });

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

        if (appState.pendingRedirectPage) {
            const target = appState.pendingRedirectPage;
            appState.pendingRedirectPage = null;
            displayPage(target);
        }
    });
}

async function restoreSession() {
    await loadAppConfig();
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
        displayPage('home-page');
        await updateLeaderboard();
        return;
    }

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

async function loadAppConfig() {
    const { data, error } = await supabaseClient
        .from('app_config')
        .select('checkpoints')
        .eq('id', 1)
        .maybeSingle();

    if (!error && data?.checkpoints?.length) {
        appState.checkpoints = data.checkpoints.map(Number).sort((a, b) => a - b);
    }

    const checkpointInput = document.getElementById('checkpoint-input');
    if (checkpointInput) {
        checkpointInput.value = appState.checkpoints.join(',');
    }
}

async function loadUserContext(user) {
    appState.currentUser = user;

    const profileResult = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    const progressResult = await supabaseClient
        .from('challenge_progress')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (profileResult.error || progressResult.error) {
        console.error(profileResult.error || progressResult.error);
        alert('Unable to load profile data. Please refresh and try again.');
        return;
    }

    appState.currentProfile = profileResult.data;
    appState.currentProgress = normalizeProgress(progressResult.data);
    appState.currentAdmin = appState.currentProfile.is_admin ? appState.currentProfile : null;

    await loadAppConfig();
    await updateLeaderboard();
}

function normalizeProgress(progress) {
    return {
        ...progress,
        milestone_rewards: Array.isArray(progress.milestone_rewards) ? progress.milestone_rewards.map(Number) : [],
        current_checkpoint: progress.current_checkpoint || 0,
        current_lifelines: progress.current_lifelines || 0,
        lifelines_earned: progress.lifelines_earned || 0,
        lifelines_used: progress.lifelines_used || 0,
        streak: progress.streak || 0,
        missed_days_count: progress.missed_days_count || 0
    };
}

function clearCurrentState() {
    appState.currentUser = null;
    appState.currentProfile = null;
    appState.currentProgress = null;
    appState.currentAdmin = null;
    appState.selectedAdminUserId = null;
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
    if (visible) el.style.display = display;
    else el.style.display = 'none';
}

function displayPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');

    if (pageId === 'dashboard-page') {
        updateDashboard();
    } else if (pageId === 'admin-dashboard-page') {
        loadAdminDashboard();
    } else if (pageId === 'leaderboard-page') {
        updateLeaderboard();
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById('register-username').value.trim().toLowerCase();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const password = document.getElementById('register-password').value;

    if (!username || !email || !password) {
        alert('Please fill all registration fields.');
        return;
    }

    const usernameCheck = await supabaseClient.rpc('is_username_available', { username_input: username });
    if (usernameCheck.error) {
        console.error(usernameCheck.error);
        alert('Unable to verify username availability.');
        return;
    }
    if (!usernameCheck.data) {
        alert('Username is already taken. Please choose another one.');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                username,
                full_name: username
            }
        }
    });

    if (error) {
        alert(error.message || 'Registration failed.');
        return;
    }

    if (data.user) {
        const profileUpdate = await supabaseClient
            .from('profiles')
            .update({ username, full_name: username, email })
            .eq('id', data.user.id);

        if (profileUpdate.error) console.error(profileUpdate.error);
    }

    alert('Registration successful. Your account is pending admin approval. Please log in after confirmation if your project requires email confirmation.');
    document.getElementById('register-form').reset();
    displayPage('login-page');
}

async function handleLogin(e) {
    e.preventDefault();

    const identifier = document.getElementById('login-identifier').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
        alert('Please enter username/email and password.');
        return;
    }

    const { data: emailRow, error: emailLookupError } = await supabaseClient.rpc('resolve_login_email', {
        login_input: identifier
    });

    if (emailLookupError) {
        console.error(emailLookupError);
        alert('Unable to resolve login identifier.');
        return;
    }

    const loginEmail = emailRow || identifier;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail,
        password
    });

    if (error) {
        alert(error.message || 'Login failed.');
        return;
    }

    await loadUserContext(data.user);
    document.getElementById('login-form').reset();

    if (appState.currentAdmin) {
        displayPage('admin-dashboard-page');
    } else {
        displayPage('dashboard-page');
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    clearCurrentState();
    updateNavigation();
    displayPage('home-page');
}

async function refreshCurrentUserState() {
    if (!appState.currentUser) return;
    await loadUserContext(appState.currentUser);
}

async function updateDashboard() {
    if (!appState.currentUser) {
        displayPage('login-page');
        return;
    }

    await refreshCurrentUserState();
    await evaluateMissedDayBreakForCurrentUser();

    const user = appState.currentProfile;
    const progress = appState.currentProgress;
    const statusBox = document.getElementById('user-status-box');
    const statusMessage = document.getElementById('status-message');
    const statusDetail = document.getElementById('status-detail');
    const submissionCard = document.getElementById('submission-card');

    if (user.approved) {
        statusBox.classList.add('approved');
        statusMessage.textContent = `Welcome, ${user.username || user.full_name || user.email}!`;
        statusDetail.textContent = 'Your account is approved. You may submit only today or yesterday if it was missed.';
        submissionCard.classList.remove('hidden');
    } else {
        statusBox.classList.remove('approved');
        statusMessage.textContent = 'Account Pending Approval';
        statusDetail.textContent = 'Your account is awaiting admin approval. Submission will unlock after approval.';
        submissionCard.classList.add('hidden');
    }

    document.getElementById('current-streak').textContent = progress.streak;
    document.getElementById('current-checkpoint').textContent = progress.current_checkpoint;
    document.getElementById('lifeline-count').textContent = progress.current_lifelines;
    document.getElementById('lifelines-earned').textContent = progress.lifelines_earned;
    document.getElementById('lifelines-used').textContent = progress.lifelines_used;

    prepareEntryDateInput();
    await loadMyHistory();
}

function prepareEntryDateInput() {
    const entryInput = document.getElementById('entry-date');
    if (!entryInput) return;
    const today = new Date();
    const yesterday = new Date(today.getTime() - DAY_MS);

    entryInput.max = formatDate(today);
    if (!entryInput.value) entryInput.value = formatDate(today);

    const help = document.getElementById('submission-help');
    if (help) {
        help.textContent = `Allowed entry dates: ${formatDateDisplay(today)} or ${formatDateDisplay(yesterday)} only.`;
    }
}

function formatDate(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function formatDateDisplay(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function handleStatusCheckboxChange(e) {
    const prayer = e.target.dataset.prayer;
    const status = e.target.dataset.status;
    const all = document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`);

    if (e.target.checked) {
        all.forEach(cb => {
            if (cb !== e.target) cb.checked = false;
        });
    }

    const takbeer = document.querySelector(`.takbeer-checkbox[data-prayer="${prayer}"]`);
    if (!takbeer) return;

    const jamatChecked = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="jamat"]`).checked;
    if (!jamatChecked) {
        takbeer.checked = false;
    }

    if (status !== 'jamat' && e.target.checked) {
        takbeer.checked = false;
    }
}

function handleTakbeerCheckboxChange(e) {
    const prayer = e.target.dataset.prayer;
    const jamat = document.querySelector(`.status-checkbox[data-prayer="${prayer}"][data-status="jamat"]`);
    if (!jamat.checked && e.target.checked) {
        e.target.checked = false;
        alert('Takbeer-e-Ula can only be selected when Jamat is selected.');
    }
}

async function handleSalahSubmit(e) {
    e.preventDefault();

    if (!appState.currentProfile?.approved) {
        alert('Your account must be approved before you can submit Salah data.');
        return;
    }

    await evaluateMissedDayBreakForCurrentUser();

    const chosenDate = document.getElementById('entry-date').value;
    const submissionCheck = validateEntryDateWindow(chosenDate);
    if (!submissionCheck.ok) {
        showSubmissionWarning(submissionCheck.message);
        return;
    }
    showSubmissionWarning('');

    const existing = await supabaseClient
        .from('salah_entries')
        .select('id')
        .eq('user_id', appState.currentUser.id)
        .eq('entry_date', chosenDate)
        .maybeSingle();

    if (existing.error) {
        console.error(existing.error);
        alert(existing.error.message || 'Unable to verify duplicate submission.');
        return;
    }

    if (existing.data) {
        alert('Duplicate submissions for the same date are not allowed.');
        return;
    }

    const statusPayload = collectPrayerStatus();
    if (!statusPayload.ok) {
        alert(statusPayload.message);
        return;
    }

    const entryPayload = statusPayload.payload;
    const progressBefore = appState.currentProgress.streak;

    const evaluation = evaluateSubmissionOutcome(entryPayload, appState.currentProgress);
    const progressUpdate = buildProgressUpdateFromEvaluation(evaluation, appState.currentProgress);

    const insertResult = await supabaseClient
        .from('salah_entries')
        .insert({
            user_id: appState.currentUser.id,
            entry_date: chosenDate,
            submission_date: formatDate(new Date()),
            fajr_status: entryPayload.fajr.status,
            fajr_takbeer: entryPayload.fajr.takbeer,
            zuhr_status: entryPayload.zuhr.status,
            zuhr_takbeer: entryPayload.zuhr.takbeer,
            asr_status: entryPayload.asr.status,
            asr_takbeer: entryPayload.asr.takbeer,
            maghrib_status: entryPayload.maghrib.status,
            maghrib_takbeer: entryPayload.maghrib.takbeer,
            isha_status: entryPayload.isha.status,
            isha_takbeer: entryPayload.isha.takbeer,
            streak_before_submission: progressBefore,
            streak_after_submission: progressUpdate.streak,
            lifeline_used: evaluation.lifelineUsed,
            streak_broken: evaluation.streakBroken,
            break_reason: evaluation.breakReason,
            submitted_at: new Date().toISOString()
        })
        .select()
        .single();

    if (insertResult.error) {
        console.error(insertResult.error);
        alert(insertResult.error.message || 'Unable to save Salah entry.');
        return;
    }

    const progressPersist = await supabaseClient
        .from('challenge_progress')
        .update(progressUpdate)
        .eq('user_id', appState.currentUser.id)
        .select()
        .single();

    if (progressPersist.error) {
        console.error(progressPersist.error);
        alert(progressPersist.error.message || 'Entry saved, but streak/progress update failed.');
        return;
    }

    appState.currentProgress = normalizeProgress(progressPersist.data);

    await insertLifelineEvents(appState.currentUser.id, evaluation.lifelineEvents);
    await loadUserContext(appState.currentUser);
    resetPrayerTable();
    prepareEntryDateInput();
    await loadMyHistory();
    await updateLeaderboard();

    const alertParts = ['Salah entry submitted successfully.'];
    if (evaluation.lifelineUsed) alertParts.push('1 lifeline was used automatically to protect your streak.');
    if (evaluation.dailyRewardGranted) alertParts.push('You earned +1 lifeline for a perfect Takbeer-e-Ula day.');
    if (evaluation.milestoneRewardsGranted.length) alertParts.push(`Milestone reward(s): +${evaluation.milestoneRewardsGranted.length} lifeline(s) for ${evaluation.milestoneRewardsGranted.join(', ')} day streak.`);
    if (evaluation.streakBroken && !evaluation.lifelineUsed) alertParts.push(`Streak reset to checkpoint ${evaluation.checkpoint} because: ${evaluation.breakReason}.`);
    alert(alertParts.join(' '));
}

function validateEntryDateWindow(value) {
    if (!value) return { ok: false, message: 'Please choose an entry date.' };

    const today = startOfDay(new Date());
    const yesterday = new Date(today.getTime() - DAY_MS);
    const entry = startOfDay(new Date(value + 'T00:00:00'));

    if (entry.getTime() === today.getTime() || entry.getTime() === yesterday.getTime()) {
        return { ok: true };
    }

    return { ok: false, message: 'Only today or yesterday can be submitted.' };
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function showSubmissionWarning(message) {
    const box = document.getElementById('submission-warning');
    if (!box) return;
    if (!message) {
        box.textContent = '';
        box.classList.add('hidden');
    } else {
        box.textContent = message;
        box.classList.remove('hidden');
    }
}

function collectPrayerStatus() {
    const payload = {};

    for (const prayer of PRAYERS) {
        const checked = Array.from(document.querySelectorAll(`.status-checkbox[data-prayer="${prayer}"]`)).filter(cb => cb.checked);
        if (checked.length !== 1) {
            return { ok: false, message: `Please select exactly one status for ${toTitle(prayer)}.` };
        }

        const status = checked[0].dataset.status;
        const takbeer = document.querySelector(`.takbeer-checkbox[data-prayer="${prayer}"]`).checked;

        if (takbeer && status !== 'jamat') {
            return { ok: false, message: `Takbeer-e-Ula on ${toTitle(prayer)} requires Jamat.` };
        }

        payload[prayer] = { status, takbeer };
    }

    return { ok: true, payload };
}

function toTitle(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function evaluateSubmissionOutcome(entryPayload, progress) {
    const statuses = PRAYERS.map(prayer => entryPayload[prayer].status);
    const takbeers = PRAYERS.map(prayer => entryPayload[prayer].takbeer);
    const noJamatCount = statuses.filter(v => v === 'no-jamat').length;
    const hasQaza = statuses.includes('qaza');
    const perfectTakbeerDay = statuses.every(v => v === 'jamat') && takbeers.every(Boolean);

    const result = {
        streakBroken: false,
        breakReason: null,
        lifelineUsed: false,
        newCheckpoint: progress.current_checkpoint,
        dailyRewardGranted: false,
        milestoneRewardsGranted: [],
        lifelineEvents: []
    };

    let nextStreak = progress.streak + 1;
    let nextCheckpoint = highestCheckpointAtOrBelow(nextStreak);
    let currentLifelines = progress.current_lifelines;
    let lifelinesEarned = progress.lifelines_earned;
    let lifelinesUsed = progress.lifelines_used;
    let milestoneRewards = [...progress.milestone_rewards];

    if (hasQaza) {
        result.streakBroken = true;
        result.breakReason = 'Qaza prayer marked';
    } else if (noJamatCount >= 2) {
        result.streakBroken = true;
        result.breakReason = '2 or more No Jamat entries';
    }

    if (result.streakBroken) {
        if (currentLifelines > 0) {
            currentLifelines -= 1;
            lifelinesUsed += 1;
            result.lifelineUsed = true;
            result.streakBroken = false;
            result.breakReason = 'Lifeline Used';
            result.lifelineEvents.push({ event_type: 'use', count_change: -1, reason: 'Automatic streak protection' });
        } else {
            nextStreak = progress.current_checkpoint;
            nextCheckpoint = progress.current_checkpoint;
        }
    }

    if (!result.streakBroken && perfectTakbeerDay) {
        currentLifelines += 1;
        lifelinesEarned += 1;
        result.dailyRewardGranted = true;
        result.lifelineEvents.push({ event_type: 'earn', count_change: 1, reason: 'Perfect Takbeer-e-Ula day' });
    }

    for (const milestone of [10, 20, 30]) {
        if (nextStreak >= milestone && !milestoneRewards.includes(milestone)) {
            milestoneRewards.push(milestone);
            currentLifelines += 1;
            lifelinesEarned += 1;
            result.milestoneRewardsGranted.push(milestone);
            result.lifelineEvents.push({ event_type: 'earn', count_change: 1, reason: `${milestone} day streak milestone` });
        }
    }

    return {
        ...result,
        streak: nextStreak,
        checkpoint: nextCheckpoint,
        currentLifelines,
        lifelinesEarned,
        lifelinesUsed,
        milestoneRewards
    };
}

function buildProgressUpdateFromEvaluation(evaluation, progress) {
    return {
        streak: evaluation.streak,
        current_checkpoint: evaluation.checkpoint,
        current_lifelines: evaluation.currentLifelines,
        lifelines_earned: evaluation.lifelinesEarned,
        lifelines_used: evaluation.lifelinesUsed,
        milestone_rewards: evaluation.milestoneRewards,
        last_submission_date: document.getElementById('entry-date').value,
        missed_days_count: 0,
        updated_at: new Date().toISOString()
    };
}

function highestCheckpointAtOrBelow(streak) {
    const checkpoints = appState.checkpoints.filter(Number.isFinite).sort((a, b) => a - b);
    let result = 0;
    for (const cp of checkpoints) {
        if (cp <= streak) result = cp;
    }
    return result;
}

async function insertLifelineEvents(userId, events) {
    if (!events.length) return;
    const rows = events.map(e => ({
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
    document.querySelectorAll('.status-checkbox, .takbeer-checkbox').forEach(cb => {
        cb.checked = false;
    });
}

async function evaluateMissedDayBreakForCurrentUser() {
    if (!appState.currentUser || !appState.currentProgress) return;

    const today = startOfDay(new Date());
    const lastSubmitted = appState.currentProgress.last_submission_date
        ? startOfDay(new Date(appState.currentProgress.last_submission_date + 'T00:00:00'))
        : null;

    let missedDays = 0;
    if (!lastSubmitted) {
        missedDays = 0;
    } else {
        missedDays = Math.max(0, Math.floor((today - lastSubmitted) / DAY_MS));
    }

    if (missedDays < 2) return;

    if (appState.currentProgress.current_lifelines > 0) {
        const updateResult = await supabaseClient
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

        if (!updateResult.error) {
            appState.currentProgress = normalizeProgress(updateResult.data);
            await insertLifelineEvents(appState.currentUser.id, [{
                event_type: 'use',
                count_change: -1,
                reason: 'Automatic protection after 2 missed days'
            }]);
        }
    } else {
        const resetResult = await supabaseClient
            .from('challenge_progress')
            .update({
                streak: appState.currentProgress.current_checkpoint,
                missed_days_count: missedDays,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', appState.currentUser.id)
            .select()
            .single();
        if (!resetResult.error) {
            appState.currentProgress = normalizeProgress(resetResult.data);
        }
    }
}

async function loadMyHistory() {
    if (!appState.currentUser) return;
    const tbody = document.getElementById('history-table-body');
    const { data, error } = await supabaseClient
        .from('salah_entries')
        .select('*')
        .eq('user_id', appState.currentUser.id)
        .order('entry_date', { ascending: false })
        .limit(30);

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">Unable to load history</td></tr>';
        return;
    }

    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No entries yet</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr>
            <td>${escapeHtml(row.entry_date)}</td>
            <td>${renderPrayerStatus(row.fajr_status, row.fajr_takbeer)}</td>
            <td>${renderPrayerStatus(row.zuhr_status, row.zuhr_takbeer)}</td>
            <td>${renderPrayerStatus(row.asr_status, row.asr_takbeer)}</td>
            <td>${renderPrayerStatus(row.maghrib_status, row.maghrib_takbeer)}</td>
            <td>${renderPrayerStatus(row.isha_status, row.isha_takbeer)}</td>
            <td>${row.lifeline_used ? '<span class="badge badge-approved">Yes</span>' : 'No'}</td>
            <td>${escapeHtml(row.break_reason || '-')}</td>
            <td>${formatTimestamp(row.submitted_at)}</td>
        </tr>
    `).join('');
}

function renderPrayerStatus(status, takbeer) {
    if (!status) return '-';
    const label = status === 'no-jamat' ? 'No Jamat' : toTitle(status);
    return takbeer ? `${label} + Takbeer` : label;
}

function formatTimestamp(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

async function updateLeaderboard() {
    const { data, error } = await supabaseClient
        .from('leaderboard_view')
        .select('*')
        .order('current_streak', { ascending: false })
        .order('username', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    renderLeaderboardTable(document.getElementById('preview-leaderboard'), data, true);
    renderLeaderboardTable(document.getElementById('leaderboard-body'), data, false);
}

function renderLeaderboardTable(target, rows, preview) {
    if (!target) return;
    const slice = preview ? rows.slice(0, 5) : rows;
    const colspan = preview ? 5 : 6;
    if (!slice.length) {
        target.innerHTML = `<tr><td colspan="${colspan}" class="no-data">No approved participants yet</td></tr>`;
        return;
    }

    target.innerHTML = slice.map((row, index) => `
        <tr>
            <td>#${index + 1}</td>
            <td>${escapeHtml(row.username)}</td>
            <td>${row.current_streak}</td>
            ${preview ? `<td>${row.current_lifelines}</td>` : `<td>${row.current_checkpoint}</td><td>${row.current_lifelines}</td>`}
            <td>${row.current_streak >= 40 ? '<span class="badge badge-approved">Completed</span>' : '<span class="badge badge-ok">Active</span>'}</td>
        </tr>
    `).join('');
}

async function loadAdminDashboard() {
    if (!appState.currentAdmin) {
        appState.pendingRedirectPage = 'admin-dashboard-page';
        displayPage('login-page');
        return;
    }

    await loadAdminUsers();
    await loadPendingApprovals();
    await loadLifelineHistory();
    renderAdminTopStats();
    showAdminTab('pending');
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    ['pending', 'users', 'lifelines'].forEach(name => {
        document.getElementById(`tab-${name}`).classList.toggle('hidden', name !== tab);
    });
}

async function loadPendingApprovals() {
    const container = document.getElementById('pending-users-list');
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, username, email, created_at')
        .eq('approved', false)
        .eq('is_admin', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        container.innerHTML = '<div class="no-data">Unable to load pending approvals</div>';
        return;
    }

    if (!data.length) {
        container.innerHTML = '<div class="no-data">No pending approvals</div>';
        return;
    }

    container.innerHTML = data.map(user => `
        <div class="pending-card">
            <h4>${escapeHtml(user.username)}</h4>
            <p class="inline-muted">${escapeHtml(user.email)} • Registered ${formatTimestamp(user.created_at)}</p>
            <div class="pending-actions">
                <button class="btn btn-primary" data-action="approve" data-user-id="${user.id}">Approve</button>
                <button class="btn btn-danger" data-action="reject" data-user-id="${user.id}">Reject</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('[data-action="approve"]').forEach(btn => btn.addEventListener('click', () => adminApproveUser(btn.dataset.userId)));
    container.querySelectorAll('[data-action="reject"]').forEach(btn => btn.addEventListener('click', () => adminRejectUser(btn.dataset.userId)));
}

async function loadAdminUsers() {
    const { data, error } = await supabaseClient
        .from('admin_user_overview')
        .select('*')
        .order('approved', { ascending: true })
        .order('username', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    appState.adminUsers = data;
    renderAdminUsersTable();
    renderAdminTopStats();

    if (appState.selectedAdminUserId) {
        await loadAdminUserDetails(appState.selectedAdminUserId);
    }
}

function renderAdminUsersTable() {
    const tbody = document.getElementById('admin-users-table-body');
    const term = (document.getElementById('admin-user-search').value || '').trim().toLowerCase();
    const users = term
        ? appState.adminUsers.filter(user => `${user.username} ${user.email}`.toLowerCase().includes(term))
        : appState.adminUsers;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${user.is_admin ? '<span class="badge badge-admin">Admin</span>' : user.approved ? '<span class="badge badge-approved">Approved</span>' : '<span class="badge badge-pending">Pending</span>'}</td>
            <td>${user.current_streak}</td>
            <td>${user.current_lifelines}</td>
            <td><button class="btn btn-light inspect-user-btn" data-user-id="${user.id}">Inspect</button></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.inspect-user-btn').forEach(btn => {
        btn.addEventListener('click', () => loadAdminUserDetails(btn.dataset.userId));
    });
}

function renderAdminTopStats() {
    const target = document.getElementById('admin-top-stats');
    const users = appState.adminUsers.filter(user => !user.is_admin);
    const approved = users.filter(u => u.approved).length;
    const pending = users.filter(u => !u.approved).length;
    const completed = users.filter(u => u.current_streak >= 40).length;
    target.innerHTML = `
        <div class="stat-card"><span class="stat-label">Total Users</span><span class="stat-value">${users.length}</span></div>
        <div class="stat-card"><span class="stat-label">Approved</span><span class="stat-value">${approved}</span></div>
        <div class="stat-card"><span class="stat-label">Pending</span><span class="stat-value">${pending}</span></div>
        <div class="stat-card"><span class="stat-label">Completed</span><span class="stat-value">${completed}</span></div>
    `;
}

async function loadAdminUserDetails(userId) {
    appState.selectedAdminUserId = userId;
    const detailCard = document.getElementById('admin-user-detail');
    const empty = document.getElementById('admin-user-detail-empty');

    const [profileResult, progressResult, historyResult] = await Promise.all([
        supabaseClient.from('profiles').select('*').eq('id', userId).single(),
        supabaseClient.from('challenge_progress').select('*').eq('user_id', userId).single(),
        supabaseClient.from('salah_entries').select('*').eq('user_id', userId).order('entry_date', { ascending: false }).limit(90)
    ]);

    if (profileResult.error || progressResult.error || historyResult.error) {
        console.error(profileResult.error || progressResult.error || historyResult.error);
        alert('Unable to load user details.');
        return;
    }

    const profile = profileResult.data;
    const progress = normalizeProgress(progressResult.data);
    const history = historyResult.data || [];

    document.getElementById('detail-username').textContent = profile.username;
    document.getElementById('detail-email').textContent = profile.email;
    document.getElementById('detail-streak').textContent = progress.streak;
    document.getElementById('detail-lifelines').textContent = progress.current_lifelines;
    document.getElementById('detail-earned').textContent = progress.lifelines_earned;
    document.getElementById('detail-used').textContent = progress.lifelines_used;
    document.getElementById('admin-set-streak').value = progress.streak;
    document.getElementById('admin-lifeline-change').value = '';

    const tbody = document.getElementById('admin-detail-history-body');
    if (!history.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No Salah history for this user</td></tr>';
    } else {
        tbody.innerHTML = history.map(row => `
            <tr>
                <td>${escapeHtml(row.entry_date)}</td>
                <td>${renderPrayerStatus(row.fajr_status, row.fajr_takbeer)}</td>
                <td>${renderPrayerStatus(row.zuhr_status, row.zuhr_takbeer)}</td>
                <td>${renderPrayerStatus(row.asr_status, row.asr_takbeer)}</td>
                <td>${renderPrayerStatus(row.maghrib_status, row.maghrib_takbeer)}</td>
                <td>${renderPrayerStatus(row.isha_status, row.isha_takbeer)}</td>
                <td>${row.streak_before_submission}</td>
                <td>${row.streak_after_submission}</td>
                <td>${escapeHtml(row.break_reason || '-')}</td>
            </tr>
        `).join('');
    }

    empty.classList.add('hidden');
    detailCard.classList.remove('hidden');
}

async function adminApproveUser(userId) {
    const result = await supabaseClient
        .from('profiles')
        .update({ approved: true })
        .eq('id', userId)
        .select('username')
        .single();

    if (result.error) {
        alert(result.error.message || 'Unable to approve user.');
        return;
    }

    await loadPendingApprovals();
    await loadAdminUsers();
    await updateLeaderboard();
    alert(`Approved ${result.data.username}.`);
}

async function adminRejectUser(userId) {
    const profileResult = await supabaseClient.from('profiles').select('username').eq('id', userId).single();
    if (profileResult.error) {
        alert(profileResult.error.message || 'Unable to load user.');
        return;
    }

    if (!confirm(`Reject and remove ${profileResult.data.username}?`)) return;

    const entriesDelete = await supabaseClient.from('salah_entries').delete().eq('user_id', userId);
    if (entriesDelete.error) {
        alert(entriesDelete.error.message || 'Unable to delete user entries.');
        return;
    }
    const eventsDelete = await supabaseClient.from('lifeline_events').delete().eq('user_id', userId);
    if (eventsDelete.error) console.error(eventsDelete.error);
    const progressDelete = await supabaseClient.from('challenge_progress').delete().eq('user_id', userId);
    if (progressDelete.error) {
        alert(progressDelete.error.message || 'Unable to delete progress.');
        return;
    }
    const profileDelete = await supabaseClient.from('profiles').delete().eq('id', userId);
    if (profileDelete.error) {
        alert(profileDelete.error.message || 'Unable to delete profile.');
        return;
    }

    await loadPendingApprovals();
    await loadAdminUsers();
    await updateLeaderboard();
    alert(`${profileResult.data.username} was removed.`);
}

async function adminSetStreak() {
    if (!appState.selectedAdminUserId) {
        alert('Select a user first.');
        return;
    }

    const nextValue = Number(document.getElementById('admin-set-streak').value);
    if (!Number.isFinite(nextValue) || nextValue < 0) {
        alert('Enter a valid non-negative streak value.');
        return;
    }

    const update = await supabaseClient
        .from('challenge_progress')
        .update({
            streak: nextValue,
            current_checkpoint: highestCheckpointAtOrBelow(nextValue),
            updated_at: new Date().toISOString()
        })
        .eq('user_id', appState.selectedAdminUserId)
        .select()
        .single();

    if (update.error) {
        alert(update.error.message || 'Unable to update streak.');
        return;
    }

    await loadAdminUsers();
    await loadAdminUserDetails(appState.selectedAdminUserId);
    alert('Streak updated successfully.');
}

async function adminAdjustLifelines() {
    if (!appState.selectedAdminUserId) {
        alert('Select a user first.');
        return;
    }

    const delta = Number(document.getElementById('admin-lifeline-change').value);
    if (!Number.isFinite(delta) || delta === 0) {
        alert('Enter a positive or negative lifeline value.');
        return;
    }

    const progressResult = await supabaseClient
        .from('challenge_progress')
        .select('*')
        .eq('user_id', appState.selectedAdminUserId)
        .single();

    if (progressResult.error) {
        alert(progressResult.error.message || 'Unable to load current progress.');
        return;
    }

    const progress = normalizeProgress(progressResult.data);
    const newCurrent = Math.max(0, progress.current_lifelines + delta);
    const earned = delta > 0 ? progress.lifelines_earned + delta : progress.lifelines_earned;
    const used = delta < 0 ? progress.lifelines_used + Math.abs(delta) : progress.lifelines_used;

    const update = await supabaseClient
        .from('challenge_progress')
        .update({
            current_lifelines: newCurrent,
            lifelines_earned: earned,
            lifelines_used: used,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', appState.selectedAdminUserId)
        .select()
        .single();

    if (update.error) {
        alert(update.error.message || 'Unable to apply lifeline change.');
        return;
    }

    await insertAdminLifelineEvent(appState.selectedAdminUserId, delta);
    await loadAdminUsers();
    await loadAdminUserDetails(appState.selectedAdminUserId);
    await loadLifelineHistory();
    alert('Lifeline adjustment saved.');
}

async function insertAdminLifelineEvent(userId, delta) {
    const { error } = await supabaseClient.from('lifeline_events').insert({
        user_id: userId,
        event_type: delta > 0 ? 'manual_add' : 'manual_remove',
        count_change: delta,
        reason: 'Manual admin adjustment',
        created_at: new Date().toISOString(),
        created_by: appState.currentUser.id
    });
    if (error) console.error(error);
}

async function loadLifelineHistory() {
    const tbody = document.getElementById('lifeline-history-body');
    const { data, error } = await supabaseClient
        .from('lifeline_events_view')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">Unable to load lifeline history</td></tr>';
        return;
    }

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No lifeline history yet</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr>
            <td>${formatTimestamp(row.created_at)}</td>
            <td>${escapeHtml(row.username || '-')}</td>
            <td>${escapeHtml(row.event_type)}</td>
            <td>${row.count_change > 0 ? '+' : ''}${row.count_change}</td>
            <td>${escapeHtml(row.reason || '-')}</td>
        </tr>
    `).join('');
}

async function saveCheckpoints() {
    if (!appState.currentAdmin) {
        alert('Admin only action.');
        return;
    }

    const value = document.getElementById('checkpoint-input').value.trim();
    const list = value.split(',').map(v => Number(v.trim())).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!list.length) {
        alert('Enter valid comma-separated checkpoint numbers.');
        return;
    }

    const update = await supabaseClient
        .from('app_config')
        .upsert({ id: 1, checkpoints: list, updated_at: new Date().toISOString(), updated_by: appState.currentUser.id }, { onConflict: 'id' })
        .select()
        .single();

    if (update.error) {
        alert(update.error.message || 'Unable to save checkpoints.');
        return;
    }

    appState.checkpoints = list;
    alert('Checkpoints updated successfully.');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
