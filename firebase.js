import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    query,
    onSnapshot,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
apiKey: "AIzaSyCkTEeWRXFH2N6Ttw0_ioP-cqImZFVbq5Q",
authDomain: "fblatryouts.firebaseapp.com",
projectId: "fblatryouts",
storageBucket: "fblatryouts.firebasestorage.app",
messagingSenderId: "337219854324",
appId: "1:337219854324:web:799ebe988c8cf565a663a1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

window.currentUser = null;

onAuthStateChanged(auth, (user) => {
    window.currentUser = user;
    updateAuthUI(user);
    if (user) {
        document.getElementById('authModal').classList.remove('active');
        loadUserDashboard(user);
    }
});

function updateAuthUI(user) {
    const authLink = document.getElementById('authLink');
    if (user) {
        authLink.textContent = 'Dashboard';
    } else {
        authLink.textContent = 'Sign Up / Dashboard';
    }
}


function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => errorDiv.classList.remove('show'), 5000);
}

async function loadUserDashboard(user) {
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            const achievements = data.achievements || {};

            document.getElementById('userSquat').textContent = achievements.squat ? `${achievements.squat.weight} lbs` : '-';
            document.getElementById('userDeadlift').textContent = achievements.deadlift ? `${achievements.deadlift.weight} lbs` : '-';
            document.getElementById('userBench').textContent = achievements.benchpress ? `${achievements.benchpress.weight} lbs` : '-';

            updateRecordDisplay('squat', achievements.squat);
            updateRecordDisplay('deadlift', achievements.deadlift);
            updateRecordDisplay('benchpress', achievements.benchpress);
        } else {
            document.getElementById('userSquat').textContent = '-';
            document.getElementById('userDeadlift').textContent = '-';
            document.getElementById('userBench').textContent = '-';
            updateRecordDisplay('squat', null);
            updateRecordDisplay('deadlift', null);
            updateRecordDisplay('benchpress', null);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        if (error.code === 'unavailable') {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = 'Unable to load data. Please check your internet connection and make sure Firestore API is enabled.';
            errorDiv.classList.add('show');
            setTimeout(() => errorDiv.classList.remove('show'), 8000);
        }
    }
}

function updateRecordDisplay(exercise, achievement) {
    const statsId = exercise === 'benchpress' ? 'benchStats' : `${exercise}Stats`;
    const volumeId = exercise === 'benchpress' ? 'benchVolume' : `${exercise}Volume`;

    if (achievement) {
        const weight = achievement.weight || 0;
        const sets = achievement.sets || [];
        
        let totalReps = 0;
        let numSets = 0;
        
        if (Array.isArray(sets)) {
            totalReps = sets.reduce((sum, set) => sum + (set.reps || 0), 0);
            numSets = sets.length;
        } else if (typeof sets === 'number') {
            numSets = sets;
            totalReps = achievement.totalReps || sets;
        }
        
        const totalVolume = weight * totalReps;
        
        document.getElementById(statsId).textContent = 
            `${weight} lbs × ${totalReps} reps (${numSets} sets)`;
        document.getElementById(volumeId).textContent = 
            `${totalVolume.toLocaleString()} lbs total`;
    } else {
        document.getElementById(statsId).textContent = 'Not logged';
        document.getElementById(volumeId).textContent = '-';
    }
}

async function saveAchievement(user, exercise, weight, sets) {
    const totalReps = sets.reduce((sum, set) => sum + set.reps, 0);
    const totalVolume = weight * totalReps;
    const userDocRef = doc(db, 'users', user.uid);

    const achievementData = {
        weight: weight,
        sets: sets,
        totalReps: totalReps,
        totalVolume: totalVolume,
        timestamp: serverTimestamp()
    };

    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
        const currentData = userDoc.data();
        const currentAchievements = currentData.achievements || {};
        
        if (!currentAchievements[exercise] || totalVolume > (currentAchievements[exercise].totalVolume || 0)) {
            currentAchievements[exercise] = achievementData;
            
            await setDoc(userDocRef, {
                displayName: user.displayName || user.email,
                email: user.email,
                achievements: currentAchievements
            }, { merge: true });
            
            return true;
        } else {
            return false;
        }
    } else {
        await setDoc(userDocRef, {
            displayName: user.displayName || user.email,
            email: user.email,
            achievements: {
                [exercise]: achievementData
            }
        });
        return true;
    }
}


