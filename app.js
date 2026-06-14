// Data Management
const appState = {
    currentUser: null,
    currentAdmin: null,
    isApproved: false,
    challengeData: {
        users: [],
        entries: {},
        admins: [
            {
                id: 'admin_museb',
                username: 'museb',
                email: 'musebmomin@gmail.com',
                password: btoa('Namaz@11'), // Simple encoding
                role: 'super_admin',
                createdAt: new Date().toISOString()
            }
        ]
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    loadFromLocalStorage();
    setupEventListeners();
    displayPage('home-page');
    updateLeaderboard();
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('nav-home').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('home-page');
    });
    document.getElementById('nav-login').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('login-page');
    });
    document.getElementById('nav-admin-login').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('admin-login-page');
    });
    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('dashboard-page');
    });
    document.getElementById('nav-admin-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('admin-dashboard-page');
    });
    document.getElementById('nav-leaderboard').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('leaderboard-page');
    });
    document.getElementById('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
    document.getElementById('nav-admin-logout').addEventListener('click', (e) => {
        e.preventDefault();
        adminLogout();
    });

    // Buttons
    document.getElementById('start-btn').addEventListener('click', () => {
        displayPage('login-page');
    });

    // Forms
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
    document.getElementById('salah-form').addEventListener('submit', handleSalahSubmit);

    // Salah dropdown listeners for Qaza comments
    const selects = document.querySelectorAll('.salah-options select');
    selects.forEach(select => {
        select.addEventListener('change', handleSalahChange);
    });

    // Lifeliner button
    const lifelinerBtn = document.getElementById('use-lifeliner-btn');
    if (lifelinerBtn) {
        lifelinerBtn.addEventListener('click', useLifeliner);
    }

    // Admin panel tabs
    const adminTabs = document.querySelectorAll('.admin-tab-btn');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', handleAdminTabSwitch);
    });

    // Admin actions
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('approve-btn')) {
            const userId = e.target.dataset.userId;
            adminApproveUser(userId);
        }
        if (e.target.classList.contains('reject-btn')) {
            const userId = e.target.dataset.userId;
            adminRejectUser(userId);
        }
        if (e.target.classList.contains('reset-btn')) {
            const userId = e.target.dataset.userId;
            adminResetStreak(userId);
        }
        if (e.target.classList.contains('delete-user-btn')) {
            const userId = e.target.dataset.userId;
            adminDeleteUser(userId);
        }
    });
}

// Page Navigation
function displayPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    // Show selected page
    document.getElementById(pageId).classList.add('active');

    // Update navigation
    updateNavigation();

    // Load page-specific data
    if (pageId === 'dashboard-page') {
        updateDashboard();
    } else if (pageId === 'leaderboard-page') {
        updateLeaderboard();
    } else if (pageId === 'admin-dashboard-page') {
        loadAdminDashboard();
    }
}

function updateNavigation() {
    if (appState.currentAdmin) {
        // Admin view
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-admin-login').style.display = 'none';
        document.getElementById('nav-dashboard').style.display = 'none';
        document.getElementById('nav-admin-dashboard').style.display = 'block';
        document.getElementById('nav-leaderboard').style.display = 'block';
        document.getElementById('nav-logout').style.display = 'none';
        document.getElementById('nav-admin-logout').style.display = 'block';
        document.getElementById('admin-badge').style.display = 'inline';
    } else if (appState.currentUser) {
        // User view
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-admin-login').style.display = 'block';
        document.getElementById('nav-dashboard').style.display = 'block';
        document.getElementById('nav-admin-dashboard').style.display = 'none';
        document.getElementById('nav-leaderboard').style.display = 'block';
        document.getElementById('nav-logout').style.display = 'block';
        document.getElementById('nav-admin-logout').style.display = 'none';
        document.getElementById('admin-badge').style.display = 'none';
    } else {
        // Logged out
        document.getElementById('nav-login').style.display = 'block';
        document.getElementById('nav-admin-login').style.display = 'block';
        document.getElementById('nav-dashboard').style.display = 'none';
        document.getElementById('nav-admin-dashboard').style.display = 'none';
        document.getElementById('nav-leaderboard').style.display = 'block';
        document.getElementById('nav-logout').style.display = 'none';
        document.getElementById('nav-admin-logout').style.display = 'none';
        document.getElementById('admin-badge').style.display = 'none';
    }
}

