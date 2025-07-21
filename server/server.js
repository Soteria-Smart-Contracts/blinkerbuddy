
const http = require('http');
const url = require('url');
const crypto = require('crypto');

// In-memory database
const database = {};
const exportTokens = {};

// Generate 32-bit hexadecimal ID
function generateHexId() {
    return crypto.randomBytes(16).toString('hex');
}

// Token cleanup is handled individually by setTimeout when tokens are created

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // Log incoming request
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log(`Pathname: ${pathname}`);
    console.log(`Query params:`, parsedUrl.query);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Register endpoint: /register?username=value
    if (pathname === '/register') {
        const username = parsedUrl.query.username;
        
        if (!username) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Username parameter is required' }));
            return;
        }
        
        // Check if user already exists
        if (database[username]) {
            console.log(`Registration failed: Username '${username}' already exists`);
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Username already exists' }));
            return;
        }
        
        // Create new user
        const userId = generateHexId();
        database[username] = {
            id: userId,
            username: username,
            blinkscore: 0,
            exportToken: ''
        };
        
        console.log(`User registered successfully: ${username} (ID: ${userId})`);
        console.log(`Current database:`, Object.keys(database));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: userId,
            username: username,
            blinkscore: 0
        }));
        return;
    }
    
    // Export endpoint: /export?username=value
    if (pathname === '/export') {
        const username = parsedUrl.query.username;
        
        if (!username) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Username parameter is required' }));
            return;
        }
        
        // Check if user exists
        if (!database[username]) {
            console.log(`Export failed: User '${username}' not found`);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'User not found' }));
            return;
        }
        
        // Generate one-time export token
        const exportToken = generateHexId();
        const expiresAt = Date.now() + (3 * 60 * 1000); // 3 minutes from now
        
        // Store token in database and tracking object
        database[username].exportToken = exportToken;
        exportTokens[exportToken] = {
            username: username,
            expiresAt: expiresAt
        };
        
        console.log(`Export token generated for '${username}': ${exportToken}`);
        console.log(`Token expires at: ${new Date(expiresAt).toISOString()}`);
        console.log(`Active tokens:`, Object.keys(exportTokens).length);
        
        // Set up automatic cleanup for this specific token after 3 minutes
        setTimeout(() => {
            if (exportTokens[exportToken]) {
                console.log(`Cleaning up expired token: ${exportToken}`);
                delete exportTokens[exportToken];
                if (database[username]) {
                    database[username].exportToken = '';
                }
            }
        }, 3 * 60 * 1000);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            token: exportToken,
            expiresIn: 180 // 3 minutes in seconds
        }));
        return;
    }
    
    // Default response for other routes
    console.log(`404 - Endpoint not found: ${pathname}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
