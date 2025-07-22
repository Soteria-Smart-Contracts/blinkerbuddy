const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

// Handle OPTIONS preflight requests explicitly
app.options('/keepalive', (req, res) => {
    res.status(200).end();
});

app.get('/keepalive', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Keepalive server running`);
});