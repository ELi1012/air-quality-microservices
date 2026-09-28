/**
 * To update metadata of PurpleAir sensors and FEM stations.
 * 
 * To check monthly:
 * - new registered sensor indexes in Canada
 * - changes to ECCC regions
 * 
 * Note:
 * - If a sensor is relocated (ie. lat/lon changes),
 *      it gets a new sensor index and the old sensor index
 *      is archived by PurpleAir.
 *      The code will exclude that old archived sensor index
 *      from updating the sensor_readings table if its data is
 *      older than a month.
 */



import { pool } from "./pools"
import format from "pg-format"

import { addNewMembers, type SensorAddingResponse, getCurrentMembers, type MembersMetadataResponse } from "../services/purpleair/metadata"

import { SENSOR_TABLE, REGION_TABLE } from "./table_names"

import { getGeoMetRegionalMetadata } from "../services/regions/metadataSync"



/**
 * Gets currently existing members in self-defined PurpleAir group.
 * Use if initializing empty table.
 * 
 * @returns void
 */
export async function updatePurpleairMetadata() {
    const data = await getCurrentMembers();
    const rows = data.data;

    if (rows.length === 0) {
        console.warn('No members found');
        return
    }

    // confirm that data.data.fields is [sensor_index, name, latitude, longitude]
    // exact name and exact order

    const query = format(
        `INSERT INTO ${SENSOR_TABLE} (sensor_index, name, latitude, longitude)
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

    try {
        await pool.query(query);
    } catch (err) {
        console.log(`Failed to update metadata: `, err)
        throw err
    }

    console.log('Updated purpleair metadata');
}



/**
 * Adds new members to database and purpleair group.
 * 
 * @returns void
 */
export async function addNewPurpleairMembers() {

    // make sure sensors exist in table first
    await updatePurpleairMetadata();

    const newMembers = await addNewMembers();
    if (newMembers.length === 0) return;

    // format members for insertion into db
    const rows: [number, string, number, number][] = newMembers
        .map(res => res.sensor)
        .map(s => [s.sensor_index, s.name, s.latitude, s.longitude]);

    const query = format(
        `INSERT INTO ${SENSOR_TABLE} (sensor_index, name, latitude, longitude)
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

    try {
        await pool.query(query);
    } catch (err) {
        console.log(`Failed to update metadata: `, err)
        throw err
    }

    console.log('Added new purpleair members to database');
}



export async function updateRegionMetadata() {
    const metadata = await getGeoMetRegionalMetadata();

    const values = metadata.map(s => [
        s.id,
        s.name,
        s.lat,
        s.lon,
        s['url_msc-datamart_observation']
    ]);

    const query = format(
        `INSERT INTO ${REGION_TABLE} (id, name, lat, lon, datamart_link)
        VALUES %L
        ON CONFLICT (id) 
        DO UPDATE SET 
            name = EXCLUDED.name, 
            lat = EXCLUDED.lat, 
            lon = EXCLUDED.lon,
            datamart_link = EXCLUDED.datamart_link,
            last_updated = NOW()`,
        
        values
    );

    try {
        await pool.query(query)
    } catch (err) {
        console.error(`Could not update ECCC region metadata: `, err);
        throw err
    }

    console.log('Updated region metadata');
}

