/**
 * Table names.
 * 
 * These should match the table names in cron-provider1.
 */



// ECCC - Region Tables
const ECCC_AQHI_SCHEMA = 'eccc_aqhi'
const REGION_TABLE = `${ECCC_AQHI_SCHEMA}.regions`;
const REGION_READINGS = `${ECCC_AQHI_SCHEMA}.region_readings`;
const STATION_READINGS = `${ECCC_AQHI_SCHEMA}.station_readings`;    // different schema than AB gov stations
const DATAMART_AQHI_READINGS = `${ECCC_AQHI_SCHEMA}.datamart_readings`;     // used as backup AQHI value


// PURPLEAIR - Sensor Tables
const SENSOR_TABLE = 'sensors';
const SENSOR_READINGS = 'sensor_readings';

export {
    ECCC_AQHI_SCHEMA,
    REGION_TABLE,
    REGION_READINGS,
    STATION_READINGS,
    DATAMART_AQHI_READINGS,

    SENSOR_TABLE,
    SENSOR_READINGS
}