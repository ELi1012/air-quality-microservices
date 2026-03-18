import { pool } from "./pools"
import format from "pg-format"

import { get_group_metadata } from "../services/purpleair/ingest"
import { fetchAllStations, fetchStationMetadata } from "../services/stations/stations"

import {_read_data, _write_data, getFilesFromDir} from "../utils"

import { STATION_TABLE, SENSOR_TABLE } from "./table_names"


// run this every month (purpleair)
export async function updatePurpleairMetadata() {
    const res = await get_group_metadata();
    if (res === undefined) return;

    const fields = res.fields;
    const rows: [number, string, number, number] = res.data;

    const query = format(
        `INSERT INTO ${SENSOR_TABLE} (${fields.join(",")})
        VALUES %L
        ON CONFLICT (sensor_index) 
        DO UPDATE SET 
            name            = EXCLUDED.name,
            latitude        = EXCLUDED.latitude,
            longitude       = EXCLUDED.longitude,
            last_updated    = CURRENT_TIMESTAMP
        ;`,
        rows
    );

    console.log(query)

    const now = Date.now();
    try {
        await pool.query(query);
    } catch (err) {
        console.log(`Failed to update metadata: `, err)
    }

    const duration = Date.now() - now;
    console.log(`took ${duration/1000} s`);
}



export async function updateStationMetadata() {
    const stations_metadata = await fetchAllStations();

    const values = stations_metadata.map(s => [
        s.StationKey,
        s.Name,
        s.Latitude,
        s.Longitude
    ]);

    const query = format(
        `INSERT INTO ${STATION_TABLE} (station_key, name, lat, lon)
        VALUES %L
        ON CONFLICT (station_key) 
        DO UPDATE SET 
            name = EXCLUDED.name, 
            lat = EXCLUDED.lat, 
            lon = EXCLUDED.lon,
            last_updated = NOW()`,
        
        values
    );

    try {
        await pool.query(query)
    } catch (err) {
        console.error(`Could not update station metadata: `, err);
    }

}


