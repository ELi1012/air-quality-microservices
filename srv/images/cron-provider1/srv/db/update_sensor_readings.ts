import { pool } from "./pools";
import format from "pg-format"

import { BaseMicrosensor } from "../types/contracts"
import { get_purpleair_sensor_data } from "../services/purpleair/ingest"

import {_read_data, _write_data, getFilesFromDir} from "../utils"

import { SENSOR_READINGS } from "./table_names"

export async function updateReadings() {
    const res = await get_purpleair_sensor_data();
    if (res === undefined) return;

    // fields like "pm2.5_10minute" must be wrapped in double quotes
    const fieldsFormatted = res.fields.map((f: string) => `"${f}"`).join(',');
    const rows: unknown[] = res.data;

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
        rows
    );

    try {
        await pool.query(query);
    } catch (err) {
        console.log(`Failed to update sensor readings: `, err)
    }
}