"use strict";
/**
 * Methods:
 * - getLatestReadings: fetches latest PurpleAir sensor data FROM DATABASE
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestReadings = getLatestReadings;
const pool_1 = require("./pool");
const table_names_1 = require("./table_names");
async function getLatestReadings() {
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
    FROM ${table_names_1.SENSOR_TABLE} s
    JOIN (
        SELECT DISTINCT ON (sensor_index) *
        FROM ${table_names_1.SENSOR_READINGS}
        ORDER BY sensor_index, last_seen DESC
    ) r ON s.sensor_index = r.sensor_index
    ;`;
    try {
        const res = await (0, pool_1.runQuery)(query);
        const { rows } = res;
        const data = rows.map(r => r.data);
        return data;
    }
    catch (err) {
        console.error('Error: ', err, '\nQuery failed. If this is a "non-existent relation" failure, make sure the cron provider runs first so it can set up the database.');
        throw new Error(err);
    }
}
(async () => {
    const data = await getLatestReadings();
    console.log(data);
});
// ();
