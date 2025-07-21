const http = require('http');
const url = require('url');
const crypto = require('crypto');
const Database = require('@replit/database');

// Initialize Replit Database
const db = new Database();

// Helper function to generate 32-bit hexadecimal ID
function generateHexId() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper function to remove expired token
async function removeExpiredToken(exportToken, userId) {
  try {
    // Remove from active exports
    await db.delete(`activeExport:${exportToken}`);

    // Clear token from user record
    const user = await db.get(`user:${userId}`);
    if (user && user.exportToken === exportToken) {
      user.exportToken = null;
      await db.set(`user:${userId}`, user);
    }

    console.log(`[${new Date().toISOString()}] Export token expired and removed: ${exportToken.substring(0, 8)}...`);
  } catch (error) {
    console.error('Error removing expired token:', error);
  }
}

const server = http.createServer(async (req, res) => {
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

    try {
      // Check if username already exists
      const usersListResult = await db.list('user:');
      const usersList = (usersListResult && usersListResult.ok && usersListResult.value) ? usersListResult.value : [];

      console.log(`[${new Date().toISOString()}] Checking for duplicate username: ${username}`);
      console.log(`[${new Date().toISOString()}] Found ${usersList.length} existing users`);

      for (const key of usersList) {
        const userResult = await db.get(key);
        // Handle both direct user object and wrapped response
        let userData = null;
        if (userResult && userResult.ok && userResult.value) {
          userData = userResult.value;
        } else if (userResult && userResult.id) {
          userData = userResult;
        }

        console.log(`[${new Date().toISOString()}] Checking user ${key}: ${userData ? userData.username : 'no data'}`);

        if (userData && userData.username && userData.username.toLowerCase() === username.toLowerCase()) {
          console.log(`[${new Date().toISOString()}] Username '${username}' already exists!`);
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

      await db.set(`user:${userId}`, newUser);
      console.log(`[${new Date().toISOString()}] User registered:`, { id: userId, username: username });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: userId,
        username: username,
        blinkscore: 0
      }));
    } catch (error) {
      console.error('Error registering user:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
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

    try {
      // Find user by username
      let targetUser = null;
      let targetUserId = null;

      // Check if username already exists
      const usersListResult = await db.list('user:');
      const usersList = (usersListResult && usersListResult.ok && usersListResult.value) ? usersListResult.value : [];

      for (const key of usersList) {
        const userResult = await db.get(key);
        // Handle both direct user object and wrapped response
        let userData = null;
        if (userResult && userResult.ok && userResult.value) {
          userData = userResult.value;
        } else if (userResult && userResult.id) {
          userData = userResult;
        }

        if (userData && userData.username && userData.username.toLowerCase() === username.toLowerCase()) {
          targetUser = userData;
          targetUserId = userData.id;
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

      // Store token in active exports (without the secret token)
      await db.set(`activeExport:${exportToken}`, {
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
        token: exportToken,
        expires_in: 180 // 3 minutes in seconds
      }));
    } catch (error) {
      console.error('Error exporting user:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // All users endpoint: /all
  if (pathname === '/all' && req.method === 'GET') {
    try {
      const allUsers = [];
      const usersListResult = await db.list('user:');
      const usersList = (usersListResult && usersListResult.ok && usersListResult.value) ? usersListResult.value : [];

      console.log(`[${new Date().toISOString()}] Found ${usersList.length} user keys in /all`);

      for (const key of usersList) {
        const userResult = await db.get(key);
        console.log(`[${new Date().toISOString()}] Retrieved data for key ${key}:`, userResult);

        // Handle both direct user object and wrapped response
        let user = null;
        if (userResult && userResult.ok && userResult.value) {
          user = userResult.value;
        } else if (userResult && userResult.id) {
          user = userResult;
        }

        if (user && user.id && user.username) {
          allUsers.push({
            id: user.id,
            username: user.username,
            blinkscore: user.blinkscore || 0
          });
        } else {
          console.log(`[${new Date().toISOString()}] Invalid user data for key ${key}:`, user);
        }
      }

      console.log(`[${new Date().toISOString()}] Final users array:`, allUsers);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        users: allUsers,
        total_users: allUsers.length
      }));
    } catch (error) {
      console.error('Error getting all users:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Active exports endpoint: /activeexports
  if (pathname === '/activeexports' && req.method === 'GET') {
    try {
      const now = Date.now();
      const activeExportsList = [];
      const exportsListResult = await db.list('activeExport:');
      const exportsList = (exportsListResult && exportsListResult.ok && exportsListResult.value) ? exportsListResult.value : [];

      for (const key of exportsList) {
        const exportData = await db.get(key);
        if (exportData) {
          activeExportsList.push({
            userId: exportData.userId,
            username: exportData.username,
            createdAt: new Date(exportData.createdAt).toISOString(),
            expiresAt: new Date(exportData.expiresAt).toISOString(),
            timeRemaining: Math.max(0, Math.ceil((exportData.expiresAt - now) / 1000)) // seconds remaining
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        active_exports: activeExportsList,
        total_active: activeExportsList.length,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error getting active exports:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Reset endpoint: /reset (for development purposes)
  if (pathname === '/reset' && req.method === 'GET') {
    try {
      // Clear all users
      const usersListResult = await db.list('user:');
      const usersList = (usersListResult && usersListResult.ok && usersListResult.value) ? usersListResult.value : [];
      for (const key of usersList) {
        await db.delete(key);
      }

      // Clear all export tokens
      const tokensListResult = await db.list('exportToken:');
      const tokensList = (tokensListResult && tokensListResult.ok && tokensListResult.value) ? tokensListResult.value : [];
      for (const key of tokensList) {
        await db.delete(key);
      }

      // Clear all active exports
      const exportsListResult = await db.list('activeExport:');
      const exportsList = (exportsListResult && exportsListResult.ok && exportsListResult.value) ? exportsListResult.value : [];
      for (const key of exportsList) {
        await db.delete(key);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'All users and tokens have been reset',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error resetting database:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
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