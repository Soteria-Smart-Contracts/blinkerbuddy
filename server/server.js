const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins including Netlify
app.use(cors({
    origin: ['https://blinke.netlify.app', '*'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// Handle OPTIONS preflight requests explicitly
app.options('/keepalive', (req, res) => {
    res.status(200).end();
});

app.get('/keepalive', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

app.listen(process.env.PORT || 5000, '0.0.0.0', () => {
    console.log(`Keepalive server running on port ${process.env.PORT || 5000}`);
});