function setupLeaderboardListeners() {
    const usersRef = collection(db, 'users');
    
    onSnapshot(usersRef, (snapshot) => {
        const allUsers = [];
        
        snapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.achievements) {
                allUsers.push({
                    userId: doc.id,
                    displayName: userData.displayName,
                    achievements: userData.achievements
                });
            }
        });

        const banner = document.getElementById('globalErrorBanner');
        if (banner) {
            banner.classList.remove('show');
        }

        updateLeaderboardFromFirestore(allUsers);
        updateStatsFromFirestore(allUsers);
    }, (error) => {
        console.error('Firestore listener error:', error);
        
        if (error.code === 'permission-denied' || error.code === 'unavailable') {
            const banner = document.getElementById('globalErrorBanner');
            if (banner) {
                const projectId = firebaseConfig.projectId || 'your-project';
                banner.innerHTML = `
                    <p>WARNING: Firestore API is not enabled. <a href="https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${projectId}" target="_blank">Click here to enable it</a> then refresh the page.</p>
                    <button class="banner-close" onclick="document.getElementById('globalErrorBanner').classList.remove('show')">&times;</button>
                `;
                banner.classList.add('show');
            }
        }
    });
}

function updateLeaderboardFromFirestore(users) {
    window.firestoreUsers = users;
    
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const exercise = activeTab.textContent.toLowerCase().replace(' ', '');
        displayLeaderboardForExercise(exercise, users);
    }
}

function displayLeaderboardForExercise(exercise, users) {
    const tbody = document.getElementById('leaderboardBody');
    let data = [];

    if (exercise === 'overall') {
        users.forEach(user => {
            let totalVolume = 0;
            let totalReps = 0;
            let maxWeight = 0;

            ['squat', 'deadlift', 'benchpress'].forEach(ex => {
                if (user.achievements[ex]) {
                    const ach = user.achievements[ex];
                    const weight = ach.weight || 0;
                    const sets = ach.sets || [];
                    
                    let reps = 0;
                    if (Array.isArray(sets)) {
                        reps = sets.reduce((sum, set) => sum + (set.reps || 0), 0);
                    } else if (typeof sets === 'number') {
                        reps = ach.totalReps || sets;
                    }
                    
                    totalVolume += weight * reps;
                    totalReps += reps;
                    if (weight > maxWeight) maxWeight = weight;
                }
            });

            if (totalVolume > 0) {
                data.push({
                    name: user.displayName,
                    weight: maxWeight,
                    totalReps: totalReps,
                    totalVolume: totalVolume
                });
            }
        });
    } else {
        const exerciseKey = exercise === 'benchpress' ? 'benchpress' : exercise;
        
        users.forEach(user => {
            if (user.achievements[exerciseKey]) {
                const ach = user.achievements[exerciseKey];
                const weight = ach.weight || 0;
                const sets = ach.sets || [];
                
                let totalReps = 0;
                if (Array.isArray(sets)) {
                    totalReps = sets.reduce((sum, set) => sum + (set.reps || 0), 0);
                } else if (typeof sets === 'number') {
                    totalReps = ach.totalReps || sets;
                }
                
                const totalVolume = weight * totalReps;
                
                data.push({
                    name: user.displayName,
                    weight: weight,
                    totalReps: totalReps,
                    totalVolume: totalVolume
                });
            }
        });
    }

    data.sort((a, b) => b.totalVolume - a.totalVolume);

    tbody.innerHTML = '';
    data.forEach((item, index) => {
        const row = document.createElement('tr');
        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank';
        
        row.innerHTML = `
            <td><span class="${rankClass}">${index + 1}</span></td>
            <td>${item.name}</td>
            <td>${item.weight} lbs</td>
            <td>${item.totalReps}</td>
            <td class="total-weight">${(item.totalVolume || 0).toLocaleString()} lbs</td>
        `;
        tbody.appendChild(row);
    });

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #888888; padding: 3rem;">No achievements logged yet. Be the first!</td></tr>';
    }
}

window.displayLeaderboardForExercise = displayLeaderboardForExercise;

function updateStatsFromFirestore(users) {
    const totalParticipants = users.length;
    document.getElementById('totalParticipants').textContent = totalParticipants;

    let totalVolume = 0;
    const exerciseCounts = { squat: 0, deadlift: 0, benchpress: 0 };
    const exerciseVolumes = { squat: 0, deadlift: 0, benchpress: 0 };

    users.forEach(user => {
        ['squat', 'deadlift', 'benchpress'].forEach(exercise => {
            if (user.achievements[exercise]) {
                const ach = user.achievements[exercise];
                const weight = ach.weight || 0;
                const sets = ach.sets || [];
                
                let reps = 0;
                if (Array.isArray(sets)) {
                    reps = sets.reduce((sum, set) => sum + (set.reps || 0), 0);
                } else if (typeof sets === 'number') {
                    reps = ach.totalReps || sets;
                }
                
                const volume = weight * reps;
                
                totalVolume += volume;
                exerciseCounts[exercise]++;
                exerciseVolumes[exercise] += volume;
            }
        });
    });

    document.getElementById('totalVolume').textContent = totalVolume.toLocaleString();

    updateChartsFromData(exerciseCounts, exerciseVolumes);
}

