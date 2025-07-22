const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins including Netlify
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// Handle keepalive endpoint
app.get('/keepalive', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

app.listen(process.env.PORT || 5000, '0.0.0.0', () => {
    console.log(`Keepalive server running on port ${process.env.PORT || 5000}`);
});