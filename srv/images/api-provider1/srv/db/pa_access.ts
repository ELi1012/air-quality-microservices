/**
 * Methods:
 * - getLatestReadings: fetches latest PurpleAir sensor data FROM DATABASE
 */

import { BaseMicrosensor } from "../types/contracts"
import { _read_data, _write_data } from "../utils"

import { runQuery } from "./pool"

import { SENSOR_TABLE, SENSOR_READINGS } from "./table_names"


export async function getLatestReadings(): Promise<BaseMicrosensor[] | undefined> {
    const query = `
    SELECT 
        json_build_object(
            'sensor_index', s.sensor_index,
            'last_seen', r.last_seen,
            'name', s.name,
            'latitude', s.latitude,
            'longitude', s.longitude,

            'pm2.5_10minute',   r."pm2.5_10minute",
            'pm2.5_30minute',   r."pm2.5_30minute",
            'pm2.5_60minute',   r."pm2.5_60minute",
            'pm2.5_6hour',      r."pm2.5_6hour",
            'pm2.5_24hour',     r."pm2.5_24hour",
            'humidity',         r.humidity
        ) as data
    FROM ${SENSOR_TABLE} s
    JOIN (
        SELECT DISTINCT ON (sensor_index) *
        FROM ${SENSOR_READINGS}
        ORDER BY sensor_index, last_seen DESC
    ) r ON s.sensor_index = r.sensor_index
    ;`

    try {

        const res = await runQuery(query);
        const { rows } = res;
        const data = rows.map(r => r.data);
    
        return data as BaseMicrosensor[];
    } catch (err) {
        console.error('Error: ', err, '\nQuery failed. If this is a "non-existent relation" failure, make sure the cron provider runs first so it can set up the database.');
        throw new Error(err);
    }
}


(async () => {

    const data = await getLatestReadings();
    console.log(data)
})
// ();