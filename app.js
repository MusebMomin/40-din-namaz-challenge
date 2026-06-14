// Data Management
const appState = {
    currentUser: null,
    isApproved: false,
    challengeData: {
        users: [],
        entries: {}
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
    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('dashboard-page');
    });
    document.getElementById('nav-leaderboard').addEventListener('click', (e) => {
        e.preventDefault();
        displayPage('leaderboard-page');
    });
    document.getElementById('nav-logout').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // Buttons
    document.getElementById('start-btn').addEventListener('click', () => {
        displayPage('login-page');
    });

    // Forms
    document.getElementById('login-form').addEventListener('submit', handleLogin);
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
    }
}

function updateNavigation() {
    if (appState.currentUser) {
        document.getElementById('nav-login').style.display = 'none';
        document.getElementById('nav-dashboard').style.display = 'block';
        document.getElementById('nav-leaderboard').style.display = 'block';
        document.getElementById('nav-logout').style.display = 'block';
    } else {
        document.getElementById('nav-login').style.display = 'block';
        document.getElementById('nav-dashboard').style.display = 'none';
        document.getElementById('nav-leaderboard').style.display = 'none';
        document.getElementById('nav-logout').style.display = 'none';
    }
}

// Authentication
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
        password: btoa(password), // Simple encoding (not secure - for demo)
        registeredAt: new Date().toISOString(),
        approved: false,
        streak: 0,
        lifeliner: 3
    };

    // Check if user exists
    const existingUser = appState.challengeData.users.find(u => u.email === email);
    if (existingUser) {
        // Login existing user
        appState.currentUser = existingUser;
        appState.isApproved = existingUser.approved;
    } else {
        // Register new user
        appState.challengeData.users.push(user);
        appState.currentUser = user;
        appState.isApproved = false;
        alert('Account created! Waiting for admin approval.');
    }

    saveToLocalStorage();
    displayPage('dashboard-page');
}

function logout() {
    appState.currentUser = null;
    appState.isApproved = false;
    saveToLocalStorage();
    document.getElementById('login-form').reset();
    displayPage('home-page');
    alert('Logged out successfully');
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
                    <td><div class="progress-bar" style="width: ${progressPercent}%; background: var(--primary-color); height: 20px; border-radius: 3px;"></div></td>
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
        isApproved: appState.isApproved,
        challengeData: appState.challengeData
    }));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('namaz-challenge-data');
    if (saved) {
        const data = JSON.parse(saved);
        appState.currentUser = data.currentUser;
        appState.isApproved = data.isApproved;
        appState.challengeData = data.challengeData;
    }
}

// Demo: Approve first user after registration (in real app, admin would do this)
function approveUser(userId) {
    const user = appState.challengeData.users.find(u => u.id === userId);
    if (user) {
        user.approved = true;
        if (appState.currentUser && appState.currentUser.id === userId) {
            appState.isApproved = true;
        }
        saveToLocalStorage();
        updateLeaderboard();
    }
}

// Make approveUser available in console for testing
window.approveUser = approveUser;
window.appState = appState;
