
const http = require('http');
const url = require('url');
const crypto = require('crypto');

// In-memory database (consider using a persistent database for production)
const users = new Map();
const exportTokens = new Map(); // Store tokens with expiry timestamps
const activeExports = new Map(); // Store active export info (without secret tokens)

// Helper function to generate 32-bit hexadecimal ID
function generateHexId() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper function to remove expired token
function removeExpiredToken(exportToken, userId) {
  // Remove from export tokens
  exportTokens.delete(exportToken);
  
  // Remove from active exports
  activeExports.delete(exportToken);
  
  // Clear token from user record
  if (users.has(userId)) {
    const user = users.get(userId);
    if (user.exportToken === exportToken) {
      user.exportToken = null;
      users.set(userId, user);
    }
  }
  
  console.log(`[${new Date().toISOString()}] Export token expired and removed: ${exportToken.substring(0, 8)}...`);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // Health check endpoint: /
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Server is running' }));
    return;
  }

  // Register endpoint: /register:username
  if (pathname.startsWith('/register:') && req.method === 'GET') {
    const username = pathname.split(':')[1];
    
    if (!username || username.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username is required' }));
      return;
    }

    // Check if username already exists
    for (const [id, userData] of users.entries()) {
      if (userData.username === username) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username already exists' }));
        return;
      }
    }

    // Generate unique ID and register user
    const userId = generateHexId();
    const newUser = {
      id: userId,
      username: username,
      blinkscore: 0,
      exportToken: null // Space reserved for one-time export token
    };

    users.set(userId, newUser);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: userId,
      username: username,
      blinkscore: 0
    }));
    return;
  }

  // Export endpoint: /export:username
  if (pathname.startsWith('/export:') && req.method === 'GET') {
    const username = pathname.split(':')[1];
    
    if (!username || username.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username is required' }));
      return;
    }

    // Find user by username
    let targetUser = null;
    let targetUserId = null;
    for (const [id, userData] of users.entries()) {
      if (userData.username === username) {
        targetUser = userData;
        targetUserId = id;
        break;
      }
    }

    if (!targetUser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }

    // Generate one-time export token
    const exportToken = generateHexId();
    const expirationTime = Date.now() + (3 * 60 * 1000); // 3 minutes from now

    // Store token in user record and export tokens map
    targetUser.exportToken = exportToken;
    users.set(targetUserId, targetUser);
    
    exportTokens.set(exportToken, {
      userId: targetUserId,
      username: username,
      expires: expirationTime
    });

    // Add to active exports (without the secret token)
    activeExports.set(exportToken, {
      userId: targetUserId,
      username: username,
      createdAt: Date.now(),
      expiresAt: expirationTime
    });

    // Set individual timeout to clear token after exactly 3 minutes
    setTimeout(() => {
      removeExpiredToken(exportToken, targetUserId);
    }, 3 * 60 * 1000);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      username: username,
      id: targetUserId,
      blinkscore: targetUser.blinkscore,
      token: exportToken,
      expires_in: 180 // 3 minutes in seconds
    }));
    return;
  }

  // All users endpoint: /all
  if (pathname === '/all' && req.method === 'GET') {
    const allUsers = Array.from(users.values()).map(user => ({
      id: user.id,
      username: user.username,
      blinkscore: user.blinkscore
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      users: allUsers,
      total_users: allUsers.length
    }));
    return;
  }

  // Active exports endpoint: /activeexports
  if (pathname === '/activeexports' && req.method === 'GET') {
    const now = Date.now();
    const activeExportsList = Array.from(activeExports.values()).map(exportData => ({
      userId: exportData.userId,
      username: exportData.username,
      createdAt: new Date(exportData.createdAt).toISOString(),
      expiresAt: new Date(exportData.expiresAt).toISOString(),
      timeRemaining: Math.max(0, Math.ceil((exportData.expiresAt - now) / 1000)) // seconds remaining
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      active_exports: activeExportsList,
      total_active: activeExportsList.length,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Reset endpoint: /reset (for development purposes)
  if (pathname === '/reset' && req.method === 'GET') {
    users.clear();
    exportTokens.clear();
    activeExports.clear();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'All users and tokens have been reset',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Default response for other endpoints
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 - Endpoint not found: ' + pathname + '\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
