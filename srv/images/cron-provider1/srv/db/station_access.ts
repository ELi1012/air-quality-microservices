/**
 * Methods:
 * - getLatestStationMeasurements: Fetches most recent ACA station measurements
 */


import { pool } from "./pools";

import {_read_data, _write_data, getFilesFromDir} from "../utils"
import { STATION_TABLE, STATION_MEASUREMENTS } from "./table_names"

export async function getLatestStationMeasurements() {

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
                'extra_info', m.extra_info
            ) as data
        FROM ${STATION_TABLE} s
        JOIN (
            SELECT DISTINCT ON (station_key) 
                *,
                (
                    SELECT json_agg(json_build_array(pollutant, value))
                    FROM aqis a
                    WHERE a.station_key = measurements.station_key 
                    AND a.timestamp = measurements.timestamp
                ) as aqis_list
            FROM ${STATION_MEASUREMENTS}
            ORDER BY station_key, timestamp DESC
        ) m ON s.station_key = m.station_key;
    `;

  try {
    const res = await pool.query(query);
    const stations = res.rows.map(row => row.data);
    return stations;
  } catch (err) {
    console.error(`Could not access stations from db: `, err);
  }
}


(async () => {
    const thing = await getLatestStationMeasurements();
    console.log(thing);

    _write_data("./pg_stations.json", thing);

    
    // compare('./stations/sample_data.json')
    
})
// ();