import { pool } from "./pools";
import format from "pg-format"

import { BaseMicrosensor } from "../types/contracts"
import { get_purpleair_sensor_data } from "../services/purpleair/ingest"

import {_read_data, _write_data, getCurrentTimeISO } from "../utils"

import { SENSOR_READINGS } from "./table_names"

export async function updateReadings() {
    const res = await get_purpleair_sensor_data();

    if (res === undefined) return;

    let rowsToInsert: any[] = res.data;
    console.log(`Fetched PA data from API at ${getCurrentTimeISO()}`);

    // --- Check if sensors exist in table before insertion
    const sensorIndexPos = res.fields.indexOf("sensor_index");
    if (sensorIndexPos === -1) {
        // shouldn't happen unless response is malformed or purpleair updates its API field naming
        // otherwise, sensor_index is always present
        throw new Error("API response missing sensor_index field");
    }

    const uniqueSensorIdsFromApi = [...new Set(res.data.map(row => row[sensorIndexPos]))];

    // compare ids from API to ids currently in table
    const { rows: existingRows } = await pool.query('SELECT sensor_index FROM sensors;');
    const existingSensorIds = new Set(existingRows.map(r => r.sensor_index));
    const missingIds = uniqueSensorIdsFromApi.filter(id => !existingSensorIds.has(id));

    if (missingIds.length > 0) {
        // happens if sensors are in purpleair group but not in table
        // this is ok. just manually run the monthly cronjob that updates the purpleair group to make this disappear
        console.warn(`⚠️ Found ${missingIds.length} new sensors in API data not present in DB:`, missingIds);
        console.log(`Happens if monthly purpleair cronjob hasn't updated sensors table. Run the cronjob manually to remove this message.`);
        
        // filter out sensors not in table
        // otherwise causes a foreign key constraint violation
        rowsToInsert = rowsToInsert.filter(row => existingSensorIds.has(row[sensorIndexPos]));
    }


    // --- INSERT NEW READINGS INTO TABLE
    // fields like "pm2.5_10minute" must be wrapped in double quotes
    const fieldsFormatted = res.fields.map((f: string) => `"${f}"`).join(',');

    const query = format(
        `INSERT INTO ${SENSOR_READINGS} (${fieldsFormatted})
        VALUES %L
        ON CONFLICT (sensor_index, last_seen) 
        DO UPDATE SET 
            "pm2.5_10minute"    = EXCLUDED."pm2.5_10minute",
            "pm2.5_30minute"    = EXCLUDED."pm2.5_30minute",
            "pm2.5_60minute"    = EXCLUDED."pm2.5_60minute",
            "pm2.5_6hour"       = EXCLUDED."pm2.5_6hour",
            "pm2.5_24hour"      = EXCLUDED."pm2.5_24hour",
            humidity            = EXCLUDED.humidity,
            last_updated        = CURRENT_TIMESTAMP
        ;`,
        rowsToInsert
    );

    try {
        await pool.query(query);
        console.log("Purpleair readings updated successfully");
    } catch (err) {
        console.log(`Failed to update sensor readings: `, err);
        throw err;
    }
}