function updateChartsFromData(exerciseCounts, exerciseVolumes) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not loaded yet, skipping chart update');
        return;
    }

    try {
        const ctx1 = document.getElementById('participationChart');
        if (!ctx1) {
            console.warn('participationChart canvas not found');
            return;
        }

        if (window.participationChart && typeof window.participationChart.destroy === 'function') {
            window.participationChart.destroy();
        }
        
        window.participationChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['Squat', 'Deadlift', 'Bench Press'],
                datasets: [{
                    label: 'Participants',
                    data: [exerciseCounts.squat, exerciseCounts.deadlift, exerciseCounts.benchpress],
                    backgroundColor: ['#e63946', '#f77f00', '#06ffa5'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#999' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#999' },
                        grid: { display: false }
                    }
                }
            }
        });

        const ctx2 = document.getElementById('exerciseChart');
        if (!ctx2) {
            console.warn('exerciseChart canvas not found');
            return;
        }

        if (window.exerciseChart && typeof window.exerciseChart.destroy === 'function') {
            window.exerciseChart.destroy();
        }

        window.exerciseChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Squat', 'Deadlift', 'Bench Press'],
                datasets: [{
                    data: [exerciseVolumes.squat, exerciseVolumes.deadlift, exerciseVolumes.benchpress],
                    backgroundColor: ['#e63946', '#f77f00', '#06ffa5'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#999', padding: 15 }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}


const authModal = document.getElementById('authModal');
const dashboardModal = document.getElementById('dashboardModal');
const authLink = document.getElementById('authLink');
const closeModal = document.getElementById('closeModal');
const closeDashboard = document.getElementById('closeDashboard');
const logoutBtn = document.getElementById('logoutBtn');

authLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.currentUser) {
        dashboardModal.classList.add('active');
        loadUserDashboard(window.currentUser);
        setTimeout(() => {
            if (window.initializeCamera) {
                window.initializeCamera();
            }
        }, 300);
    } else {
        authModal.classList.add('active');
    }
});

closeModal.addEventListener('click', () => {
    authModal.classList.remove('active');
});

closeDashboard.addEventListener('click', () => {
    dashboardModal.classList.remove('active');
    if (window.stopCamera) {
        window.stopCamera();
    }
});

authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
        authModal.classList.remove('active');
    }
});

dashboardModal.addEventListener('click', (e) => {
    if (e.target === dashboardModal) {
        dashboardModal.classList.remove('active');
        if (window.stopCamera) {
            window.stopCamera();
        }
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        dashboardModal.classList.remove('active');
        alert('Signed out successfully!');
    } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out: ' + error.message);
    }
});

document.getElementById('dashboardAchievementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!window.currentUser) {
        alert('Please sign in to log achievements');
        return;
    }

    const exercise = document.getElementById('dashboardExercise').value;
    const weight = parseFloat(document.getElementById('dashboardWeight').value);
    
    const repsInputs = document.querySelectorAll('.manual-reps-input');
    const sets = [];
    repsInputs.forEach((input, index) => {
        const reps = parseInt(input.value);
        if (reps > 0) {
            sets.push({ setNumber: index + 1, reps: reps });
        }
    });

    if (sets.length === 0) {
        alert('Please add at least one set with reps');
        return;
    }

    const btn = e.target.querySelector('.auth-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const isNewRecord = await saveAchievement(window.currentUser, exercise, weight, sets);
        
        const successMsg = document.getElementById('successMessageDashboard');
        if (isNewRecord) {
            successMsg.textContent = 'New record saved successfully! ';
        } else {
            successMsg.textContent = 'Achievement logged (not a new record)';
        }
        successMsg.classList.add('show');
        setTimeout(() => successMsg.classList.remove('show'), 3000);

        e.target.reset();
        resetManualSets();

        await loadUserDashboard(window.currentUser);
    } catch (error) {
        console.error('Error saving achievement:', error);
        alert('Failed to save achievement: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Achievement';
    }
});

document.getElementById('saveCameraAchievement').addEventListener('click', async () => {
    if (!window.currentUser) {
        alert('Please sign in to log achievements');
        return;
    }

    const sets = window.cameraExerciseData.getSets();
    const weight = parseFloat(document.getElementById('cameraWeight').value);
    
    if (!weight || weight <= 0) {
        alert('Please enter the weight you lifted');
        return;
    }

    if (sets.length === 0) {
        alert('No sets logged yet. Perform the exercise first!');
        return;
    }

    const btn = document.getElementById('saveCameraAchievement');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const exerciseMap = {
            'squat': 'squat',
            'bench': 'benchpress',
            'deadlift': 'deadlift'
        };
        
        const exercise = exerciseMap[window.cameraExerciseData.getCurrentExercise()];
        const isNewRecord = await saveAchievement(window.currentUser, exercise, weight, sets);
        
        const successMsg = document.getElementById('successMessageDashboard');
        if (isNewRecord) {
            successMsg.textContent = 'New record saved successfully! ';
        } else {
            successMsg.textContent = 'Achievement logged (not a new record)';
        }
        successMsg.classList.add('show');
        setTimeout(() => successMsg.classList.remove('show'), 3000);

        window.cameraExerciseData.reset();
        document.getElementById('cameraWeight').value = '';

        await loadUserDashboard(window.currentUser);
    } catch (error) {
        console.error('Error saving camera achievement:', error);
        alert('Failed to save achievement: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Achievement';
    }
});

