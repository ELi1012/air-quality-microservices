const now = new Date().toISOString();
console.log(`Cron triggered at: ${now}`);

import { fetch_all_stations } from "./ab_stations/ingest_ab_gov"
import * as fs from 'fs';

const data = { 
    timestamp: now, 
    readings: [/* your data */] 
};

// Ensure you write to the MOUNTED directory
const outputPath = `./data/ALL_STATIONS-${now}.json`;

(async () => {
    try {
        const stationReadings = await fetch_all_stations();
        data.readings = stationReadings;
    
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        console.log('Data flushed to shared volume.');
    } catch (err) {
        console.error('Failed to write to volume:', err);
    }
})();