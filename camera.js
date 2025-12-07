import { PoseLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

let poseLandmarker;
let handLandmarker;
let webcamRunning = false;
let lastVideoTime = -1;

let video = document.getElementById('cameraWebcam');
let canvas = document.getElementById('cameraCanvas');
let ctx;

let currentCameraExercise = 'squat';
let cameraCount = 0;
let currentSets = 1;
let isDown = false;
let currentAngle = 0;
let repDetected = false;
let repDetectedTime = 0;
let lastRepTime = 0;

let palmRaised = false;
let lastPalmTime = 0;
const PALM_COOLDOWN = 2000;

let angleHistory = [];
const SMOOTHING_WINDOW = 5;

const SQUAT_KNEE_DOWN = 95;
const SQUAT_KNEE_UP = 160;
const BENCH_ELBOW_DOWN = 65;
const BENCH_ELBOW_UP = 155;
const DEADLIFT_WRIST_DOWN = 0.15;
const DEADLIFT_WRIST_UP = 0.05;
const REP_COOLDOWN = 1000;

window.initializeCamera = async function() {
    if (webcamRunning) return;
    
    if (!ctx) {
        ctx = canvas.getContext('2d');
        const container = document.getElementById('cameraVideoContainer');
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    
    try {
        document.getElementById('cameraStatus').textContent = 'Loading AI model...';
        
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numPoses: 1
        });
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
        
        document.getElementById('cameraStatus').textContent = 'Starting camera...';
        
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        video.addEventListener('loadeddata', () => {
            webcamRunning = true;
            document.getElementById('cameraStatus').textContent = 'Ready! Raise palm for new set.';
            predictWebcam();
        });
    } catch (error) {
        console.error('Camera initialization error:', error);
        document.getElementById('cameraStatus').textContent = 'Error: ' + error.message;
    }
};

async function predictWebcam() {
    if (!webcamRunning) return;
    
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        
        try {
            const poseResults = await poseLandmarker.detectForVideo(video, startTimeMs);
            
            const handResults = await handLandmarker.detectForVideo(video, startTimeMs);
            
            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (poseResults.landmarks && poseResults.landmarks.length > 0) {
                const landmarks = poseResults.landmarks[0];
                drawSkeleton(landmarks);
                drawLandmarks(landmarks);
                countExercise(landmarks);
                drawDebug(landmarks);
            }
            
            if (handResults.landmarks && handResults.landmarks.length > 0) {
                detectPalmGesture(handResults.landmarks);
            }
            
            ctx.restore();
        } catch (error) {
            console.error('Detection error:', error);
        }
    }
    
    if (repDetected && Date.now() - repDetectedTime > 500) {
        repDetected = false;
    }
    
    window.requestAnimationFrame(predictWebcam);
}

function detectPalmGesture(handsLandmarks) {
    if (Date.now() - lastPalmTime < PALM_COOLDOWN) return;
    
    for (const handLandmarks of handsLandmarks) {
        const wrist = handLandmarks[0];
        const thumbTip = handLandmarks[4];
        const indexTip = handLandmarks[8];
        const middleTip = handLandmarks[12];
        const ringTip = handLandmarks[16];
        const pinkyTip = handLandmarks[20];
        
        const fingersUp = 
            indexTip.y < wrist.y &&
            middleTip.y < wrist.y &&
            ringTip.y < wrist.y &&
            pinkyTip.y < wrist.y &&
            thumbTip.y < wrist.y;
        
        if (fingersUp && !palmRaised) {
            palmRaised = true;
            lastPalmTime = Date.now();
            
            currentSets++;
            cameraCount = 0;
            updateCameraCount();
            updateSetsDisplay();
            
            document.getElementById('cameraStatus').textContent = 'SET ' + currentSets + ' STARTED! Reps reset.';
            setTimeout(() => {
                document.getElementById('cameraStatus').textContent = 'Ready! Raise palm for new set.';
            }, 2000);
            
            console.log('Palm detected! Set incremented to:', currentSets);
        } else if (!fingersUp) {
            palmRaised = false;
        }
    }
}

function updateSetsDisplay() {
    document.getElementById('cameraSets').value = currentSets;
}

function drawLandmarks(landmarks) {
    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        
        ctx.fillStyle = repDetected ? '#00FF00' : '#FFFF00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
}

function drawSkeleton(landmarks) {
    const connections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
        [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
        [24, 26], [26, 28]
    ];
    
    ctx.strokeStyle = repDetected ? '#00FF00' : '#00FFFF';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        if (startPoint && endPoint) {
            ctx.beginPath();
            ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
            ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
            ctx.stroke();
        }
    }
}

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
}

function smoothAngle(newAngle) {
    angleHistory.push(newAngle);
    if (angleHistory.length > SMOOTHING_WINDOW) {
        angleHistory.shift();
    }
    const sum = angleHistory.reduce((a, b) => a + b, 0);
    return sum / angleHistory.length;
}

function countExercise(landmarks) {
    if (currentCameraExercise === 'squat') {
        countSquat(landmarks);
    } else if (currentCameraExercise === 'bench') {
        countBenchPress(landmarks);
    } else if (currentCameraExercise === 'deadlift') {
        countDeadlift(landmarks);
    }
}

