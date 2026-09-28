/**
 * Inserts ECCC regional readings into Postgres tables.
 * 
 * Fetches from the following two data sources:
 * - GeoMet API (docs)[https://api.weather.gc.ca/openapi?f=html#/aqhi-observations-realtime/getAqhi-observations-realtimeFeatures]
 * - MSC Datamart (docs)[https://dd.meteo.gc.ca/today/air_quality/doc/]
 */

import { pool } from "./pools";
import format from "pg-format"

import { RegionReading } from "../types/contracts"
import { getGeoMetRegionalReadings, getDatamartFile } from "../services/regions/hourlyReadingsSync";

// import {_read_data, _write_data } from "../utils"
import { REGION_TABLE, REGION_READINGS, STATION_READINGS, DATAMART_AQHI_READINGS } from "./table_names"





async function insertRegionalAqhiReadings(readings: RegionReading[]) {

    let readingsToInsert = readings;

    // --- COMPARE TO CURRENTLY EXISTING STATIONS IN `stations` TABLE
    const apiRegionIds = [...new Set(readingsToInsert.map(r => r.id))];

    // compare ids from API to ids currently in table
    const { rows: existingRows } = await pool.query(`SELECT id FROM ${REGION_TABLE};`);
    const tableRegionIds = new Set(existingRows.map(r => r.id));
    const missingIds = apiRegionIds.filter(id => !tableRegionIds.has(id));

    if (missingIds.length > 0) {
        console.warn(`⚠️ ECCC metadata mismatch: Found ${missingIds.length} new regions in API data not present in DB:`, missingIds);
        console.log(`Happens if monthly station cronjob hasn't updated regions metadata. Run the cronjob manually to remove this message.`);
        
        // filter out regions not in table
        // otherwise causes a foreign key constraint violation
        readingsToInsert = readingsToInsert.filter(r => tableRegionIds.has(r.id));
    }

    // --- INSERT READINGS INTO TABLE

    const values = readingsToInsert.map(r => [
        r.id, r.timestamp, r.aqhi
    ]);

    const sqlQuery = format(
        `INSERT INTO ${REGION_READINGS} (region_id, timestamp, aqhi)
        VALUES %L
        ON CONFLICT (region_id, timestamp) 
        DO UPDATE SET 
            aqhi    = EXCLUDED.aqhi,
            last_updated = CURRENT_TIMESTAMP
        ;`,
        values
    );

    try {
        await pool.query(sqlQuery);
    } catch (err) {
        console.log(`Failed to insert region readings into table: `, err);
        throw err;
    }
}


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** To be used as backup AQHI value,
 * and to fetch individual AQHI stations (when applicable).
 * 
 * @param readings 
 */
async function insertDatamartReadings(readings: RegionReading[]) {

    // get datamart links from region metadata (table)
    const region_ids = readings.map(r => r.id);
    const { rows } = await pool.query(`SELECT id,datamart_link FROM ${REGION_TABLE};`);
    const regionsToCheck = rows.filter(r => region_ids.includes(r.id));

    // maps region ID to datamart URL
    const datamartLinkMap = new Map(regionsToCheck.map(r => [r.id, r.datamart_link]));

    // populate with retrieved datamart data
    const regionToDatamartDataMap = new Map(regionsToCheck.map(r => [r.id, null]));

    // access each datamart link
    for (const geomet_reading of readings) {
        const region_id = geomet_reading.id;

        const url = datamartLinkMap.get(region_id);
        console.log(url);

        try {
            const datamart_data = await getDatamartFile(url, false);
            delay(500);
            // _write_data(`./outputs/datamart/${region_id}.json`, datamart_data);
            
            // const datamart_data = _read_data(`./outputs/datamart/${region_id}.json`)
            regionToDatamartDataMap.set(region_id, datamart_data);
            
        } catch (err) {
            console.error(`Failed to fetch datamart file for ${region_id}: ${err}`);
            continue;
        }
    }

    // --- Insert all datamart info into table

    // Insert backup AQHI values

    const datamartBackupValues = [...regionToDatamartDataMap.entries()].map(([id, data]) => [id, data.timestamp, data.aqhi]);
    console.log(datamartBackupValues)
    const backupAqhiQuery = format(
        `INSERT INTO ${DATAMART_AQHI_READINGS} (region_id, timestamp, aqhi)
        VALUES %L
        ON CONFLICT (region_id, timestamp) 
        DO UPDATE SET 
            aqhi    = EXCLUDED.aqhi,
            last_updated = CURRENT_TIMESTAMP
        ;`,
        datamartBackupValues
    );


    // Insert AQHI per station
    const values = []
    for (const [id, data] of regionToDatamartDataMap.entries()) {
        const stationsList = data.stations.map(s => [id, data.timestamp, s.aqhi || null, s.napsid, s.nameEn]);
        values.push(...stationsList);
    }

    const stationReadingsQuery = format(
        `INSERT INTO ${STATION_READINGS} (region_id, timestamp, aqhi, naps_id, name)
        VALUES %L
        ON CONFLICT (region_id, timestamp, naps_id) 
        DO UPDATE SET 
            aqhi    = EXCLUDED.aqhi,
            last_updated = CURRENT_TIMESTAMP
        ;`,
        values
    );

    try {
        await pool.query(backupAqhiQuery);
        await pool.query(stationReadingsQuery);
    } catch (err) {
        console.log(`Failed to insert datamart data into table: `, err);
        throw err;
    }
}



export async function updateRegionAqhis() {
    // fetch from GeoMet API
    const readings = await getGeoMetRegionalReadings();

    console.log('Inserting regions into db...');
    await insertRegionalAqhiReadings(readings);

    console.log('Fetching datamart files...');
    await insertDatamartReadings(readings);
    
}



(async () => {
    const thing = await updateRegionAqhis();
})
// ();