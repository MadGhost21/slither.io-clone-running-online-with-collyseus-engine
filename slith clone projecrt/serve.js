const express = require('express');
const app = express();
const path = require('path');
const port = 3005;

app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Client serving at http://localhost:${port}`);
});
