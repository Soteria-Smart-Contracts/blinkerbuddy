const http = require('http');
const url = require('url');
const crypto = require('crypto');
const Database = require('@replit/database');
const QRCode = require('qrcode');

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
    const userResult = await db.get(`user:${userId}`);
    let user = null;
    if (userResult && userResult.ok && userResult.value) {
      user = userResult.value;
    } else if (userResult && userResult.id) {
      user = userResult;
    }
    
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
  // Set a timeout for all requests to prevent hanging
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.writeHead(408, { 'Content-Type': 'text/plain' });
      res.end('Request Timeout');
    }
  }, 10000); // 10 second timeout
  
  res.on('finish', () => clearTimeout(timeout));
  
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Set CORS headers for blinke.netlify.app only
  const origin = req.headers.origin;
  if (origin === 'https://blinke.netlify.app') {
    res.setHeader('Access-Control-Allow-Origin', 'https://blinke.netlify.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Source');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Validate request source (skip for health check)
  if (pathname !== '/') {
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers.referer || '';
    
    // Block obvious console/curl requests
    if (userAgent.includes('curl') || 
        userAgent.includes('wget') || 
        userAgent.includes('PostmanRuntime') ||
        (!referer.includes('blinke.netlify.app') && !referer.includes('localhost') && !referer.includes('127.0.0.1'))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // Health check endpoint: /
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
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
      const activeExportData = {
        userId: targetUserId,
        username: username,
        createdAt: Date.now(),
        expiresAt: expirationTime
      };
      
      await db.set(`activeExport:${exportToken}`, activeExportData);
      console.log(`[${new Date().toISOString()}] Stored active export:`, activeExportData);

      // Set individual timeout to clear token after exactly 3 minutes
      setTimeout(() => {
        removeExpiredToken(exportToken, targetUserId);
      }, 3 * 60 * 1000);

      // Generate QR code with the import link
      const importUrl = `https://blinke.netlify.app/import:${exportToken}`;
      
      try {
        const qrCodeDataURL = await QRCode.toDataURL(importUrl, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: 256
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          username: username,
          id: targetUserId,
          token: exportToken,
          expires_in: 180, // 3 minutes in seconds
          import_url: importUrl,
          qr_code: qrCodeDataURL
        }));
      } catch (qrError) {
        console.error('Error generating QR code:', qrError);
        // Fallback without QR code
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          username: username,
          id: targetUserId,
          token: exportToken,
          expires_in: 180, // 3 minutes in seconds
          import_url: importUrl,
          qr_code: null,
          error: 'Failed to generate QR code'
        }));
      }
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
        const exportResult = await db.get(key);
        console.log(`[${new Date().toISOString()}] Retrieved export data for key ${key}:`, exportResult);
        
        // Handle both direct export object and wrapped response
        let exportData = null;
        if (exportResult && exportResult.ok && exportResult.value) {
          exportData = exportResult.value;
        } else if (exportResult && exportResult.userId) {
          exportData = exportResult;
        }
        
        if (exportData && exportData.createdAt && exportData.expiresAt) {
          // Validate timestamps before converting
          const createdAt = exportData.createdAt;
          const expiresAt = exportData.expiresAt;
          
          if (typeof createdAt === 'number' && typeof expiresAt === 'number' && 
              !isNaN(createdAt) && !isNaN(expiresAt)) {
            activeExportsList.push({
              userId: exportData.userId,
              username: exportData.username,
              createdAt: new Date(createdAt).toISOString(),
              expiresAt: new Date(expiresAt).toISOString(),
              timeRemaining: Math.max(0, Math.ceil((expiresAt - now) / 1000)) // seconds remaining
            });
          } else {
            console.log(`[${new Date().toISOString()}] Skipping export with invalid timestamps:`, exportData);
          }
        } else {
          console.log(`[${new Date().toISOString()}] No valid export data found for key ${key}:`, exportData);
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

  // Load username endpoint: /loadusername:username
  if (pathname.startsWith('/loadusername:') && req.method === 'GET') {
    const username = pathname.split(':')[1];

    if (!username || username.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username is required' }));
      return;
    }

    try {
      // Find user by username
      let targetUser = null;
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
          break;
        }
      }

      if (!targetUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'User not found' }));
        return;
      }

      // Return user data
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: targetUser.id,
        username: targetUser.username,
        blinkscore: targetUser.blinkscore || 0
      }));
    } catch (error) {
      console.error('Error loading user:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Import check endpoint: /importcheck:token
  if (pathname.startsWith('/importcheck:') && req.method === 'GET') {
    const token = pathname.split(':')[1];

    if (!token || token.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token is required' }));
      return;
    }

    try {
      // Check if token exists in active exports
      const exportResult = await db.get(`activeExport:${token}`);
      let exportData = null;
      
      if (exportResult && exportResult.ok && exportResult.value) {
        exportData = exportResult.value;
      } else if (exportResult && exportResult.userId) {
        exportData = exportResult;
      }

      if (!exportData) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or expired token' }));
        return;
      }

      // Check if token has expired
      const now = Date.now();
      if (exportData.expiresAt && now > exportData.expiresAt) {
        // Token has expired, remove it
        await db.delete(`activeExport:${token}`);
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token has expired' }));
        return;
      }

      // Token is valid, return user information
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        valid: true,
        username: exportData.username,
        id: exportData.userId,
        expires_at: new Date(exportData.expiresAt).toISOString(),
        time_remaining: Math.max(0, Math.ceil((exportData.expiresAt - now) / 1000)) // seconds remaining
      }));
    } catch (error) {
      console.error('Error checking import token:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Clear exports endpoint: /clearexports
  if (pathname === '/clearexports' && req.method === 'GET') {
    try {
      // Clear all active exports
      const exportsListResult = await db.list('activeExport:');
      const exportsList = (exportsListResult && exportsListResult.ok && exportsListResult.value) ? exportsListResult.value : [];
      
      let deletedCount = 0;
      for (const key of exportsList) {
        await db.delete(key);
        deletedCount++;
        console.log(`[${new Date().toISOString()}] Deleted export: ${key}`);
      }

      // Clear export tokens from all users
      const usersListResult = await db.list('user:');
      const usersList = (usersListResult && usersListResult.ok && usersListResult.value) ? usersListResult.value : [];
      
      let usersUpdated = 0;
      for (const key of usersList) {
        const userResult = await db.get(key);
        let user = null;
        if (userResult && userResult.ok && userResult.value) {
          user = userResult.value;
        } else if (userResult && userResult.id) {
          user = userResult;
        }
        
        if (user && user.exportToken) {
          user.exportToken = null;
          await db.set(key, user);
          usersUpdated++;
          console.log(`[${new Date().toISOString()}] Cleared export token from user: ${user.username}`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'All active exports have been cleared',
        deleted_exports: deletedCount,
        users_updated: usersUpdated,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error clearing exports:', error);
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