const plots = document.querySelectorAll('.plot');
let treeStates = [];
let totalBlinkersToday = 0;
let highScore = 0;
let isBlinking = false;
let plantedTreesCount = 0;
let userId = localStorage.getItem('blinkerUID') || '';

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
//make consoel command to play this note only        { freq: 261.63, duration: 150, delay: 0 },    // C4
// command:
// playBeep(261.63, 150, 0.3); // Play C4 note for 150ms at volume 0.3

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
treeStates = JSON.parse(localStorage.getItem('treeStates')) || [];
totalBlinkersToday = parseInt(localStorage.getItem('totalBlinkersToday')) || 0;
highScore = parseInt(localStorage.getItem('highScore')) || 0;
updatePlots();
updateBlinkStats();
checknewday(); // Check if it's a new day to reset blink count

document.addEventListener('DOMContentLoaded', () => {
   //the sotrage is checked for an id at the start of the script, so we can use that instead, and then call /loadusername:id to fe
    const userId = localStorage.getItem('blinkerUID');
    const blinkStats = document.getElementById('blink-stats');
    const tooltip = document.getElementById('username-tooltip');

    if (username) {
        tooltip.textContent = username;
    } else {
        document.getElementById('username-modal').style.display = 'flex';
    }

    document.getElementById('username-submit').addEventListener('click', () => {
        const usernameInput = document.getElementById('username-input');
        const newUsername = usernameInput.value.trim();
        if (newUsername) {
            //register the new name by sending a get request to the server https://blinkerbuddy-wedergarten.replit.app/register:username
            fetch(`https://blinkerbuddy-wedergarten.replit.app/register:${newUsername}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(data => {
                console.log('Username registered:', data);
                //it will return a json containing the userId like so: {"username":"john123","id":"2307faa68da8836ec6264427e06d963b"}
                const responseData = JSON.parse(data);
                userId = responseData.id; // Store the userId
                localStorage.setItem('blinkerUID', userId);
                tooltip.textContent = newUsername;
            }).catch(error => {
                console.error('Error registering username:', error);
                alert('Error registering username. Please try again later.');
            });
            tooltip.textContent = newUsername;
            document.getElementById('username-modal').style.display = 'none';
        }
    });

    blinkStats.addEventListener('mouseover', () => {
        if (tooltip.textContent) {
            tooltip.style.visibility = 'visible';
            tooltip.style.opacity = '1';
        }
    });

    blinkStats.addEventListener('mouseout', () => {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    });
});

//fix the following console command for testing purposes
//chrome.storage.local.get([highScore])

//fixed command:
//chrome.storage.local.get(['highScore'], ({ highScore }) => console.log(highScore));

//now to set it to 31
//chrome.storage.local.set({ highScore: 31 }, () => console.log('High score set to 31'));

// Update the plots to reflect the current state of trees
function updatePlots() {
    plantedTreesCount = 0; // Reset plantedTreesCount
    // Clear all plots
    plots.forEach(plot => {
        plot.classList.remove('active');
        plot.innerHTML = '';
    });
    treeStates.forEach((index) => {
        const plotElement = plots[index];
        plotElement.classList.add('active');
        plotElement.innerHTML = '<div class="timer countdown">Planted!</div>';
        plotElement.querySelector('.timer').style.fontSize = '16px';
        plotElement.querySelector('.timer').style.color = 'cyan';

    });
    updateBlinkStats();
}

// Update the blink stats display
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
            treeStates.push(index);
            totalBlinkersToday++;
            if (totalBlinkersToday > highScore) {
                highScore = totalBlinkersToday;
            }
            localStorage.setItem('treeStates', JSON.stringify(treeStates));
            localStorage.setItem('totalBlinkersToday', totalBlinkersToday);
            localStorage.setItem('highScore', highScore);
            console.log('Tree planted!');
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
            updateBlinkStats();
            checkAllTreesFilled();
            // The following setTimeout seems to be for tree death, not directly related to plot argument.
            // If 'index' is needed here, it must be passed to startBlinkerAnimation.
            // For now, assuming this part of the logic regarding 'index' is handled correctly elsewhere or is a potential bug.
            // If treeStates is an array of plot indices, then treeStates[index] would be wrong if index is not a direct plot index.
            // Let's assume 'plot' has a data-index or similar if we need to find which tree to mark dead.
            // However, the original code used 'index' which was not defined in startBlinkerAnimation's scope.
            // This was a pre-existing potential issue.

            // To safely access the plot's index if needed for tree death logic:
            const plotIndexForDeath = parseInt(plot.dataset.index); // Assuming plots have 'data-index'

            setTimeout(() => {
                // Find the tree in treeStates that corresponds to plotIndexForDeath to mark it dead
                // This logic assumes treeStates stores indices that match plot.dataset.index
                const treeStateIndexToRemove = treeStates.indexOf(plotIndexForDeath);
                if (treeStateIndexToRemove > -1) {
                    // Marking as 'dead' isn't a current property. We remove it or mark it.
                    // For now, let's stick to removing it as per original reset logic.
                    // Or, if 'dead' was a new concept, it needs to be defined in how treeStates are handled.
                    // The original code had 'treeStates[index].dead = true;' which implies treeStates stores objects,
                    // but it actually stores indices. This line was likely non-functional as intended.
                    // I will revert to a simpler logic of removing the tree or assume 'index' was a bug.
                    // Given the original code, 'index' was not passed to startBlinkerAnimation.
                    // The simplest interpretation is that the timeout was meant to clear the specific plot that just blinked.

                    // If the intention is to remove the tree that just blinked:
                    const treeToRemoveIndex = treeStates.indexOf(plotIndexForDeath);
                    if (treeToRemoveIndex !== -1) {
                        treeStates.splice(treeToRemoveIndex, 1); // Remove the tree
                    localStorage.setItem('treeStates', JSON.stringify(treeStates));
                    console.log(`Tree at plot ${plotIndexForDeath} removed after timeout.`);
                    updatePlots(); // Update display after removal
                    } else {
                         // If it was already removed or not found, just clear the plot visually if it wasn't.
                        plot.classList.remove('active');
                        plot.innerHTML = '';
                    }
                } else {
                     plot.classList.remove('active');
                     plot.innerHTML = '';
                }
                // plantedTreesCount should also be decremented if a tree is removed.
                // This was also missing in the original logic for the 'dead' tree.
                // updatePlots() will recount plantedTreesCount if it's based on treeStates.length

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
    updateBlinkStats();
}

// Event listeners for plots
plots.forEach((plot, index) => {
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
    localStorage.setItem('treeStates', JSON.stringify(treeStates));
    console.log('Trees reset!');
    updatePlots();
});

// Event listener for reducing daily blinker count
document.getElementById('blink-count').addEventListener('click', () => {
    if (totalBlinkersToday > 0) {
        totalBlinkersToday--;
        if (totalBlinkersToday > highScore) {
            highScore = totalBlinkersToday;
        }
        localStorage.setItem('totalBlinkersToday', totalBlinkersToday);
        localStorage.setItem('highScore', highScore);
        console.log('Daily blink count reduced!');
        updateBlinkStats();
    }
});

// localStorage.removeItem('bbUsername');
//conver this to browser extension eqivalent
// alert('Local storage cleared for testing purposes. Please refresh the page to start over.');