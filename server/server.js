const express = require('express');
const crypto = require('crypto');
const { Datastore } = require('@google-cloud/datastore');
const QRCode = require('qrcode');

// Initialize Google Cloud Datastore
const datastore = new Datastore();

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
  const transaction = datastore.transaction();
  try {
    await transaction.run();
    const activeExportKey = datastore.key(['activeExport', exportToken]);
    const userKey = datastore.key(['user', userId]);

    const [user] = await transaction.get(userKey);

    if (user && user.exportToken === exportToken) {
      user.exportToken = null;
      transaction.save({
        key: userKey,
        data: user,
      });
    }

    transaction.delete(activeExportKey);

    await transaction.commit();
    console.log(`[${new Date().toISOString()}] Export token expired and removed: ${exportToken.substring(0, 8)}...`);
  } catch (error) {
    await transaction.rollback();
    console.error('Error removing expired token:', error);
  }
}

// Health check endpoint: /
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// Register endpoint: /register/:username
app.get('/register/:username', async (req, res) => {
  const username = req.params.username;

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();
    const query = datastore.createQuery('user').filter('username', '=', username);
    const [users] = await transaction.runQuery(query);

    if (users.length > 0) {
      await transaction.rollback();
      return res.status(409).json({ error: 'Username already exists' });
    }

    const userId = generateHexId();
    const userKey = datastore.key(['user', userId]);
    const newUser = {
      id: userId,
      username: username,
      blinkscore: 0,
      exportToken: null,
    };

    transaction.save({
      key: userKey,
      data: newUser,
    });

    await transaction.commit();
    console.log(`[${new Date().toISOString()}] User registered:`, { id: userId, username: username });

    res.status(200).json({
      id: userId,
      username: username,
      blinkscore: 0,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export endpoint: /export/:username
app.get('/export/:username', async (req, res) => {
  const username = req.params.username;

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();
    const query = datastore.createQuery('user').filter('username', '=', username);
    const [users] = await transaction.runQuery(query);

    if (users.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    const userId = user.id;

    const exportToken = generateHexId();
    const expirationTime = Date.now() + 3 * 60 * 1000; // 3 minutes

    const activeExportKey = datastore.key(['activeExport', exportToken]);
    const activeExportData = {
      userId: userId,
      username: username,
      createdAt: new Date(),
      expiresAt: new Date(expirationTime),
    };

    transaction.save({
      key: activeExportKey,
      data: activeExportData,
    });

    await transaction.commit();
    console.log(`[${new Date().toISOString()}] Stored active export:`, activeExportData);

    setTimeout(() => {
      removeExpiredToken(exportToken, userId);
    }, 3 * 60 * 1000);

    const importUrl = `https://blinke.netlify.app/?id=${exportToken}`;
    const qrCodeDataURL = await QRCode.toDataURL(importUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      width: 256,
    });

    res.status(200).json({
      username: username,
      id: userId,
      token: exportToken,
      expires_in: 180,
      import_url: importUrl,
      qr_code: qrCodeDataURL,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error exporting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import endpoint: /import/:token
app.get('/import/:token', async (req, res) => {
  const token = req.params.token;

  if (!token || token.trim() === '') {
    return res.status(400).json({ error: 'Token is required' });
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();
    const activeExportKey = datastore.key(['activeExport', token]);
    const [activeExport] = await transaction.get(activeExportKey);

    if (!activeExport) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    if (activeExport.expiresAt < new Date()) {
      transaction.delete(activeExportKey);
      await transaction.commit();
      return res.status(410).json({ error: 'Token has expired' });
    }

    const userKey = datastore.key(['user', activeExport.userId]);
    const [user] = await transaction.get(userKey);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    await transaction.commit();
    res.status(200).json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        blinkscore: user.blinkscore || 0,
      },
      expires_at: activeExport.expiresAt.toISOString(),
      time_remaining: Math.max(0, Math.ceil((activeExport.expiresAt - Date.now()) / 1000)),
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error importing user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All users endpoint: /all
app.get('/all', async (req, res) => {
  try {
    const query = datastore.createQuery('user');
    const [users] = await datastore.runQuery(query);
    res.status(200).json({
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        blinkscore: user.blinkscore || 0,
      })),
      total_users: users.length,
    });
  } catch (error) {
    console.error('Error getting all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Active exports endpoint: /activeexports
app.get('/activeexports', async (req, res) => {
  try {
    const query = datastore.createQuery('activeExport').filter('expiresAt', '>', new Date());
    const [activeExports] = await datastore.runQuery(query);
    res.status(200).json({
      active_exports: activeExports.map(exp => ({
        userId: exp.userId,
        username: exp.username,
        createdAt: exp.createdAt.toISOString(),
        expiresAt: exp.expiresAt.toISOString(),
        timeRemaining: Math.max(0, Math.ceil((exp.expiresAt - Date.now()) / 1000)),
      })),
      total_active: activeExports.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting active exports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//add a new endpoint called /blink/:id, where if called increments the blinkscore of the user with the given id by 1
app.get('/blink/:id', async (req, res) => {
  const userId = req.params.id;
  const treeStates = req.query.treeStates;

  if (!userId || userId.trim() === '') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const transaction = datastore.transaction();
  try {
    await transaction.run();
    const userKey = datastore.key(['user', userId]);
    const [user] = await transaction.get(userKey);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    user.blinkscore = (user.blinkscore || 0) + 1;
    user.treeStates = treeStates || [];

    transaction.save({
      key: userKey,
      data: user,
    });

    await transaction.commit();
    console.log(`[${new Date().toISOString()}] Blinkscore incremented for user ${userId}`);
    console.log(`[${new Date().toISOString()}] ${user.username} has been caught blinking!`);

    res.status(200).json({
      id: user.id,
      username: user.username,
      blinkscore: user.blinkscore,
      treeStates: user.treeStates,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error incrementing blinkscore:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Load user ID endpoint: /loaduserid/:id
app.get('/loaduserid/:id', async (req, res) => {
  const userId = req.params.id;
  if (!userId || userId.trim() === '') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const userKey = datastore.key(['user', userId]);
    const [user] = await datastore.get(userKey);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[${new Date().toISOString()}] User ${user.username} logging in...`);
    res.status(200).json({
      id: user.id,
      username: user.username,
      blinkscore: user.blinkscore || 0,
      treeStates: user.treeStates || [],
    });
  } catch (error) {
    console.error('Error loading user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import check endpoint: /importcheck/:token
app.get('/importcheck/:token', async (req, res) => {
  const token = req.params.token;

  if (!token || token.trim() === '') {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const activeExportKey = datastore.key(['activeExport', token]);
    const [activeExport] = await datastore.get(activeExportKey);

    if (!activeExport) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    if (activeExport.expiresAt < new Date()) {
      await datastore.delete(activeExportKey);
      return res.status(410).json({ error: 'Token has expired' });
    }

    res.status(200).json({
      valid: true,
      username: activeExport.username,
      id: activeExport.userId,
      expires_at: activeExport.expiresAt.toISOString(),
      time_remaining: Math.max(0, Math.ceil((activeExport.expiresAt - Date.now()) / 1000)),
    });
  } catch (error) {
    console.error('Error checking import token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear exports endpoint: /clearexports
app.get('/clearexports', async (req, res) => {
  const transaction = datastore.transaction();
  try {
    await transaction.run();

    const activeExportQuery = datastore.createQuery('activeExport');
    const [activeExports] = await transaction.runQuery(activeExportQuery);
    const activeExportKeys = activeExports.map(exp => exp[datastore.KEY]);
    transaction.delete(activeExportKeys);

    const userQuery = datastore.createQuery('user').filter('exportToken', '!=', null);
    const [usersToUpdate] = await transaction.runQuery(userQuery);
    usersToUpdate.forEach(user => {
      user.exportToken = null;
    });
    transaction.save(usersToUpdate.map(user => ({ key: user[datastore.KEY], data: user })));

    await transaction.commit();

    res.status(200).json({
      message: 'All active exports have been cleared',
      deleted_exports: activeExportKeys.length,
      users_updated: usersToUpdate.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error clearing exports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset endpoint: /reset (for development purposes)
app.get('/reset', async (req, res) => {
  try {
    const userQuery = datastore.createQuery('user');
    const [users] = await datastore.runQuery(userQuery);
    const userKeys = users.map(user => user[datastore.KEY]);
    await datastore.delete(userKeys);

    const activeExportQuery = datastore.createQuery('activeExport');
    const [activeExports] = await datastore.runQuery(activeExportQuery);
    const activeExportKeys = activeExports.map(exp => exp[datastore.KEY]);
    await datastore.delete(activeExportKeys);

    res.status(200).json({
      message: 'All users and tokens have been reset',
      timestamp: new Date().toISOString(),
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
