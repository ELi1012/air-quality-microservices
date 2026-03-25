import express from 'express';
import { getLatestReadings } from "./db/pa_access.js";
import { getLatestStationMeasurements } from './db/station_access.js';
import { checkHealth } from "./db/healthcheck.js"

const app = express();
const port = 8080;


app.get('/api/pa-recent', async (req, res) => {
  try {
    const readings = await getLatestReadings();
    res.json(readings);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load PurpleAir data' });
  }
});

app.get('/api/fem-stations-recent', async (req, res) => {
  try {
    const measurements = await getLatestStationMeasurements();
    res.json(measurements);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load FEM station data' });
  }
});

app.get('/health', async (req, res) => {
  try {

    await checkHealth();
    
    res.status(200).json({ 
      status: 'UP', 
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({ 
      status: 'DOWN', 
      error: 'Database connection failed' 
    });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port}`)
})
