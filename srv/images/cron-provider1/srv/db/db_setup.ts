/**
 * RUN FIRST WHEN STARTING CRON PROVIDER INSTANCE.
 * 
 * Creates tables.
 * 
 */

import { pool } from "./pools"
import { updatePurpleairMetadata, updateRegionMetadata } from "../db/metadata";


import {
    ECCC_AQHI_SCHEMA,
    REGION_TABLE,
    REGION_READINGS,
    STATION_READINGS,
    DATAMART_AQHI_READINGS,

    SENSOR_TABLE,
    SENSOR_READINGS
} from "./table_names"



const regionTablesQuery = `
    -- REGIONS
    CREATE SCHEMA IF NOT EXISTS ${ECCC_AQHI_SCHEMA};

    CREATE TABLE IF NOT EXISTS ${REGION_TABLE} (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DECIMAL(10,7) NOT NULL,
        lon DECIMAL(10,7) NOT NULL,
        datamart_link TEXT,
        last_updated TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${REGION_READINGS} (
        region_id TEXT,
        timestamp TIMESTAMPTZ NOT NULL,
        aqhi DECIMAL(4, 2),
        last_updated TIMESTAMPTZ DEFAULT NOW(),

        PRIMARY KEY (region_id, timestamp),
        FOREIGN KEY (region_id) REFERENCES ${REGION_TABLE}(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${STATION_READINGS} (
        region_id TEXT,
        timestamp TIMESTAMPTZ NOT NULL,
        aqhi DECIMAL(4, 2),
        naps_id TEXT,
        name TEXT,
        last_updated TIMESTAMPTZ DEFAULT NOW(),

        PRIMARY KEY (region_id, timestamp, naps_id),
        FOREIGN KEY (region_id) REFERENCES ${REGION_TABLE}(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${DATAMART_AQHI_READINGS} (
        region_id TEXT,
        timestamp TIMESTAMPTZ NOT NULL,
        aqhi DECIMAL(4, 2),
        last_updated TIMESTAMPTZ DEFAULT NOW(),

        PRIMARY KEY (region_id, timestamp),
        FOREIGN KEY (region_id) REFERENCES ${REGION_TABLE}(id) ON DELETE CASCADE
    );
`

const paTablesQuery = `
    
    -- PURPLEAIR
    CREATE TABLE IF NOT EXISTS ${SENSOR_TABLE} (
        sensor_index INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        last_updated TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${SENSOR_READINGS} (
        sensor_index INT REFERENCES sensors(sensor_index),
        last_seen BIGINT NOT NULL,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        
        -- PM2.5 Readings
        "pm2.5_10minute" REAL,
        "pm2.5_30minute" REAL,
        "pm2.5_60minute" REAL,
        "pm2.5_6hour" REAL,
        "pm2.5_24hour" REAL,

        
        -- Other
        humidity REAL,
        
        PRIMARY KEY (sensor_index, last_seen)
    );
`


export async function createAllTables() {
    try {
        await pool.query(paTablesQuery);
        await pool.query(regionTablesQuery);
    } catch (err) {
        console.error('Could not create tables: ', err);
        console.warn('Cronjobs cannot run without tables set up.');
    }
}


// for debugging only
async function dropAllTables() {
    // `regions` tables live in the `eccc_aqhi` schema
    // all other tables live in `public` schema
    const query = `
        DO $$ 
        DECLARE 
            r RECORD;
        BEGIN
            FOR r IN (
                SELECT schemaname, tablename 
                FROM pg_tables 
                WHERE schemaname IN ('public', 'eccc_aqhi')
            ) LOOP
                EXECUTE 'DROP TABLE IF EXISTS ' 
                    || quote_ident(r.schemaname) || '.' 
                    || quote_ident(r.tablename) 
                    || ' CASCADE';
            END LOOP;
        END $$;
    `
    try {
        await pool.query(query);
    } catch (err) {
        console.error('Could not drop tables: ', err)
    }
}


(async () => {

    await createAllTables();
    await updatePurpleairMetadata();
    await updateRegionMetadata();

})();