function countSquat(landmarks) {
    if (Date.now() - lastRepTime < REP_COOLDOWN) return;
    
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    
    if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) return;
    
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const smoothedAngle = smoothAngle(avgKneeAngle);
    currentAngle = smoothedAngle;
    
    if (smoothedAngle < SQUAT_KNEE_DOWN && !isDown) {
        isDown = true;
    } else if (smoothedAngle > SQUAT_KNEE_UP && isDown) {
        isDown = false;
        cameraCount++;
        updateCameraCount();
        repDetected = true;
        repDetectedTime = Date.now();
        lastRepTime = Date.now();
    }
}

function countBenchPress(landmarks) {
    if (Date.now() - lastRepTime < REP_COOLDOWN) return;
    
    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];
    
    if (!leftShoulder || !leftElbow || !leftWrist || !rightShoulder || !rightElbow || !rightWrist) return;
    
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
    const smoothedAngle = smoothAngle(avgElbowAngle);
    currentAngle = smoothedAngle;
    
    if (smoothedAngle < BENCH_ELBOW_DOWN && !isDown) {
        isDown = true;
    } else if (smoothedAngle > BENCH_ELBOW_UP && isDown) {
        isDown = false;
        cameraCount++;
        updateCameraCount();
        repDetected = true;
        repDetectedTime = Date.now();
        lastRepTime = Date.now();
    }
}

function countDeadlift(landmarks) {
    if (Date.now() - lastRepTime < REP_COOLDOWN) return;
    
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    
    if (!leftWrist || !rightWrist || !leftHip || !rightHip) return;
    
    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const wristBelowHip = avgWristY - avgHipY;
    const smoothedDistance = smoothAngle(wristBelowHip * 100) / 100;
    currentAngle = smoothedDistance * 100;
    
    if (smoothedDistance > DEADLIFT_WRIST_DOWN && !isDown) {
        isDown = true;
    } else if (smoothedDistance < DEADLIFT_WRIST_UP && isDown) {
        isDown = false;
        cameraCount++;
        updateCameraCount();
        repDetected = true;
        repDetectedTime = Date.now();
        lastRepTime = Date.now();
    }
}


function updateCameraCount() {
    document.getElementById('cameraCount').textContent = cameraCount;
    document.getElementById('cameraRepsInput').value = cameraCount;
}

function drawDebug(landmarks) {
    const debugDiv = document.getElementById('cameraDebugInfo');
    let html = `
        <div style="color: white; font-size: 11px;">
            <strong>Angle:</strong> ${currentAngle.toFixed(1)}°<br>
            <strong>State:</strong> ${isDown ? 'DOWN' : 'UP'}<br>
            <strong>Reps:</strong> ${cameraCount}
        </div>
    `;
    
    if (landmarks.length < 20) {
        html += '<div style="color: red; font-weight: bold; margin-top: 3px; font-size: 10px;">STEP BACK - NEED FULL BODY</div>';
    }
    
    debugDiv.innerHTML = html;
}


document.getElementById('cameraSquatBtn').addEventListener('click', () => {
    currentCameraExercise = 'squat';
    isDown = false;
    lastRepTime = 0;
    angleHistory = [];
    document.getElementById('cameraExerciseLabel').textContent = 'SQUAT';
    document.querySelectorAll('.camera-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('cameraSquatBtn').classList.add('active');
});

document.getElementById('cameraBenchBtn').addEventListener('click', () => {
    currentCameraExercise = 'bench';
    isDown = false;
    lastRepTime = 0;
    angleHistory = [];
    document.getElementById('cameraExerciseLabel').textContent = 'BENCH PRESS';
    document.querySelectorAll('.camera-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('cameraBenchBtn').classList.add('active');
});

document.getElementById('cameraDeadliftBtn').addEventListener('click', () => {
    currentCameraExercise = 'deadlift';
    isDown = false;
    lastRepTime = 0;
    angleHistory = [];
    document.getElementById('cameraExerciseLabel').textContent = 'DEADLIFT';
    document.querySelectorAll('.camera-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('cameraDeadliftBtn').classList.add('active');
});

document.getElementById('cameraResetBtn').addEventListener('click', () => {
    cameraCount = 0;
    currentSets = 1;
    isDown = false;
    lastRepTime = 0;
    angleHistory = [];
    updateCameraCount();
    updateSetsDisplay();
});

document.querySelectorAll('.method-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const method = this.dataset.method;
        
        document.querySelectorAll('.method-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        document.querySelectorAll('.logging-content').forEach(content => {
            content.classList.remove('active');
        });
        
        if (method === 'camera') {
            document.getElementById('cameraLogging').classList.add('active');
            setTimeout(() => window.initializeCamera(), 100);
        } else {
            document.getElementById('manualLogging').classList.add('active');
        }
    });
});

window.cameraExerciseData = {
    getCurrentExercise: () => currentCameraExercise,
    getCount: () => cameraCount,
    reset: () => {
        cameraCount = 0;
        updateCameraCount();
    }
};

window.stopCamera = function() {
    if (video && video.srcObject) {
        const stream = video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
        webcamRunning = false;
    }
};