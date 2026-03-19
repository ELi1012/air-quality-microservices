/**
 * Methods:
 * - getLatestStationMeasurements: Fetches most recent ACA station measurements
 */


import { runQuery } from "./pool";
import { StationRecord } from "../types/contracts";
import {_read_data, _write_data, getFilesFromDir} from "../utils"
import { STATION_TABLE, STATION_MEASUREMENTS, STATION_AQI_TABLE } from "./table_names"


export async function getLatestStationMeasurements(): Promise<StationRecord[]> {

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
        FROM ${STATION_TABLE} s
        JOIN (
            SELECT DISTINCT ON (station_key) 
                *,
                (
                    SELECT json_agg(json_build_array(pollutant, value))
                    FROM ${STATION_AQI_TABLE} a
                    WHERE a.station_key = ${STATION_MEASUREMENTS}.station_key 
                    AND a.timestamp = ${STATION_MEASUREMENTS}.timestamp
                ) as aqis_list
            FROM ${STATION_MEASUREMENTS}
            ORDER BY station_key, timestamp DESC
        ) m ON s.station_key = m.station_key;
    `;


    try {

        const res = await runQuery(query);
        const { rows } = res;
        const data = rows.map(r => r.data);
    
        return data as StationRecord[];
    } catch (err) {
        console.error('Error: ', err, '\nQuery failed. If this is a "non-existent relation" failure, make sure the cron provider runs first so it can set up the database.');
        throw new Error(err);
    }
}

(async () => {

    const data = await getLatestStationMeasurements();
    console.log(data)
})
// ();