"use strict";
/**
 * Methods:
 * - getLatestStationMeasurements: Fetches most recent ACA station measurements
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestStationMeasurements = getLatestStationMeasurements;
const pool_1 = require("./pool");
const table_names_1 = require("./table_names");
async function getLatestStationMeasurements() {
    const query = `
        SELECT 
            json_build_object(
                'station_key', s.station_key,
                'name', s.name,
                'lat', s.lat,
                'lon', s.lon,
                'timestamp', m.timestamp,
                'raw_timestamp', m.timestamp,
                'readings', json_build_object(
                    'no2', m.no2,
                    'so2', m.so2,
                    'pm25', m.pm25,
                    'o3', m.o3,
                    'co', m.co,
                    'h2s', m.h2s
                ),
                'aqhi', m.aqhi,
                'aqi', m.aqi,
                'manual_aqhi', m.manual_aqhi,
                'aqis', m.aqis_list,
                'extraInfo', m.extraInfo
            ) as data
        FROM ${table_names_1.STATION_TABLE} s
        JOIN (
            SELECT DISTINCT ON (station_key) 
                *,
                (
                    SELECT json_agg(json_build_array(pollutant, value))
                    FROM ${table_names_1.STATION_AQI_TABLE} a
                    WHERE a.station_key = ${table_names_1.STATION_MEASUREMENTS}.station_key 
                    AND a.timestamp = ${table_names_1.STATION_MEASUREMENTS}.timestamp
                ) as aqis_list
            FROM ${table_names_1.STATION_MEASUREMENTS}
            ORDER BY station_key, timestamp DESC
        ) m ON s.station_key = m.station_key;
    `;
    const res = await (0, pool_1.runQuery)(query);
    if (res === null) {
        console.log('Could not get latest station measurements');
        return;
    }
    const data = res.rows.map(row => row.data);
    return data;
}
(async () => {
    const data = await getLatestStationMeasurements();
    console.log(data);
});
// ();
