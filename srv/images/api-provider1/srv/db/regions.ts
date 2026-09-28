/**
 * Returns regional AQHI readings across Canada.
 * 
 * Pulls from four tables:
 * - region metadata
 * - hourly AQHI readings by region
 * - individual station measurements (when applicable)
 * - (backup) hourly AQHI readings from MSC datamart
 */


import { runQuery } from "./pool";
import { RegionReading } from "../types/contracts";
import {_read_data, _write_data, getFilesFromDir} from "../utils"
import { REGION_TABLE, REGION_READINGS, STATION_READINGS, DATAMART_AQHI_READINGS } from "./table_names"



export async function getLatestRegionalAqhis(): Promise<RegionReading[]> {

    const query = `
        -- Main Table: REGION_TABLE
        SELECT 
            json_build_object(
                'region_id', r.id,
                'name', r.name,
                'lat', r.lat,
                'lon', r.lon,

                'timestamp', rd.timestamp,
                'aqhi', rd.aqhi,
                'backup_aqhi', datamart_backup.aqhi,

                'stations', rd.station_readings
            ) as data
        FROM ${REGION_TABLE} r

        -- Add Regional and Station Readings
        JOIN (
            SELECT DISTINCT ON (region_id) 
                *,
                (
                    SELECT 
                        COALESCE(
                        json_agg(
                        json_build_object(
                            'naps_id', srd.naps_id,
                            'name', srd.name,
                            'timestamp', srd.timestamp,
                            'aqhi', srd.aqhi
                        )
                        ),
                            '[]'::json
                        )
                    FROM ${STATION_READINGS} srd
                    WHERE srd.region_id = rr.region_id 
                    AND srd.timestamp = rr.timestamp
                ) as station_readings
            FROM ${REGION_READINGS} rr
            ORDER BY region_id, timestamp DESC
        ) rd ON r.id = rd.region_id

        -- Add Datamart's Backup AQHI
        LEFT JOIN (
            SELECT DISTINCT ON (region_id) *
            FROM ${DATAMART_AQHI_READINGS}
            ORDER BY region_id, timestamp DESC
        ) datamart_backup 
            ON datamart_backup.region_id = rd.region_id
            AND datamart_backup.timestamp = rd.timestamp;
    `;

    try {

        const res = await runQuery(query);
        const { rows } = res;
        const data = rows.map(r => r.data);
    
        return data as RegionReading[];
    } catch (err) {
        console.error('Error: ', err, '\nQuery failed. If this is a "non-existent relation" failure, make sure the cron provider runs first so it can set up the database.');
        throw new Error(err);
    }
}

(async () => {

    const data = await getLatestRegionalAqhis();
    console.log(data)
})
// ();