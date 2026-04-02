/**
 * RUN FIRST WHEN STARTING CRON PROVIDER INSTANCE.
 * 
 * Creates tables.
 * 
 */

import { pool } from "./pools"
import { updatePurpleairMetadata } from "../db/metadata";
import { updateStationMetadata } from "../db/metadata"

import {
    STATION_TABLE,
    STATION_MEASUREMENTS,
    STATION_AQI_TABLE,

    SENSOR_TABLE,
    SENSOR_READINGS
} from "./table_names"


const tablesQuery = `
    -- STATIONS
    CREATE TABLE IF NOT EXISTS ${STATION_TABLE} (
        station_key INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lat DECIMAL(10,7) NOT NULL,
        lon DECIMAL(10,7) NOT NULL,
        last_updated TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${STATION_MEASUREMENTS} (
        station_key INT,
        timestamp TIMESTAMPTZ NOT NULL,
        raw_timestamp TEXT NOT NULL,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        
        -- Pollutant readings
        no2 REAL,
        so2 REAL,
        pm25 REAL,
        o3 REAL,
        co REAL,
        h2s REAL,
        
        -- AQI/AQHI values
        aqhi SMALLINT,
        aqi SMALLINT,
        manual_aqhi SMALLINT,

        extraInfo JSONB,
        
        -- Composite Primary Key
        PRIMARY KEY (station_key, timestamp),
        FOREIGN KEY (station_key) REFERENCES stations(station_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ${STATION_AQI_TABLE} (
        station_key INT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        pollutant TEXT NOT NULL,
        value REAL,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (station_key, timestamp, pollutant),
        FOREIGN KEY (station_key, timestamp) REFERENCES station_measurements(station_key, timestamp) ON DELETE CASCADE
    );



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
        await pool.query(tablesQuery)
    } catch (err) {
        console.error('Could not create tables: ', err)
    }
}


async function dropAllTables() {
    const query = `
    DROP TABLE ${STATION_AQI_TABLE};
    DROP TABLE ${STATION_MEASUREMENTS};
    DROP TABLE ${STATION_TABLE};

    DROP TABLE ${SENSOR_READINGS};
    DROP TABLE ${SENSOR_TABLE};
    `
    try {
        await pool.query(query)
    } catch (err) {
        console.error('Could not drop tables: ', err)
    }
}


(async () => {
    await createAllTables();
    await updatePurpleairMetadata();
    await updateStationMetadata();

})();