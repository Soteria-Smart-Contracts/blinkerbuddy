const plots = document.querySelectorAll('.plot');
let treeStates = [];
let highScore = 0;
let isBlinking = false;
let plantedTreesCount = 0;
let totalBlinkersToday = 0;

// Web Audio API setup
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        getAudioContext();
    }
});

function playBeep(frequency = 523.25, duration = 100, volume = 0.3) {
    const context = getAudioContext();
    if (!context) return; // AudioContext not supported or failed to initialize

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine'; // sine wave is a simple beep
    oscillator.frequency.setValueAtTime(frequency, context.currentTime); // value in hertz

    gainNode.gain.setValueAtTime(volume, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + duration / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration / 1000);
}

function playGnomeMelody() {
    const context = getAudioContext();
    if (!context) return;

    // Melodic sequence with smoother transitions and longer durations
    const notes = [
        { freq: 261.63, duration: 150, delay: 0 },    // C4
        { freq: 293.66, duration: 150, delay: 150 },  // D4
        { freq: 329.63, duration: 150, delay: 300 },  // E4
        { freq: 349.23, duration: 150, delay: 450 },  // F4
        { freq: 392.00, duration: 200, delay: 600 },  // G4
        { freq: 440.00, duration: 200, delay: 800 },  // A4
        { freq: 493.88, duration: 200, delay: 1000 }, // B4
        { freq: 523.25, duration: 250, delay: 1200 }, // C5
        { freq: 493.88, duration: 200, delay: 1450 }, // B4
        { freq: 440.00, duration: 200, delay: 1650 }, // A4
        { freq: 392.00, duration: 200, delay: 1850 }, // G4
        { freq: 349.23, duration: 150, delay: 2050 }, // F4
        { freq: 329.63, duration: 150, delay: 2200 }, // E4
        { freq: 293.66, duration: 150, delay: 2350 }, // D4
        { freq: 261.63, duration: 150, delay: 2500 }  // C4
    ];

    // Play the melody twice in the same period of time
    notes.forEach(note => {
        setTimeout(() => playBeep(note.freq, note.duration, 1), note.delay); // First sequence
        setTimeout(() => playBeep(note.freq, note.duration, 1), note.delay + 2500); // Second sequence starts halfway through the first
    });
}

let sirenOscillator = null;
let sirenGainNode = null; // Keep track of the gain node for the siren
let sirenSweepInterval = null;

function playSirenSound(duration = 2000) {
    const context = getAudioContext();
    if (!context) return;

    stopSirenSound(); // Clear any existing siren

    sirenOscillator = context.createOscillator();
    sirenGainNode = context.createGain(); // Use the dedicated sirenGainNode

    sirenOscillator.type = 'sine'; // Using sine for a smoother sweep, can change to 'sawtooth' or 'square'
    sirenGainNode.gain.setValueAtTime(0.15, context.currentTime); // Siren volume (a bit lower)

    sirenOscillator.connect(sirenGainNode);
    sirenGainNode.connect(context.destination);

    const baseFreq = 600;
    const peakFreq = 1000;
    const sweepDurationSeconds = 0.2; // How long one full up-down sweep takes

    sirenOscillator.frequency.setValueAtTime(baseFreq, context.currentTime);
    sirenOscillator.start(context.currentTime);

    let cycles = 0;
    const totalCycles = duration / (sweepDurationSeconds * 1000);

    function performSweep(startTime) {
        sirenOscillator.frequency.linearRampToValueAtTime(peakFreq, startTime + sweepDurationSeconds / 2);
        sirenOscillator.frequency.linearRampToValueAtTime(baseFreq, startTime + sweepDurationSeconds);
    }

    performSweep(context.currentTime); // Initial sweep
    playBlinkAlertSound();
    sirenSweepInterval = setInterval(() => {
        cycles++;
        if (cycles >= totalCycles) {
            stopSirenSound();
        } else {
            performSweep(context.currentTime);
        }
    }, sweepDurationSeconds * 1000);


    // Backup stop based on total duration
    setTimeout(stopSirenSound, duration);
}