// User Authentication
function handleLogin(e) {
    e.preventDefault();

    const fullName = document.getElementById('full-name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!fullName || !email || !password) {
        alert('Please fill in all fields');
        return;
    }

    // Create user object
    const user = {
        id: generateId(),
        fullName,
        email,
        password: btoa(password),
        registeredAt: new Date().toISOString(),
        approved: false,
        streak: 0,
        lifeliner: 3
    };

    // Check if user exists
    const existingUser = appState.challengeData.users.find(u => u.email === email);
    if (existingUser) {
        // Login existing user
        const inputPassword = btoa(password);
        if (inputPassword === existingUser.password) {
            appState.currentUser = existingUser;
            appState.isApproved = existingUser.approved;
        } else {
            alert('Invalid password');
            return;
        }
    } else {
        // Register new user
        appState.challengeData.users.push(user);
        appState.currentUser = user;
        appState.isApproved = false;
        alert('Account created! Waiting for admin approval.');
    }

    saveToLocalStorage();
    document.getElementById('login-form').reset();
    displayPage('dashboard-page');
}

// Admin Authentication
function handleAdminLogin(e) {
    e.preventDefault();

    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    if (!username || !password) {
        alert('Please fill in all fields');
        return;
    }

    const admin = appState.challengeData.admins.find(a => a.username === username);
    if (!admin) {
        alert('Admin not found');
        return;
    }

    const inputPassword = btoa(password);
    if (inputPassword !== admin.password) {
        alert('Invalid password');
        return;
    }

    appState.currentAdmin = admin;
    appState.currentUser = null;
    appState.isApproved = false;

    saveToLocalStorage();
    document.getElementById('admin-login-form').reset();
    displayPage('admin-dashboard-page');
}

function logout() {
    appState.currentUser = null;
    appState.isApproved = false;
    saveToLocalStorage();
    document.getElementById('login-form').reset();
    displayPage('home-page');
    alert('Logged out successfully');
}

function adminLogout() {
    appState.currentAdmin = null;
    saveToLocalStorage();
    document.getElementById('admin-login-form').reset();
    displayPage('home-page');
    alert('Admin logged out successfully');
}

// Admin Dashboard
function loadAdminDashboard() {
    if (!appState.currentAdmin) {
        displayPage('admin-login-page');
        return;
    }

    const adminName = document.getElementById('admin-name');
    if (adminName) {
        adminName.textContent = appState.currentAdmin.username.toUpperCase();
    }

    // Load default tab
    handleAdminTabSwitch({ target: { dataset: { tab: 'pending' } } });
}

function handleAdminTabSwitch(e) {
    const tab = e.target.dataset.tab;

    // Hide all tabs
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Remove active class from all buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const tabContent = document.getElementById('tab-' + tab);
    if (tabContent) {
        tabContent.style.display = 'block';
    }
    e.target.classList.add('active');

    // Load tab data
    if (tab === 'pending') {
        loadPendingApprovals();
    } else if (tab === 'active') {
        loadActiveUsers();
    } else if (tab === 'all') {
        loadAllUsers();
    } else if (tab === 'stats') {
        loadStatistics();
    }
}

