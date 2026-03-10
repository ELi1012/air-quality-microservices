import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 8080;

const dataDir = '/srv/data';

app.get('/', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Could not read directory' });

    // Filter by prefix and sort alphabetically (ascending)
    const latestFile = files
      .filter(f => f.startsWith('ALL_STATIONS'))
      .sort()
      .pop(); // Get the last element (latest timestamp)

    if (!latestFile) return res.status(404).json({ error: 'No files found' });

    const fullPath = path.join(dataDir, latestFile);
    
    fs.readFile(fullPath, 'utf8', (err, data) => {
      if (err) return res.status(500).json({ error: 'Error reading file' });
      res.json(JSON.parse(data));
    });
  });
})

app.listen(port, () => {
  console.log(`API running on port ${port}`)
})
