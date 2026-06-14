// Supabase-backed 40-Day Namaz Challenge

const SUPABASE_URL = 'https://aoqnqcqhkeqzfbackzpk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvcW5xY3Foa2VxemZiYWNrenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjE4MzgsImV4cCI6MjA5Njk5NzgzOH0.aRxSz4NoRUgoY5bi25k2pyc34PPLkaDCJGip7R4K7go';

const { createClient } = window.supabase;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

const PRAYERS = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];
const STATUS_LABELS = {
    jamat: 'Jamat',
    'no-jamat': 'No Jamat',
    qaza: 'Qaza'
};

const appState = {
    currentUser: null,
    currentProfile: null,
    currentProgress: null,
    currentAdmin: null,
    pendingRedirectPage: null
};

window.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    updateNavigation();
    bindAuthListener();
    await restoreSession();
});

function setupEventListeners() {
    addClick('nav-home', () => displayPage('home-page'));
    addClick('nav-login', () => displayPage('login-page'));
    addClick('nav-admin-login', () => displayPage('admin-login-page'));
    addClick('nav-dashboard', () => displayPage('dashboard-page'));
    addClick('nav-admin-dashboard', () => displayPage('admin-dashboard-page'));
    addClick('nav-leaderboard', async () => {
        await updateLeaderboard();
        displayPage('leaderboard-page');
    });
    addClick('nav-logout', logout);
    addClick('nav-admin-logout', logout);
    addClick('start-btn', () => displayPage('login-page'));

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const adminLoginForm = document.getElementById('admin-login-form');
    if (adminLoginForm) adminLoginForm.addEventListener('submit', handleAdminLogin);

    const salahForm = document.getElementById('salah-form');
    if (salahForm) salahForm.addEventListener('submit', handleSalahSubmit);

    document.querySelectorAll('.salah-options select').forEach(select => {
        select.addEventListener('change', handleSalahChange);
    });

    addClick('use-lifeliner-btn', useLifeliner);

    document.querySelectorAll('.admin-tab-btn').forEach(tab => {
        tab.addEventListener('click', handleAdminTabSwitch);
    });

    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('approve-btn')) {
            await adminApproveUser(e.target.dataset.userId);
        }
        if (e.target.classList.contains('reject-btn')) {
            await adminRejectUser(e.target.dataset.userId);
        }
        if (e.target.classList.contains('reset-btn')) {
            await adminResetStreak(e.target.dataset.userId);
        }
        if (e.target.classList.contains('delete-user-btn')) {
            await adminDeleteUser(e.target.dataset.userId);
        }
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

function bindAuthListener() {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            clearCurrentState();
            updateNavigation();
            displayPage('home-page');
            return;
        }

        if (session?.user) {
            await loadUserContext(session.user);
            updateNavigation();

            if (appState.pendingRedirectPage) {
                const target = appState.pendingRedirectPage;
                appState.pendingRedirectPage = null;
                displayPage(target);
            }
        }
    });
}

async function restoreSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
        displayPage('home-page');
        return;
    }

    if (data.session?.user) {
        await loadUserContext(data.session.user);
        updateNavigation();

        if (appState.currentAdmin) {
            displayPage('admin-dashboard-page');
        } else {
            displayPage('dashboard-page');
        }
    } else {
        displayPage('home-page');
        await updateLeaderboard();
    }
}

async function loadUserContext(user) {
    appState.currentUser = user;

    await ensureUserRows(user);

    const profileResult = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileResult.error) {
        console.error(profileResult.error);
        alert('Unable to load your profile. Please try again.');
        return;
    }

    const progressResult = await supabaseClient
        .from('challenge_progress')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (progressResult.error) {
        console.error(progressResult.error);
        alert('Unable to load your challenge progress. Please try again.');
        return;
    }

    appState.currentProfile = profileResult.data;
    appState.currentProgress = progressResult.data;
    appState.currentAdmin = profileResult.data.is_admin ? profileResult.data : null;

    await updateLeaderboard();
}