async function playBlinkAlertSound() {
    const context = getAudioContext();
    if (!context) return;

    try {
        const response = await fetch('images/blinkalert.mp3');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);

        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);
        source.start();
    } catch (error) {
        console.error('Error playing blink alert sound:', error);
    }
}

function stopSirenSound() {
    if (sirenSweepInterval) {
        clearInterval(sirenSweepInterval);
        sirenSweepInterval = null;
    }
    if (sirenOscillator) {
        const context = getAudioContext();
        if (context && sirenGainNode) {
            // Fade out gain to prevent click
            sirenGainNode.gain.setValueAtTime(sirenGainNode.gain.value, context.currentTime);
            sirenGainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.05);
            setTimeout(() => {
                if (sirenOscillator) {
                    sirenOscillator.stop(context.currentTime + 0.05);
                    sirenOscillator.disconnect();
                    sirenOscillator = null;
                }
                if (sirenGainNode) {
                    sirenGainNode.disconnect(); // Disconnect the gain node too
                    sirenGainNode = null;
                }
            }, 55); // Ensure this runs after gain ramp
        } else if (sirenOscillator) { // Fallback if context or gainNode somehow lost
            sirenOscillator.stop();
            sirenOscillator.disconnect();
            sirenOscillator = null;
        }
        if (sirenGainNode && !context) { // If only gainNode exists without context, try to disconnect
             sirenGainNode.disconnect();
             sirenGainNode = null;
        }
    }
}

// Load saved states from storage
treeStates = []; // Initialize as empty array

document.addEventListener('DOMContentLoaded', () => {
    // Load state from localStorage
    loadState();
    checknewday();
});

function loadState() {
    const storedTreeStates = localStorage.getItem('treeStates');
    if (storedTreeStates) {
        try {
            treeStates = JSON.parse(storedTreeStates);
        } catch (e) {
            treeStates = [];
        }
    }

    // Ensure treeStates is an array
    if (!Array.isArray(treeStates)) {
        treeStates = [];
    }

    const storedBlinkers = localStorage.getItem('totalBlinkersToday');
    if (storedBlinkers) {
        totalBlinkersToday = parseInt(storedBlinkers) || 0;
    }

    const storedHighScore = localStorage.getItem('highScore');
    if (storedHighScore) {
        highScore = parseInt(storedHighScore) || 0;
    }

    updatePlots();
    updateBlinkStats();
}

function saveState() {
    localStorage.setItem('treeStates', JSON.stringify(treeStates));
    localStorage.setItem('totalBlinkersToday', totalBlinkersToday);
    localStorage.setItem('highScore', highScore);
}

// Reset daily blink count at midnight
function checknewday() {
    //see if the current date is different from the last saved date, if there is no saved date, or if the last saved date is more than 24 hours ago
    // then reset the daily blink count
    const now = new Date();
    const lastResetDate = localStorage.getItem('lastResetDate');

    if (!lastResetDate || new Date(lastResetDate).toDateString() !== now.toDateString()) {
        totalBlinkersToday = 0;
        localStorage.setItem('totalBlinkersToday', totalBlinkersToday);
        localStorage.setItem('lastResetDate', now.toISOString());
        console.log('Daily blink count reset!');
        updateBlinkStats();
    }
    else {
        console.log('Daily blink count already reset for today.');
    }
}

// Update the plots to reflect the current state of trees
function updatePlots() {
    // Ensure treeStates is always an array
    if (!Array.isArray(treeStates)) {
        treeStates = [];
    }
    
    plantedTreesCount = 0; // Reset plantedTreesCount
    
    // Clear all plots
    plots.forEach(plot => {
        plot.classList.remove('active');
        plot.innerHTML = '';
    });
    
    treeStates.forEach((index, arrayIndex) => {
        const plotIndex = parseInt(index);
        if (isNaN(plotIndex) || plotIndex < 0 || plotIndex >= plots.length) {
            return;
        }
        
        const plotElement = plots[plotIndex];
        if (plotElement) {
            plotElement.classList.add('active');
            plotElement.innerHTML = '<div class="timer countdown">Planted!</div>';
            plotElement.querySelector('.timer').style.fontSize = '16px';
            plotElement.querySelector('.timer').style.color = 'cyan';
        }
    });
}