document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.remove('active');
        });
        document.getElementById(`${tabName}Form`).classList.add('active');

        document.getElementById('errorMessage').classList.remove('show');
    });
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const displayName = document.getElementById('signupName').value;
    const btn = e.target.querySelector('.auth-btn');

    btn.disabled = true;
    btn.textContent = 'Creating Account...';

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: displayName });
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            displayName: displayName,
            email: email,
            achievements: {},
            createdAt: serverTimestamp()
        });
        
        authModal.classList.remove('active');
        e.target.reset();
    } catch (error) {
        console.error('Sign up error:', error);
        let errorMessage = 'Failed to create account. ';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage += 'This email is already registered.';
                break;
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            case 'auth/weak-password':
                errorMessage += 'Password should be at least 6 characters.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showError(errorMessage);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('.auth-btn');

    btn.disabled = true;
    btn.textContent = 'Signing In...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        authModal.classList.remove('active');
        e.target.reset();
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Failed to sign in. ';
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage += 'Invalid email or password.';
                break;
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage += 'Too many attempts. Please try again later.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showError(errorMessage);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});

document.getElementById('googleSignIn').addEventListener('click', async () => {
    const btn = document.getElementById('googleSignIn');
    btn.disabled = true;
    
    try {
        const result = await signInWithPopup(auth, googleProvider);
        
        const userDocRef = doc(db, 'users', result.user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                displayName: result.user.displayName || result.user.email,
                email: result.user.email,
                achievements: {},
                createdAt: serverTimestamp()
            });
        }
        
        authModal.classList.remove('active');
    } catch (error) {
        console.error('Google sign in error:', error);
        let errorMessage = 'Failed to sign in with Google. ';
        
        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage += 'Sign in cancelled.';
                break;
            case 'auth/popup-blocked':
                errorMessage += 'Please allow popups for this site.';
                break;
            default:
                errorMessage += error.message;
        }
        
        showError(errorMessage);
    } finally {
        btn.disabled = false;
    }
});

window.firebaseSignOut = async () => {
    try {
        await signOut(auth);
        alert('Signed out successfully!');
    } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out: ' + error.message);
    }
};

function resetManualSets() {
    const container = document.getElementById('manualSetsContainer');
    container.innerHTML = `
        <div class="manual-set-row">
            <span class="set-number">Set 1:</span>
            <input type="number" class="manual-reps-input" placeholder="Reps" min="1" required>
            <button type="button" class="remove-set-btn" onclick="removeManualSet(this)">×</button>
        </div>
    `;
    updateManualTotal();
}

document.getElementById('addManualSet').addEventListener('click', () => {
    const container = document.getElementById('manualSetsContainer');
    const setNumber = container.children.length + 1;
    
    const setRow = document.createElement('div');
    setRow.className = 'manual-set-row';
    setRow.innerHTML = `
        <span class="set-number">Set ${setNumber}:</span>
        <input type="number" class="manual-reps-input" placeholder="Reps" min="1" required>
        <button type="button" class="remove-set-btn" onclick="removeManualSet(this)">×</button>
    `;
    
    container.appendChild(setRow);
    
    setRow.querySelector('.manual-reps-input').addEventListener('input', updateManualTotal);
});

window.removeManualSet = function(button) {
    const container = document.getElementById('manualSetsContainer');
    if (container.children.length > 1) {
        button.parentElement.remove();
        
        Array.from(container.children).forEach((row, index) => {
            row.querySelector('.set-number').textContent = `Set ${index + 1}:`;
        });
        
        updateManualTotal();
    }
};

function updateManualTotal() {
    const inputs = document.querySelectorAll('.manual-reps-input');
    let total = 0;
    inputs.forEach(input => {
        const value = parseInt(input.value) || 0;
        total += value;
    });
    document.getElementById('manualTotalReps').textContent = total;
}

document.addEventListener('input', (e) => {
    if (e.target.classList.contains('manual-reps-input')) {
        updateManualTotal();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => setupLeaderboardListeners(), 100);
    });
} else {
    setTimeout(() => setupLeaderboardListeners(), 100);
}