async function ensureUserRows(user) {
    const baseProfile = {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        email: user.email
    };

    const existingProfile = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

    if (!existingProfile.data) {
        const insertProfile = await supabaseClient.from('profiles').insert(baseProfile);
        if (insertProfile.error) console.error(insertProfile.error);
    }

    const existingProgress = await supabaseClient
        .from('challenge_progress')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!existingProgress.data) {
        const insertProgress = await supabaseClient.from('challenge_progress').insert({ user_id: user.id });
        if (insertProgress.error) console.error(insertProgress.error);
    }
}

function clearCurrentState() {
    appState.currentUser = null;
    appState.currentProfile = null;
    appState.currentProgress = null;
    appState.currentAdmin = null;
}

function displayPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');

    updateNavigation();

    if (pageId === 'dashboard-page') {
        updateDashboard();
    } else if (pageId === 'leaderboard-page') {
        updateLeaderboard();
    } else if (pageId === 'admin-dashboard-page') {
        loadAdminDashboard();
    }
}

function updateNavigation() {
    const isAdmin = !!appState.currentAdmin;
    const isUser = !!appState.currentUser && !isAdmin;

    setDisplay('nav-login', !appState.currentUser);
    setDisplay('nav-admin-login', !appState.currentUser);
    setDisplay('nav-dashboard', isUser);
    setDisplay('nav-admin-dashboard', isAdmin);
    setDisplay('nav-leaderboard', true);
    setDisplay('nav-logout', isUser);
    setDisplay('nav-admin-logout', isAdmin);
    setDisplay('admin-badge', isAdmin, 'inline');
}

function setDisplay(id, visible, showValue = 'block') {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = visible ? showValue : 'none';
}

async function handleLogin(e) {
    e.preventDefault();

    const fullName = document.getElementById('full-name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!fullName || !email || !password) {
        alert('Please fill in all fields');
        return;
    }

    let { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        const invalidLogin = String(error.message || '').toLowerCase().includes('invalid login credentials');

        if (!invalidLogin) {
            alert(error.message || 'Unable to sign in.');
            return;
        }

        const signUpResult = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    email
                }
            }
        });

        if (signUpResult.error) {
            alert(signUpResult.error.message || 'Unable to create account.');
            return;
        }

        if (signUpResult.data.user) {
            alert('Account created successfully! If email confirmation is enabled in Supabase, please verify your email first. After sign-in, your account still needs admin approval.');
        }

        if (signUpResult.data.session?.user) {
            await loadUserContext(signUpResult.data.session.user);
            document.getElementById('login-form').reset();
            displayPage('dashboard-page');
        } else {
            document.getElementById('login-form').reset();
            displayPage('login-page');
        }

        return;
    }

    if (!data.user) {
        alert('Unable to sign in.');
        return;
    }

    await loadUserContext(data.user);
    document.getElementById('login-form').reset();
    displayPage('dashboard-page');
}

async function handleAdminLogin(e) {
    e.preventDefault();

    const email = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        alert(error.message || 'Admin login failed');
        return;
    }

    if (!data.user) {
        alert('Admin login failed');
        return;
    }

    await loadUserContext(data.user);

    if (!appState.currentAdmin) {
        await supabaseClient.auth.signOut();
        alert('This account is not marked as admin in Supabase.');
        return;
    }

    document.getElementById('admin-login-form').reset();
    displayPage('admin-dashboard-page');
}

async function logout() {
    await supabaseClient.auth.signOut();
    clearCurrentState();
    updateNavigation();
    displayPage('home-page');
    alert('Logged out successfully');
}

