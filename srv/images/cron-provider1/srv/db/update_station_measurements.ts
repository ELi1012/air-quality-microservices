import { pool } from "./pools";
import format from "pg-format"

import { PollutantKey, StationRecord } from "../types/contracts"
import { fetch_all_stations } from "../services/stations/ingest_ab_gov";

import {_read_data, _write_data, getFilesFromDir} from "../utils"
import { STATION_MEASUREMENTS, STATION_AQI_TABLE } from "./table_names"


async function insertStationMeasurementAll(stations: StationRecord[]) {
    // flattens rows for insertion
    const formatForInsertion = (station: StationRecord) => {
        const { station_key, timestamp, raw_timestamp, aqhi, aqi, manual_aqhi, extraInfo } = station;
        const { no2, so2, pm25, o3, co, h2s } = station.readings;

        // VALUES MUST BE LISTED IN SAME ORDER AS formatQuery
        return [station_key, timestamp, raw_timestamp, no2, so2, pm25, o3, co, h2s, aqhi, aqi, manual_aqhi, extraInfo];
    }

    // MUST BE LISTED IN SAME ORDER AS INSERT QUERY
    const measurementRows: any[][] = stations.map(s => formatForInsertion(s));
    
    const sqlQuery = format(
        `INSERT INTO ${STATION_MEASUREMENTS} (
            station_key, timestamp, raw_timestamp, no2, so2, pm25, o3, co, h2s, aqhi, aqi, manual_aqhi, extraInfo
        )
        VALUES %L
        ON CONFLICT (station_key, timestamp) 
        DO UPDATE SET 
            no2     = EXCLUDED.no2, 
            so2     = EXCLUDED.so2, 
            pm25    = EXCLUDED.pm25,
            o3      = EXCLUDED.o3,
            co      = EXCLUDED.co,
            h2s     = EXCLUDED.h2s,
            aqhi    = EXCLUDED.aqhi,
            aqi     = EXCLUDED.aqi,
            manual_aqhi = EXCLUDED.manual_aqhi,
            extraInfo = EXCLUDED.extraInfo,
            last_updated = CURRENT_TIMESTAMP
        ;`,
        measurementRows
    );

    try {
        await pool.query(sqlQuery);
    } catch (err) {
        console.log(`Failed to insert stations: `, err)
    }
}




async function insertAQIsAll(stations: StationRecord[]) {
    const flattenAQIsForInsertion = (station: StationRecord): any[][] => {
        // needs to be same order as query
        return station.aqis.map(([pollutant, value]: [PollutantKey, number | null]) => [
            station.station_key,
            station.timestamp,
            pollutant,
            value
        ]);

    }

    // MUST BE LISTED IN SAME ORDER AS AQIs INSERT QUERY
    const values: any[][] = stations
        .filter(s => s?.aqis !== null && s?.aqis !== undefined)
        .map(s => flattenAQIsForInsertion(s))
        .flat();

    const query = format(
        `INSERT INTO ${STATION_AQI_TABLE} (station_key, timestamp, pollutant, value)
        VALUES %L
        ON CONFLICT (station_key, timestamp, pollutant) 
        DO UPDATE SET
            value = EXCLUDED.value,
            last_updated = CURRENT_TIMESTAMP
        ;`,
        values
    );

    try {
        await pool.query(query);
    } catch (err) {
        console.log(`Failed to insert AQIs: `, err)
    }
}

async function removeNonexistentStations(stations: StationRecord[]): Promise<StationRecord[]> {
    const { rows } = await pool.query('SELECT station_key FROM stations');
    const validKeys = new Set(rows.map(r => r.station_key));

    const validStations = stations.filter(s => validKeys.has(s.station_key));
    if (validStations.length < stations.length) {
        console.warn(`Time to update station metadata. The following stations are not in the table yet: ${stations.filter(s => !validKeys.has(s.station_key))}`)
    }

    return validStations;
}

export async function updateStationMeasurements() {
    // fetch from AB gov API
    let apiStart = Date.now();
    const stationsRaw = await fetch_all_stations();
    const stationsFiltered: StationRecord[] = Object.values(stationsRaw).filter(s => s !== null);
    const stations: StationRecord[] = await removeNonexistentStations(stationsFiltered);

    // const apiDuration = Date.now() - apiStart;
    // console.log(`Took ${(apiDuration/1000)} s (${(apiDuration/1000)/60} minutes) to fetch station data`)

    await insertStationMeasurementAll(stations);
    await insertAQIsAll(stations);
}


// DEBUG ONLY
// updates stations from local JSON files
async function updateStationsFromVolume() {
    // fetch all stations whose readings are older than an hour
    const measurements = getFilesFromDir('../../../volumes/station_data');
    console.log(`${measurements.length} measurements loaded`);

    for (const hourlyMeasurement of measurements) {

        // const hourlyMeasurement = sample_measurements;
        console.log(`update database for ${hourlyMeasurement.timestamp}`)
    
        // const stationsToUpdate: any = [];
        const stationsToUpdate: any = Object.keys(hourlyMeasurement.readings);
        const stations = stationsToUpdate.map(key => hourlyMeasurement.readings[key]).filter(s => s !== null);
    
        await insertStationMeasurementAll(stations);

    }
}

