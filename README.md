# 40-Day Namaz Challenge Website

## Overview
A comprehensive web application for managing a 40-day Namaz (Islamic prayer) challenge with user tracking, leaderboard, and progress monitoring.

## Features

### User Management
- **Registration & Login System**: Users can create accounts and log in
- **Admin Approval**: New users require admin approval before participating
- **User Dashboard**: Personal progress tracking and entry submission

### Challenge System
- **40-Day Challenge**: Complete 40 consecutive days of Namaz
- **5-Day Checkpoints**: Progress tracked with checkpoint system
- **Streak Tracking**: Real-time display of current streak
- **Lifeliner System**: 3 makeup days allowed per user

### Salah Entry System
- **5 Daily Prayers**: Track Fajr, Zuhr, Asr, Maghrib, and Isha
- **Entry Options**:
  - **Jamat**: Prayed with congregation
  - **No Jamat**: Prayed alone
  - **Qaza**: Makeup prayer (requires comment)

### Challenge Rules
- **2 Jamat Misses**: If user misses Jamat for 2+ prayers, streak resets to previous checkpoint
- **Makeup Prayers**: Qaza entries require mandatory comment explaining why
- **Lifelines**: Users get 3 lifelines (makeup days) to use strategically

### Leaderboard
- **Live Rankings**: See how you rank against other participants
- **Progress Display**: Visual representation of each participant's progress
- **Status Indicators**: Track who is active, on track, or completed
- **Top 5 Prize**: Winners of the challenge get a special trip

### User Interface
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Clean Layout**: Intuitive navigation and user experience
- **Real-time Updates**: Instant feedback for user actions
- **Progress Visualization**: Charts and progress bars

## Technical Stack

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Modern responsive design with CSS Grid and Flexbox
- **JavaScript (ES6+)**: Dynamic functionality and state management

### Data Storage
- **LocalStorage**: Client-side data persistence (demo version)
- Can be integrated with backend database (Firebase, MongoDB, etc.)

## File Structure

```
├── index.html          # Main HTML file with all pages
├── styles.css          # Complete styling
├── app.js             # JavaScript application logic
└── README.md          # Documentation
```

## How to Use

### For Users
1. **Register**: Click "Get Started" and fill in your details
2. **Wait for Approval**: Admin will approve your account
3. **Submit Entries**: Once approved, log in and submit daily Salah entries
4. **Track Progress**: View your streak, history, and ranking
5. **Use Lifelines**: If needed, use your 3 lifeliner days

### For Admins
1. Open browser console (F12 or Right-click → Inspect → Console)
2. Use the command: `approveUser('user_id')`
3. User will be approved and can now submit entries
4. Check `appState.challengeData.users` to see all users

## Testing

### Demo Account
1. Register with any email and password
2. In console, get the user ID: `appState.challengeData.users[0].id`
3. Approve the user: `approveUser('user_id')`
4. Refresh and log in again
5. Start submitting Salah entries

## Admin Commands (Console)

```javascript
// Approve a user
approveUser('user_id')

// View all data
appState.challengeData

// View current user
appState.currentUser

// View all users
appState.challengeData.users

// View all entries
appState.challengeData.entries
```

## Future Enhancements

- **Backend Integration**: Connect to a real database
- **Email Notifications**: Send daily reminders and progress updates
- **Admin Panel**: Dedicated interface for admin approvals
- **Analytics**: Detailed statistics and charts
- **Social Features**: Share progress on social media
- **Mobile App**: Native mobile application
- **Quranic Integration**: Daily Quran verses with progress
- **Community Features**: Discussion forum for participants

## Deployment

### GitHub Pages
1. Push to GitHub
2. Go to Settings → Pages
3. Select main branch as source
4. Your site will be available at: https://username.github.io/40-din-namaz-challenge

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License
MIT License - Feel free to use and modify

## Contact
For questions or support, please open an issue on GitHub.

---

**Note**: This is a demo version using localStorage. For production, integrate with a backend API for persistent data storage and security.
