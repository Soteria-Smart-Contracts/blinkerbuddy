const plots = document.querySelectorAll('.plot');
let treeStates = [];
let totalBlinkersToday = 0;
let highScore = 0;
let isBlinking = false;
let plantedTreesCount = 0;

// Load saved states from storage
chrome.storage.local.get(['treeStates', 'totalBlinkersToday', 'highScore'], ({ treeStates: ts, totalBlinkersToday: tb, highScore: hs }) => {
    treeStates = ts || [];
    totalBlinkersToday = tb || 0;
    highScore = hs || 0;
    updatePlots();
    updateBlinkStats();
    checknewday(); // Check if it's a new day to reset blink count
});

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

    const interval = setInterval(() => {
        if (i < values.length) {
            text.textContent = values[i++];
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

        if (elapsed >= 8) {
            clearInterval(interval);
            plot.classList.add('active');
            treeStates.push(index);
            totalBlinkersToday++;
            if (totalBlinkersToday > highScore) {
                highScore = totalBlinkersToday;
            }
            chrome.storage.local.set({ treeStates, totalBlinkersToday, highScore }, () => {
                console.log('Tree planted!');
            });
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

    let i = 0;
    const interval = setInterval(() => {
        if (i < 10) {
            overlay.style.backgroundColor = (i % 2 === 0) ? 'black' : 'white';
            text.style.color = (i % 2 === 0) ? 'white' : 'black';
            i++;
        } else {
            clearInterval(interval);
            overlay.style.display = 'none';
            isBlinking = false;
            updateBlinkStats();
            checkAllTreesFilled();
            setTimeout(() => {
                treeStates[index].dead = true;
                chrome.storage.local.set({ treeStates }, () => {
                    console.log('Tree died!');
                });
                plot.classList.remove('active');
                plot.innerHTML = '';
                plantedTreesCount--; // Decrement the planted trees count
            }, 7200000);
        }
    }, 200);
}

// Check if all trees are filled and display gnome image
function checkAllTreesFilled() {
    if (treeStates.length === plots.length) {
        displayGnome();
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
    img.src = 'gnome.jpg';
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
    chrome.storage.local.get(['lastResetDate'], ({ lastResetDate }) => {
        if (!lastResetDate || new Date(lastResetDate).toDateString() !== now.toDateString()) {
            totalBlinkersToday = 0;
            chrome.storage.local.set({ totalBlinkersToday, lastResetDate: now.toISOString() }, () => {
                console.log('Daily blink count reset!');
                updateBlinkStats();
            });
        }
        else {
            console.log('Daily blink count already reset for today.');
        }
        updateBlinkStats();
    });

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
    chrome.storage.local.set({ treeStates }, () => {
        console.log('Trees reset!');
    });
    updatePlots();
});

// Event listener for reducing daily blinker count
document.getElementById('blink-count').addEventListener('click', () => {
    if (totalBlinkersToday > 0) {
        totalBlinkersToday--;
        if (totalBlinkersToday > highScore) {
            highScore = totalBlinkersToday;
        }
        chrome.storage.local.set({ totalBlinkersToday, highScore }, () => {
            console.log('Daily blink count reduced!');
        });
        updateBlinkStats();
    }
});