function updateBlinkStats() {
    document.getElementById('blink-count').textContent = totalBlinkersToday;
    document.getElementById('high-score').textContent = highScore;
}


// Start the countdown overlay
function startCountdown(plot, index) {
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    //at this point, the countdown text may have been made smaller so we need to reset it to its original size and all class properties
    text.style.fontSize = '48px';
    text.style.fontWeight = 'bold';
    text.style.textAlign = 'center';
    text.style.marginTop = '10px';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    text.style.color = 'white';
    let values = ['Ready', 'Set', 'Go'];
    let i = 0;

    overlay.style.display = 'flex';
    text.textContent = '';

    // Ensure AudioContext is initialized by user gesture (click)
    getAudioContext();

    const interval = setInterval(() => {
        if (i < values.length) {
            text.textContent = values[i];
            // Play beep for "Go" (which corresponds to "1" if we map Ready, Set, Go to 3, 2, 1)
            // For a 3, 2, 1 countdown, we'd need to adjust the `values` array or logic here.
            // Assuming "Go" is the last step before timer starts.
            if (values[i] === 'Go') { // Final tone, louder and higher pitch
                playBeep(2000, 400, 1); // High pitch for 'Go' with increased volume
            } else { // Same tone for 'Ready' and 'Set'
                playBeep(500, 200, 0.5); // Medium pitch for 'Ready' and 'Set' with moderate volume
            }
            i++;
        } else {
            clearInterval(interval);
            overlay.style.display = 'none';
            startTimer(plot, index);
        }
    }, 1000);
}

// Start the timer for planting a tree
function startTimer(plot, index) {
    let startTime = Date.now();
    let soundplayed2sec;
    let soundplayed1sec;
    let soundplayed0sec
    let interval = setInterval(() => {
        let elapsed = (Date.now() - startTime) / 1000;
        let timerElement = plot.querySelector('.timer');
        if (!timerElement) {
            timerElement = document.createElement('div');
            timerElement.className = 'timer countdown';
            plot.appendChild(timerElement);
        }
        let remainingTime = 8 - Math.floor(elapsed);

        if (remainingTime <= 2) {
            timerElement.style.color = (Math.floor(elapsed) % 2 === 0) ? 'red' : 'white';
        } else {
            timerElement.style.color = 'white';
        }

        timerElement.style.fontSize = `${24 + (elapsed * 4)}px`;
        timerElement.textContent = `${remainingTime}s`;

        if (remainingTime === 2 && !soundplayed2sec) {
            playBeep(500, 200, 0.5); // Medium pitch for 'Ready' and 'Set'
            soundplayed2sec = true;
        }
        if (remainingTime === 1 && !soundplayed1sec) {
            playBeep(500, 200, 0.5); // Medium pitch for 'Ready' and 'Set'
            soundplayed1sec = true;
        }
        if (remainingTime === 0 && !soundplayed0sec) {
            playBeep(2000, 400, 1); // High pitch for 'Go' with increased volume
            soundplayed0sec = true;
        }

        if (elapsed >= 8) {
            clearInterval(interval);
            playBeep(1500, 150); // Highest beep at the moment of planting
            plot.classList.add('active');
            
            // Update local state
            treeStates.push(index);
            totalBlinkersToday++;

            if (totalBlinkersToday > highScore) {
                highScore = totalBlinkersToday;
            }
            
            saveState();
            updateBlinkStats();

            console.log('Tree planted locally!');
            timerElement.textContent = 'Planted!';
            timerElement.style.fontSize = '16px';
            startBlinkerAnimation(plot);
        }
    }, 100);
}

