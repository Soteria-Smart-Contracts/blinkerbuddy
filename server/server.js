const express = require('express');
const crypto = require('crypto');
const Database = require('@replit/database');
const QRCode = require('qrcode');

// Initialize Replit Database
const db = new Database();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - this is the key part that fixes CORS!
app.use(require('cors')()); // Simple cors setup like in your working example
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check endpoint: /
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// Register endpoint: /register:username
app.get('/register:*', async (req, res) => {
  const username = req.params[0];

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
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
        return res.status(409).json({ error: 'Username already exists' });
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

    res.status(200).json({
      id: userId,
      username: username,
      blinkscore: 0
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export endpoint: /export:username
app.get('/export:*', async (req, res) => {
  const username = req.params[0];

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
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
      return res.status(404).json({ error: 'User not found' });
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

      res.status(200).json({
        username: username,
        id: targetUserId,
        token: exportToken,
        expires_in: 180, // 3 minutes in seconds
        import_url: importUrl,
        qr_code: qrCodeDataURL
      });
    } catch (qrError) {
      console.error('Error generating QR code:', qrError);
      // Fallback without QR code
      res.status(200).json({
        username: username,
        id: targetUserId,
        token: exportToken,
        expires_in: 180, // 3 minutes in seconds
        import_url: importUrl,
        qr_code: null,
        error: 'Failed to generate QR code'
      });
    }
  } catch (error) {
    console.error('Error exporting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All users endpoint: /all
app.get('/all', async (req, res) => {
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

    res.status(200).json({
      users: allUsers,
      total_users: allUsers.length
    });
  } catch (error) {
    console.error('Error getting all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Active exports endpoint: /activeexports
app.get('/activeexports', async (req, res) => {
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

    res.status(200).json({
      active_exports: activeExportsList,
      total_active: activeExportsList.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting active exports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Load username endpoint: /loadusername:username
app.get('/loadusername:*', async (req, res) => {
  const username = req.params[0];

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user data
    res.status(200).json({
      id: targetUser.id,
      username: targetUser.username,
      blinkscore: targetUser.blinkscore || 0
    });
  } catch (error) {
    console.error('Error loading user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import check endpoint: /importcheck:token
app.get('/importcheck:*', async (req, res) => {
  const token = req.params[0];

  if (!token || token.trim() === '') {
    return res.status(400).json({ error: 'Token is required' });
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
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    // Check if token has expired
    const now = Date.now();
    if (exportData.expiresAt && now > exportData.expiresAt) {
      // Token has expired, remove it
      await db.delete(`activeExport:${token}`);
      return res.status(410).json({ error: 'Token has expired' });
    }

    // Token is valid, return user information
    res.status(200).json({
      valid: true,
      username: exportData.username,
      id: exportData.userId,
      expires_at: new Date(exportData.expiresAt).toISOString(),
      time_remaining: Math.max(0, Math.ceil((exportData.expiresAt - now) / 1000)) // seconds remaining
    });
  } catch (error) {
    console.error('Error checking import token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear exports endpoint: /clearexports
app.get('/clearexports', async (req, res) => {
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

    res.status(200).json({
      message: 'All active exports have been cleared',
      deleted_exports: deletedCount,
      users_updated: usersUpdated,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing exports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset endpoint: /reset (for development purposes)
app.get('/reset', async (req, res) => {
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

    res.status(200).json({
      message: 'All users and tokens have been reset',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