function updateDashboard() {
    if (!appState.currentUser || !appState.currentProfile || !appState.currentProgress) {
        displayPage('login-page');
        return;
    }

    const user = appState.currentProfile;
    const progress = appState.currentProgress;
    const statusMessage = document.getElementById('status-message');
    const statusDetail = document.getElementById('status-detail');
    const approvalPending = document.getElementById('approval-pending');
    const activeChallenge = document.getElementById('active-challenge');

    if (user.approved) {
        statusMessage.textContent = 'Welcome, ' + user.full_name + '!';
        statusDetail.textContent = 'You are approved. Start your 40-day journey!';
        approvalPending.style.display = 'none';
        activeChallenge.style.display = 'block';
        updateStreakDisplay();
        updateSalahForm();
        loadHistory();
    } else {
        statusMessage.textContent = 'Account Pending Approval';
        statusDetail.textContent = 'Your account (' + user.email + ') is awaiting admin approval.';
        approvalPending.style.display = 'block';
        activeChallenge.style.display = 'none';
    }

    document.getElementById('current-streak').textContent = progress.streak || 0;
    document.getElementById('lifeliner-count').textContent = (progress.lifeliner || 0) + ' remaining';
}

function updateStreakDisplay() {
    if (!appState.currentProgress) return;
    document.getElementById('current-streak').textContent = appState.currentProgress.streak || 0;
    document.getElementById('lifeliner-count').textContent = (appState.currentProgress.lifeliner || 0) + ' remaining';
}

function updateSalahForm() {
    const todayDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    document.getElementById('today-date').textContent = 'Date: ' + todayDate;
}

function handleSalahChange(e) {
    const select = e.target;
    const commentField = select.parentElement.querySelector('.qaza-comment');

    if (select.value === 'qaza') {
        commentField.classList.add('show');
        commentField.required = true;
    } else {
        commentField.classList.remove('show');
        commentField.required = false;
        commentField.value = '';
    }
}