// Start the blinker animation
function startBlinkerAnimation(plot) {
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    overlay.style.display = 'flex';
    text.textContent = 'BLINKER';

    playSirenSound(2000); // Play siren for 2 seconds (10 flashes * 200ms)

    let i = 0;
    const blinkerInterval = setInterval(() => {
        if (i < 10) {
            overlay.style.backgroundColor = (i % 2 === 0) ? 'black' : 'white';
            text.style.color = (i % 2 === 0) ? 'white' : 'black';
            i++;
        } else {
            clearInterval(blinkerInterval);
            stopSirenSound(); // Stop the siren explicitly
            overlay.style.display = 'none';
            isBlinking = false;
            checkAllTreesFilled();

            // To safely access the plot's index if needed for tree death logic:
            const plotIndexForDeath = parseInt(plot.dataset.index); // Assuming plots have 'data-index'

            setTimeout(() => {
                // Get the plot index for the tree that should die after 2 hours
                const plotIndexForDeath = parseInt(plot.dataset.index);
                
                if (!isNaN(plotIndexForDeath)) {
                    // Remove from treeStates array
                    const treeToRemoveIndex = treeStates.indexOf(plotIndexForDeath);
                    if (treeToRemoveIndex !== -1) {
                        treeStates.splice(treeToRemoveIndex, 1);
                        saveState();
                        updatePlots(); // Update display after removal
                    } else {
                        // If it wasn't found in treeStates, just clear the plot visually
                        plot.classList.remove('active');
                        plot.innerHTML = '';
                    }
                } else {
                    plot.classList.remove('active');
                    plot.innerHTML = '';
                }
            }, 7200000); // 2 hours
        }
    }, 200);
}

// Check if all trees are filled and display gnome image
function checkAllTreesFilled() {
    if (treeStates.length === plots.length) {
        displayGnome();
        playGnomeMelody(); // Play melody when gnome is displayed
    }
}

// Display gnome image with a unique message
function displayGnome() {
    const overlay = document.getElementById('countdown-overlay');
    const text = document.getElementById('countdown-text');
    overlay.style.display = 'flex';
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.flexDirection = 'column';

    const img = document.createElement('img');
    img.src = 'images/gnome.jpg';
    img.style.width = '175px';
    img.style.height = 'auto';
    img.style.margin = '0 auto 10px';

    text.innerHTML = ''; // Clear existing text content
    text.style.color = 'white';
    text.style.textAlign = 'center';
    text.style.fontSize = '24px';
    text.style.fontWeight = 'bold';
    text.style.marginTop = '10px';
    text.appendChild(img); // Append the image inside the text container
    text.appendChild(document.createElement('br'));
    text.appendChild(document.createTextNode(getRandomGnomeMessage())); // Add the message below the image

    setTimeout(() => {
        overlay.style.display = 'none';
        text.innerHTML = ''; // Clear the text container content
    }, 10000); // Display for 10 seconds
}


// Get a random gnome message
function getRandomGnomeMessage() {
    const messages = [
        "Keep it up, Blinker Buddy! 🌟",
        "You're a true Blinker Champion! 🏆",
        "Blinking brilliance! Keep it going! 💫",
        "You're a Blinker Legend! 🌈",
        "Blinking your way to greatness! 🚀",
        "Blinker power! You're unstoppable! 💪",
        "Blinking for a brighter tomorrow! 🌞",
        "Your blinking skills are unmatched! 🥇",
        "Blinking with style and grace! 🎩",
        "You're the Blinker Master! 👑"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
}

// Event listeners for plots
plots.forEach((plot, index) => {
    // Add data-index attribute for proper identification
    plot.dataset.index = index;
    
    plot.addEventListener('click', () => {
        if (!isBlinking && !treeStates.includes(index)) {
            isBlinking = true;
            startCountdown(plot, index);
        }
    });
});

// Event listener for reset button
document.getElementById('reset-button').addEventListener('click', () => {
    treeStates = [];
    saveState();
    updatePlots();
});

// Event listener for reducing daily blinker count (easter egg/correction)
document.getElementById('blink-count').addEventListener('click', () => {
    if (totalBlinkersToday > 0) {
        totalBlinkersToday--;
        // Update high score if necessary (though decreasing shouldn't increase it,
        // we might be correcting a mistake so check if highScore should be adjusted?
        // Actually, if we reduce current count, high score should stay as max ever seen,
        // or if high score IS the current count, it should reduce too?
        // The original logic:
        // if (totalBlinkersToday > highScore) { highScore = totalBlinkersToday; }
        // Wait, if I decrease total, and total was high score, high score remains high.
        // But if I want to "undo" a blink, maybe I shouldn't touch high score unless it was just set?
        // For simplicity, let's just save.
        
        saveState();
        updateBlinkStats();
        console.log('Daily blink count reduced!');
    }
});
