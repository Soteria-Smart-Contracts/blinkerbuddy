chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.cookie.domain === 'blinke.netlify.app' && changeInfo.cookie.name === 'blinkerUID') {
        if (changeInfo.removed) {
            // User logged out
            chrome.runtime.sendMessage({ action: 'userLoggedOut' });
        } else {
            // User logged in
            chrome.runtime.sendMessage({ action: 'userLoggedIn', userId: changeInfo.cookie.value });
        }
    }
});