function loadPendingApprovals() {
    const users = appState.challengeData.users.filter(u => !u.approved);
    const container = document.getElementById('pending-users-list');

    if (users.length === 0) {
        container.innerHTML = '<p class="no-data">No pending approvals</p>';
        return;
    }

    let html = '<div class="users-grid">';
    users.forEach(user => {
        const regDate = new Date(user.registeredAt).toLocaleDateString();
        html += `
            <div class="user-card pending">
                <div class="user-header">
                    <h4>${user.fullName}</h4>
                    <span class="badge badge-pending">PENDING</span>
                </div>
                <div class="user-info">
                    <p><strong>Email:</strong> ${user.email}</p>
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
}

function loadActiveUsers() {
    const users = appState.challengeData.users.filter(u => u.approved);
    users.sort((a, b) => b.streak - a.streak);
    const container = document.getElementById('active-users-list');

    if (users.length === 0) {
        container.innerHTML = '<p class="no-data">No active users</p>';
        return;
    }

    let html = '<div class="users-table"><table><thead><tr><th>Name</th><th>Email</th><th>Streak</th><th>Progress</th><th>Lifelines</th><th>Actions</th></tr></thead><tbody>';
    users.forEach(user => {
        const progress = Math.round((user.streak / 40) * 100);
        const status = user.streak >= 40 ? '✓ Completed' : progress + '%';
        html += `
            <tr>
                <td><strong>${user.fullName}</strong></td>
                <td>${user.email}</td>
                <td><span class="streak-badge">${user.streak}/40</span></td>
                <td><div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div></td>
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
}

function loadAllUsers() {
    const users = appState.challengeData.users;
    const container = document.getElementById('all-users-list');

    if (users.length === 0) {
        container.innerHTML = '<p class="no-data">No users registered</p>';
        return;
    }

    let html = '<div class="users-table"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Streak</th><th>Registered</th></tr></thead><tbody>';
    users.forEach(user => {
        const status = user.approved ? '<span class="badge badge-approved">APPROVED</span>' : '<span class="badge badge-pending">PENDING</span>';
        const regDate = new Date(user.registeredAt).toLocaleDateString();
        html += `
            <tr>
                <td>${user.fullName}</td>
                <td>${user.email}</td>
                <td>${status}</td>
                <td>${user.streak}</td>
                <td>${regDate}</td>
            </tr>
        `;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function loadStatistics() {
    const container = document.getElementById('stats-content');
    const totalUsers = appState.challengeData.users.length;
    const approvedUsers = appState.challengeData.users.filter(u => u.approved).length;
    const pendingUsers = totalUsers - approvedUsers;
    const completedUsers = appState.challengeData.users.filter(u => u.streak >= 40).length;
    const totalSubmissions = Object.keys(appState.challengeData.entries).reduce((sum, userId) => {
        return sum + Object.keys(appState.challengeData.entries[userId] || {}).length;
    }, 0);

    let html = `
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
    container.innerHTML = html;
}

// Admin Actions
function adminApproveUser(userId) {
    const user = appState.challengeData.users.find(u => u.id === userId);
    if (!user) return;

    user.approved = true;
    saveToLocalStorage();
    loadPendingApprovals();
    alert(`✓ ${user.fullName} has been approved!`);
}

function adminRejectUser(userId) {
    const index = appState.challengeData.users.findIndex(u => u.id === userId);
    if (index === -1) return;

    const userName = appState.challengeData.users[index].fullName;
    appState.challengeData.users.splice(index, 1);
    delete appState.challengeData.entries[userId];
    saveToLocalStorage();
    loadPendingApprovals();
    alert(`✗ ${userName} has been rejected and removed.`);
}

function adminResetStreak(userId) {
    const user = appState.challengeData.users.find(u => u.id === userId);
    if (!user) return;

    if (confirm(`Reset streak for ${user.fullName}?`)) {
        user.streak = 0;
        user.lifeliner = 3;
        delete appState.challengeData.entries[userId];
        saveToLocalStorage();
        loadActiveUsers();
        alert(`Streak reset for ${user.fullName}`);
    }
}

function adminDeleteUser(userId) {
    const index = appState.challengeData.users.findIndex(u => u.id === userId);
    if (index === -1) return;

    const userName = appState.challengeData.users[index].fullName;
    if (confirm(`Delete ${userName} and all their data?`)) {
        appState.challengeData.users.splice(index, 1);
        delete appState.challengeData.entries[userId];
        saveToLocalStorage();
        loadAllUsers();
        alert(`${userName} has been deleted.`);
    }
}

// Dashboard
function updateDashboard() {
    if (!appState.currentUser) {
        displayPage('login-page');
        return;
    }

    const user = appState.currentUser;
    const statusMessage = document.getElementById('status-message');
    const statusDetail = document.getElementById('status-detail');
    const approvalPending = document.getElementById('approval-pending');
    const activeChallenge = document.getElementById('active-challenge');

    if (user.approved) {
        statusMessage.textContent = 'Welcome, ' + user.fullName + '!';
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
}

function updateStreakDisplay() {
    const user = appState.currentUser;
    document.getElementById('current-streak').textContent = user.streak;
    document.getElementById('lifeliner-count').textContent = user.lifeliner + ' remaining';
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
    const salahName = select.name;
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

function handleSalahSubmit(e) {
    e.preventDefault();

    if (!appState.currentUser || !appState.isApproved) {
        alert('You need to be approved to submit entries');
        return;
    }

    // Validate Qaza entries have comments
    const form = e.target;
    const formData = new FormData(form);
    const salahs = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'];

    for (let salah of salahs) {
        const value = formData.get(salah);
        if (value === 'qaza') {
            const comment = formData.get(salah + '-comment');
            if (!comment || comment.trim() === '') {
                alert('Qaza prayers require a comment explaining why');
                return;
            }
        }
    }

    // Check for 2 Jamat misses (trigger reset)
    let jamatCount = 0;
    for (let salah of salahs) {
        if (formData.get(salah) === 'jamat') {
            jamatCount++;
        }
    }

    if (jamatCount < 3) {
        // Less than 3 Jamat prayers - possible reset
        const totalNonJamat = salahs.length - jamatCount;
        if (totalNonJamat >= 2 && appState.currentUser.streak > 0) {
            alert('You missed 2 or more Jamat prayers. Streak reset to previous checkpoint!');
            resetToCheckpoint();
            return;
        }
    }

    // Save entry
    const today = new Date().toISOString().split('T')[0];
    if (!appState.challengeData.entries[appState.currentUser.id]) {
        appState.challengeData.entries[appState.currentUser.id] = {};
    }

    appState.challengeData.entries[appState.currentUser.id][today] = {
        date: today,
        entries: Object.fromEntries(formData)
    };

    // Increment streak
    appState.currentUser.streak++;

    // Check if completed
    if (appState.currentUser.streak >= 40) {
        alert('🎉 Congratulations! You have completed the 40-Day Namaz Challenge!');
    }

    saveToLocalStorage();
    form.reset();
    alert('Today\'s entry submitted successfully!');
    updateStreakDisplay();
    loadHistory();
}

function resetToCheckpoint() {
    const checkpoints = [0, 5, 10, 15, 20, 25, 30, 35];
    const currentStreak = appState.currentUser.streak;
    let previousCheckpoint = 0;

    for (let cp of checkpoints) {
        if (cp < currentStreak) {
            previousCheckpoint = cp;
        }
    }

    appState.currentUser.streak = previousCheckpoint;
    saveToLocalStorage();
}

function useLifeliner() {
    if (!appState.currentUser) return;

    if (appState.currentUser.lifeliner <= 0) {
        alert('No lifelines remaining!');
        return;
    }

    appState.currentUser.lifeliner--;
    appState.currentUser.streak++;

    saveToLocalStorage();
    updateStreakDisplay();
    alert('Lifeliner used! Your streak has been extended by 1 day.');
}

function loadHistory() {
    if (!appState.currentUser) return;

    const userId = appState.currentUser.id;
    const userEntries = appState.challengeData.entries[userId] || {};
    const tbody = document.getElementById('history-table-body');

    if (Object.keys(userEntries).length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No entries yet</td></tr>';
        return;
    }

    // Sort entries by date
    const sortedDates = Object.keys(userEntries).sort().reverse();
    let html = '';

    sortedDates.slice(0, 10).forEach(date => {
        const entry = userEntries[date];
        const dateObj = new Date(date);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        const entries = entry.entries;
        const fajr = entries['fajr'] || '-';
        const zuhr = entries['zuhr'] || '-';
        const asr = entries['asr'] || '-';
        const maghrib = entries['maghrib'] || '-';
        const isha = entries['isha'] || '-';
        const status = (fajr === 'jamat' && zuhr === 'jamat' && asr === 'jamat' && maghrib === 'jamat' && isha === 'jamat') ? '✓ Complete' : '⚠ Partial';

        html += `<tr>
            <td>${formattedDate}</td>
            <td>${fajr}</td>
            <td>${zuhr}</td>
            <td>${asr}</td>
            <td>${maghrib}</td>
            <td>${isha}</td>
            <td>${status}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

// Leaderboard
function updateLeaderboard() {
    const users = appState.challengeData.users.filter(u => u.approved);
    users.sort((a, b) => b.streak - a.streak);

    // Preview leaderboard
    const previewBody = document.getElementById('preview-leaderboard');
    if (previewBody) {
        let html = '';
        if (users.length === 0) {
            html = '<tr><td colspan="4" class="no-data">No active participants yet</td></tr>';
        } else {
            users.slice(0, 5).forEach((user, index) => {
                const progressPercent = (user.streak / 40) * 100;
                html += `<tr>
                    <td>#${index + 1}</td>
                    <td>${user.fullName}</td>
                    <td>${user.streak} days</td>
                    <td><div class="progress-bar"><div class="progress-fill" style="width: ${progressPercent}%"></div></div></td>
                </tr>`;
            });
        }
        previewBody.innerHTML = html;
    }

    // Full leaderboard
    const leaderboardBody = document.getElementById('leaderboard-body');
    if (leaderboardBody) {
        let html = '';
        if (users.length === 0) {
            html = '<tr><td colspan="5" class="no-data">No participants yet</td></tr>';
        } else {
            users.forEach((user, index) => {
                let status = 'Active';
                if (user.streak >= 40) {
                    status = '🏆 Completed';
                } else if (user.streak === 0) {
                    status = 'Starting';
                }

                html += `<tr>
                    <td><strong>#${index + 1}</strong></td>
                    <td>${user.fullName}</td>
                    <td>${user.streak}/40</td>
                    <td>${user.streak} days</td>
                    <td>${status}</td>
                </tr>`;
            });
        }
        leaderboardBody.innerHTML = html;
    }
}

// Utility Functions
function generateId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function saveToLocalStorage() {
    localStorage.setItem('namaz-challenge-data', JSON.stringify({
        currentUser: appState.currentUser,
        currentAdmin: appState.currentAdmin,
        isApproved: appState.isApproved,
        challengeData: appState.challengeData
    }));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('namaz-challenge-data');
    if (saved) {
        const data = JSON.parse(saved);
        appState.currentUser = data.currentUser;
        appState.currentAdmin = data.currentAdmin;
        appState.isApproved = data.isApproved;
        appState.challengeData = data.challengeData || appState.challengeData;
    }
}

// Make functions available globally
window.appState = appState;
