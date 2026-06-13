// Prayer Tracker
const prayerCheckboxes = document.querySelectorAll('.prayer-checkbox');
const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// Load saved data from localStorage
window.addEventListener('load', () => {
    loadTrackerData();
    updateStatistics();
});

// Add event listeners to checkboxes
prayerCheckboxes.forEach((checkbox, index) => {
    checkbox.addEventListener('change', () => {
        saveTrackerData();
        updateStatistics();
    });
});

// Save tracker data to localStorage
function saveTrackerData() {
    const today = new Date().toDateString();
    const prayersCompleted = [];
    
    prayerCheckboxes.forEach((checkbox, index) => {
        prayersCompleted.push(checkbox.checked);
    });
    
    const data = JSON.parse(localStorage.getItem('prayerData') || '{}');
    data[today] = prayersCompleted;
    localStorage.setItem('prayerData', JSON.stringify(data));
}

// Load tracker data from localStorage
function loadTrackerData() {
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem('prayerData') || '{}');
    
    if (data[today]) {
        prayerCheckboxes.forEach((checkbox, index) => {
            checkbox.checked = data[today][index];
        });
    }
}

// Update statistics
function updateStatistics() {
    const data = JSON.parse(localStorage.getItem('prayerData') || '{}');
    const daysCompleted = Object.keys(data).filter(day => {
        const completed = data[day].every(prayer => prayer === true);
        return completed;
    }).length;
    
    const totalPrayers = Object.keys(data).reduce((total, day) => {
        return total + data[day].filter(prayer => prayer === true).length;
    }, 0);
    
    const totalPossiblePrayers = Object.keys(data).length * 5;
    const completionRate = totalPossiblePrayers > 0 
        ? Math.round((totalPrayers / totalPossiblePrayers) * 100) 
        : 0;
    
    // Update DOM elements if they exist
    const daysCompletedElement = document.getElementById('daysCompleted');
    const prayersCountElement = document.getElementById('prayersCount');
    const completionRateElement = document.getElementById('completionRate');
    
    if (daysCompletedElement) daysCompletedElement.textContent = daysCompleted;
    if (prayersCountElement) prayersCountElement.textContent = totalPrayers;
    if (completionRateElement) completionRateElement.textContent = completionRate + '%';
}

// Handle challenge form submission
const challengeForm = document.getElementById('challengeForm');
if (challengeForm) {
    challengeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const startDate = document.getElementById('startDate').value;
        
        // Save registration data
        const registrationData = {
            name: name,
            email: email,
            startDate: startDate,
            registeredAt: new Date().toISOString()
        };
        
        localStorage.setItem('challengeRegistration', JSON.stringify(registrationData));
        
        // Show success message
        alert('Registration successful! Your 40-day journey begins on ' + startDate);
        challengeForm.reset();
    });
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadTrackerData();
    });
}