async function handleSalahSubmit(e) {
    e.preventDefault();

    if (!appState.currentUser || !appState.currentProfile?.approved) {
        alert('You need to be approved to submit entries');
        return;
    }

    const form = e.target;
    const formData = new FormData(form);

    for (const salah of PRAYERS) {
        const value = formData.get(salah);
        if (value === 'qaza') {
            const comment = formData.get(salah + '-comment');
            if (!comment || String(comment).trim() === '') {
                alert('Qaza prayers require a comment explaining why');
                return;
            }
        }
    }

    let jamatCount = 0;
    for (const salah of PRAYERS) {
        if (formData.get(salah) === 'jamat') jamatCount++;
    }

    if ((PRAYERS.length - jamatCount) >= 2 && (appState.currentProgress.streak || 0) > 0) {
        await resetToCheckpoint();
        alert('You missed 2 or more Jamat prayers. Streak reset to previous checkpoint!');
        updateStreakDisplay();
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    const existingResult = await supabaseClient
        .from('salah_entries')
        .select('id')
        .eq('user_id', appState.currentUser.id)
        .eq('entry_date', today)
        .maybeSingle();

    if (existingResult.error) {
        console.error(existingResult.error);
        alert(existingResult.error.message || 'Unable to check existing entry.');
        return;
    }

    const payload = {
        user_id: appState.currentUser.id,
        entry_date: today,
        fajr: formData.get('fajr'),
        fajr_comment: nullableString(formData.get('fajr-comment')),
        zuhr: formData.get('zuhr'),
        zuhr_comment: nullableString(formData.get('zuhr-comment')),
        asr: formData.get('asr'),
        asr_comment: nullableString(formData.get('asr-comment')),
        maghrib: formData.get('maghrib'),
        maghrib_comment: nullableString(formData.get('maghrib-comment')),
        isha: formData.get('isha'),
        isha_comment: nullableString(formData.get('isha-comment'))
    };

    const upsertResult = await supabaseClient
        .from('salah_entries')
        .upsert(payload, { onConflict: 'user_id,entry_date' });

    if (upsertResult.error) {
        console.error(upsertResult.error);
        alert(upsertResult.error.message || 'Unable to save today\'s entry.');
        return;
    }

    if (!existingResult.data) {
        const nextStreak = (appState.currentProgress.streak || 0) + 1;

        const progressUpdate = await supabaseClient
            .from('challenge_progress')
            .update({ streak: nextStreak })
            .eq('user_id', appState.currentUser.id)
            .select()
            .single();

        if (progressUpdate.error) {
            console.error(progressUpdate.error);
            alert(progressUpdate.error.message || 'Entry saved but streak update failed.');
            return;
        }

        appState.currentProgress = progressUpdate.data;

        if (appState.currentProgress.streak >= 40) {
            alert('🎉 Congratulations! You have completed the 40-Day Namaz Challenge!');
        }
    }

    form.reset();

    document.querySelectorAll('.qaza-comment').forEach(comment => {
        comment.classList.remove('show');
        comment.required = false;
    });

    alert(existingResult.data ? 'Today\'s entry updated successfully!' : 'Today\'s entry submitted successfully!');
    updateStreakDisplay();
    await loadHistory();
    await updateLeaderboard();
}

function nullableString(value) {
    const str = String(value || '').trim();
    return str === '' ? null : str;
}

async function resetToCheckpoint() {
    const checkpoints = [0, 5, 10, 15, 20, 25, 30, 35];
    const currentStreak = appState.currentProgress.streak || 0;
    let previousCheckpoint = 0;

    for (const cp of checkpoints) {
        if (cp < currentStreak) previousCheckpoint = cp;
    }

    const { data, error } = await supabaseClient
        .from('challenge_progress')
        .update({ streak: previousCheckpoint })
        .eq('user_id', appState.currentUser.id)
        .select()
        .single();

    if (error) {
        console.error(error);
        alert(error.message || 'Unable to reset to checkpoint.');
        return;
    }

    appState.currentProgress = data;
}

async function useLifeliner() {
    if (!appState.currentUser || !appState.currentProfile?.approved) return;

    if ((appState.currentProgress.lifeliner || 0) <= 0) {
        alert('No lifelines remaining!');
        return;
    }

    const nextValues = {
        lifeliner: (appState.currentProgress.lifeliner || 0) - 1,
        streak: (appState.currentProgress.streak || 0) + 1
    };

    const { data, error } = await supabaseClient
        .from('challenge_progress')
        .update(nextValues)
        .eq('user_id', appState.currentUser.id)
        .select()
        .single();

    if (error) {
        console.error(error);
        alert(error.message || 'Unable to use lifeliner.');
        return;
    }

    appState.currentProgress = data;
    updateStreakDisplay();
    await updateLeaderboard();
    alert('Lifeliner used! Your streak has been extended by 1 day.');
}

async function loadHistory() {
    if (!appState.currentUser) return;

    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    const { data, error } = await supabaseClient
        .from('salah_entries')
        .select('*')
        .eq('user_id', appState.currentUser.id)
        .order('entry_date', { ascending: false })
        .limit(10);

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">Unable to load history</td></tr>';
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No entries yet</td></tr>';
        return;
    }

    let html = '';

    data.forEach(entry => {
        const dateObj = new Date(entry.entry_date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const entries = PRAYERS.map(prayer => entry[prayer]);
        const status = entries.every(value => value === 'jamat') ? '✓ Complete' : '⚠ Partial';

        html += `<tr>
            <td>${formattedDate}</td>
            <td>${STATUS_LABELS[entry.fajr] || '-'}</td>
            <td>${STATUS_LABELS[entry.zuhr] || '-'}</td>
            <td>${STATUS_LABELS[entry.asr] || '-'}</td>
            <td>${STATUS_LABELS[entry.maghrib] || '-'}</td>
            <td>${STATUS_LABELS[entry.isha] || '-'}</td>
            <td>${status}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

async function updateLeaderboard() {
    const profilesPromise = supabaseClient
        .from('profiles')
        .select('id, full_name, approved, is_admin')
        .eq('approved', true)
        .eq('is_admin', false);

    const progressPromise = supabaseClient
        .from('challenge_progress')
        .select('user_id, streak');

    const [profilesResult, progressResult] = await Promise.all([profilesPromise, progressPromise]);

    if (profilesResult.error || progressResult.error) {
        console.error(profilesResult.error || progressResult.error);
        return;
    }

    const streakMap = new Map((progressResult.data || []).map(row => [row.user_id, row.streak || 0]));

    const users = (profilesResult.data || [])
        .map(profile => ({
            id: profile.id,
            full_name: profile.full_name,
            streak: streakMap.get(profile.id) || 0
        }))
        .sort((a, b) => b.streak - a.streak);

    const previewBody = document.getElementById('preview-leaderboard');
    if (previewBody) {
        if (users.length === 0) {
            previewBody.innerHTML = '<tr><td colspan="4" class="no-data">No active participants yet</td></tr>';
        } else {
            previewBody.innerHTML = users.slice(0, 5).map((user, index) => {
                const progressPercent = Math.min(100, Math.round((user.streak / 40) * 100));
                return `<tr>
                    <td>#${index + 1}</td>
                    <td>${escapeHtml(user.full_name)}</td>
                    <td>${user.streak} days</td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: ${progressPercent}%"></div></div></td>
                </tr>`;
            }).join('');
        }
    }

    const leaderboardBody = document.getElementById('leaderboard-body');
    if (leaderboardBody) {
        if (users.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="5" class="no-data">No participants yet</td></tr>';
        } else {
            leaderboardBody.innerHTML = users.map((user, index) => {
                let status = 'Active';
                if (user.streak >= 40) status = '🏆 Completed';
                else if (user.streak === 0) status = 'Starting';

                return `<tr>
                    <td><strong>#${index + 1}</strong></td>
                    <td>${escapeHtml(user.full_name)}</td>
                    <td>${user.streak}/40</td>
                    <td>${user.streak} days</td>
                    <td>${status}</td>
                </tr>`;
            }).join('');
        }
    }
}

async function loadAdminDashboard() {
    if (!appState.currentAdmin) {
        appState.pendingRedirectPage = 'admin-dashboard-page';
        displayPage('admin-login-page');
        return;
    }

    const adminName = document.getElementById('admin-name');
    if (adminName) {
        adminName.textContent = (appState.currentProfile?.full_name || appState.currentUser?.email || 'ADMIN').toUpperCase();
    }

    const defaultTabBtn = document.querySelector('.admin-tab-btn[data-tab="pending"]');
    if (defaultTabBtn) {
        await handleAdminTabSwitch({ target: defaultTabBtn });
    }
}

async function handleAdminTabSwitch(e) {
    const target = e?.target || null;
    const tab = target?.dataset?.tab || 'pending';

    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.style.display = 'none';
    });

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) tabContent.style.display = 'block';
    if (target?.classList) target.classList.add('active');

    if (tab === 'pending') await loadPendingApprovals();
    else if (tab === 'active') await loadActiveUsers();
    else if (tab === 'all') await loadAllUsers();
    else if (tab === 'stats') await loadStatistics();
}

async function fetchProfilesAndProgress() {
    const [profilesResult, progressResult] = await Promise.all([
        supabaseClient.from('profiles').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('challenge_progress').select('*')
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (progressResult.error) throw progressResult.error;

    const progressMap = new Map((progressResult.data || []).map(row => [row.user_id, row]));

    return (profilesResult.data || []).map(profile => ({
        ...profile,
        streak: progressMap.get(profile.id)?.streak || 0,
        lifeliner: progressMap.get(profile.id)?.lifeliner || 3
    }));
}

async function loadPendingApprovals() {
    const container = document.getElementById('pending-users-list');
    if (!container) return;

    try {
        const users = (await fetchProfilesAndProgress()).filter(user => !user.approved && !user.is_admin);

        if (users.length === 0) {
            container.innerHTML = '<p class="no-data">No pending approvals</p>';
            return;
        }

        let html = '<div class="users-grid">';
        users.forEach(user => {
            const regDate = new Date(user.created_at).toLocaleDateString();
            html += `
                <div class="user-card pending">
                    <div class="user-header">
                        <h4>${escapeHtml(user.full_name)}</h4>
                        <span class="badge badge-pending">PENDING</span>
                    </div>
                    <div class="user-info">
                        <p><strong>Email:</strong> ${escapeHtml(user.email || '-')}</p>
                        <p><strong>Registered:</strong> ${regDate}</p>
                    </div>
                    <div class="user-actions">
                        <button class="btn btn-approve approve-btn" data-user-id="${user.id}">✓ Approve</button>
                        <button class="btn btn-reject reject-btn" data-user-id="${user.id}">✗ Reject</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="no-data">Unable to load pending approvals</p>';
    }
}

async function loadActiveUsers() {
    const container = document.getElementById('active-users-list');
    if (!container) return;

    try {
        const users = (await fetchProfilesAndProgress())
            .filter(user => user.approved && !user.is_admin)
            .sort((a, b) => b.streak - a.streak);

        if (users.length === 0) {
            container.innerHTML = '<p class="no-data">No active users</p>';
            return;
        }

        let html = '<div class="users-table"><table><thead><tr><th>Name</th><th>Email</th><th>Streak</th><th>Progress</th><th>Lifelines</th><th>Actions</th></tr></thead><tbody>';

        users.forEach(user => {
            const progress = Math.round((user.streak / 40) * 100);
            html += `
                <tr>
                    <td><strong>${escapeHtml(user.full_name)}</strong></td>
                    <td>${escapeHtml(user.email || '-')}</td>
                    <td><span class="streak-badge">${user.streak}/40</span></td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: ${Math.min(100, progress)}%"></div></div></td>
                    <td>${user.lifeliner}</td>
                    <td>
                        <button class="btn btn-small btn-reset reset-btn" data-user-id="${user.id}">Reset</button>
                        <button class="btn btn-small btn-delete delete-user-btn" data-user-id="${user.id}">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="no-data">Unable to load active users</p>';
    }
}

async function loadAllUsers() {
    const container = document.getElementById('all-users-list');
    if (!container) return;

    try {
        const users = await fetchProfilesAndProgress();

        if (users.length === 0) {
            container.innerHTML = '<p class="no-data">No users registered</p>';
            return;
        }

        let html = '<div class="users-table"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Streak</th><th>Registered</th></tr></thead><tbody>';

        users.forEach(user => {
            const status = user.is_admin
                ? '<span class="badge badge-approved">ADMIN</span>'
                : user.approved
                    ? '<span class="badge badge-approved">APPROVED</span>'
                    : '<span class="badge badge-pending">PENDING</span>';

            const regDate = new Date(user.created_at).toLocaleDateString();

            html += `
                <tr>
                    <td>${escapeHtml(user.full_name)}</td>
                    <td>${escapeHtml(user.email || '-')}</td>
                    <td>${status}</td>
                    <td>${user.streak}</td>
                    <td>${regDate}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="no-data">Unable to load users</p>';
    }
}

async function loadStatistics() {
    const container = document.getElementById('stats-content');
    if (!container) return;

    try {
        const users = await fetchProfilesAndProgress();
        const totalUsers = users.filter(user => !user.is_admin).length;
        const approvedUsers = users.filter(user => user.approved && !user.is_admin).length;
        const pendingUsers = users.filter(user => !user.approved && !user.is_admin).length;
        const completedUsers = users.filter(user => user.streak >= 40 && !user.is_admin).length;

        const entriesCountResult = await supabaseClient
            .from('salah_entries')
            .select('id', { count: 'exact', head: true });

        const totalSubmissions = entriesCountResult.count || 0;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h4>Total Users</h4>
                    <div class="stat-number">${totalUsers}</div>
                </div>
                <div class="stat-card">
                    <h4>Approved Users</h4>
                    <div class="stat-number" style="color: #10B981;">${approvedUsers}</div>
                </div>
                <div class="stat-card">
                    <h4>Pending Approvals</h4>
                    <div class="stat-number" style="color: #F59E0B;">${pendingUsers}</div>
                </div>
                <div class="stat-card">
                    <h4>Completed Challenge</h4>
                    <div class="stat-number" style="color: #3B82F6;">${completedUsers}</div>
                </div>
                <div class="stat-card">
                    <h4>Total Submissions</h4>
                    <div class="stat-number" style="color: #8B5CF6;">${totalSubmissions}</div>
                </div>
                <div class="stat-card">
                    <h4>Completion Rate</h4>
                    <div class="stat-number" style="color: #EF4444;">${approvedUsers > 0 ? Math.round((completedUsers / approvedUsers) * 100) : 0}%</div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="no-data">Unable to load statistics</p>';
    }
}

async function adminApproveUser(userId) {
    const result = await supabaseClient
        .from('profiles')
        .update({ approved: true })
        .eq('id', userId)
        .select()
        .single();

    if (result.error) {
        console.error(result.error);
        alert(result.error.message || 'Unable to approve user.');
        return;
    }

    await refreshAdminViews();
    alert(`✓ ${result.data.full_name} has been approved!`);
}

async function adminRejectUser(userId) {
    const profileResult = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

    if (profileResult.error) {
        console.error(profileResult.error);
        alert(profileResult.error.message || 'Unable to load user.');
        return;
    }

    const deleteEntries = await supabaseClient.from('salah_entries').delete().eq('user_id', userId);
    if (deleteEntries.error) {
        console.error(deleteEntries.error);
        alert(deleteEntries.error.message || 'Unable to delete user entries.');
        return;
    }

    const deleteProgress = await supabaseClient.from('challenge_progress').delete().eq('user_id', userId);
    if (deleteProgress.error) {
        console.error(deleteProgress.error);
        alert(deleteProgress.error.message || 'Unable to delete challenge progress.');
        return;
    }

    const deleteProfile = await supabaseClient.from('profiles').delete().eq('id', userId);
    if (deleteProfile.error) {
        console.error(deleteProfile.error);
        alert(deleteProfile.error.message || 'Unable to delete profile.');
        return;
    }

    await refreshAdminViews();
    alert(`✗ ${profileResult.data.full_name} has been rejected and removed.`);
}

async function adminResetStreak(userId) {
    const profileResult = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

    if (profileResult.error) {
        console.error(profileResult.error);
        alert(profileResult.error.message || 'Unable to load user.');
        return;
    }

    if (!confirm(`Reset streak for ${profileResult.data.full_name}?`)) return;

    const updateResult = await supabaseClient
        .from('challenge_progress')
        .update({ streak: 0, lifeliner: 3 })
        .eq('user_id', userId);

    if (updateResult.error) {
        console.error(updateResult.error);
        alert(updateResult.error.message || 'Unable to reset streak.');
        return;
    }

    await supabaseClient.from('salah_entries').delete().eq('user_id', userId);
    await refreshAdminViews();
    alert(`Streak reset for ${profileResult.data.full_name}`);
}

async function adminDeleteUser(userId) {
    const profileResult = await supabaseClient
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

    if (profileResult.error) {
        console.error(profileResult.error);
        alert(profileResult.error.message || 'Unable to load user.');
        return;
    }

    if (!confirm(`Delete ${profileResult.data.full_name} and all their data?`)) return;

    await adminRejectUser(userId);
}

async function refreshAdminViews() {
    await Promise.all([
        loadPendingApprovals(),
        loadActiveUsers(),
        loadAllUsers(),
        loadStatistics(),
        updateLeaderboard()
    ]);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.appState = appState;
window.approveUser = adminApproveUser;
