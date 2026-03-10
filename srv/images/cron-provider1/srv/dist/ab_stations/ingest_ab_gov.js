"use strict";
/** Fetches air quality data from Federal Monitoring Stations
 *
 * Note: Some readings for a station will be reported as null (eg. AQHI, PM2.5, NO2).
 *  Whether a reading is set to null depends on:
 *      - the time window requested:
 *          if no readings appear within the last 3 hours, set to null
 *
 * The entire station object will be null if there are no readings whatsoever
 * for the given time window.
 *
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetch_all_stations = fetch_all_stations;
const p_queue_1 = __importDefault(require("p-queue"));
// import { Client } from 'pg';
const utils_1 = require("./utils");
const manual_aqhi_1 = require("./manual_aqhi");
// const client = new Client({
//   connectionString: process?.env?.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/air_quality_data"
// });
// const STATION_TABLE = process?.env?.DB_NAME || 'stations';
// the parameters we want to report for each station
// see here for full list of allowed parameters:
// https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json&$select=Name&$orderby=Name
const POLLUTANT_MAP = {
    'Nitrogen Dioxide': 'no2',
    'Sulphur Dioxide': 'so2',
    'Fine Particulate Matter': 'pm25',
    'Ozone': 'o3',
    'Carbon Monoxide': 'co',
    'Hydrogen Sulphide': 'h2s'
};
const STATION_RECORD_POLLUTANTS = Object.values(POLLUTANT_MAP);
// doesn't matter if it's the API naming schema or ours
function isPollutant(val) {
    return Object.keys(POLLUTANT_MAP).includes(val)
        || STATION_RECORD_POLLUTANTS.includes(val);
}
// what to query from the API
const STATION_PARAM_MAPPING = {
    // key: property name from API
    // value: what we'll use as the property name
    'Air Quality Health Index': 'aqhi',
    'Air Quality Index': 'aqi',
    ...POLLUTANT_MAP
};
const API_PARAMS = Object.keys(STATION_PARAM_MAPPING);
function isAPIStationParam(val) {
    return API_PARAMS.includes(val);
}
/* Example station object:
    "139" : {
        "StationKey" : 139,
        "StationName" : "Edmonton East",
        "ReadingDate" : "2025-11-07T18:00:00-07:00",
        "AQHI" : 1,
        "NO2" : 0.008,
        "PM2" : 4.9,
        "SO2" : -1,
        "O3" : 0.008,
        "lat" : 53.5482115,
        "lon" : -113.3680856,
        "gov_aqhi" : null  // not used - get rid of this
    },
*/
// only "DeterminantParameterName" returns useful values despite not appearing in the docs
// try "ParameterName" if it stops returning useful data
const parameterKey = "DeterminantParameterName";
const TIME_WINDOW_HOURS = 3; // readings older than this are rejected
/********************************************
 * ACA STATION DATA FUNCTIONS
 ********************************************/
/** Fetches an up-to-date list of federal monitoring stations in Alberta.
 * Used to fetch each station's corresponding pollutant data.
 *
 */
async function fetch_station_keys() {
    const url = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Stations?$format=json&$select=StationKey,Name&$orderby=StationKey`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        const data = await response.json();
        const stationKeys = data.value
            .map(({ StationKey, Name }) => {
            const key = (0, utils_1.parseNumber)(StationKey);
            if (key === null || key <= 0) {
                console.log(`Station ${Name} filtered out - has non numerical key: ${StationKey}`);
                return null;
            }
            return key;
        })
            .filter(key => key !== null);
        return stationKeys;
    }
    catch (err) {
        throw new Error(`Could not fetch ACA station keys: ${err}`);
    }
}
function _format_parameter_names(parameters, parameter_name = parameterKey) {
    if (!parameters || parameters.length === 0)
        return "";
    const conditions = parameters.map(p => `${parameter_name} eq '${p}'`);
    return `(${conditions.join(" or ")})`;
}
// double checking metadata
function _format_url_pollutant_units() {
    // url: https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json&$select=Name,UnitCode&$filter=(Name%20eq%20%27Nitrogen%20Dioxide%27%20or%20Name%20eq%20%27Sulphur%20Dioxide%27%20or%20Name%20eq%20%27Fine%20Particulate%20Matter%27%20or%20Name%20eq%20%27Ozone%27%20or%20Name%20eq%20%27Carbon%20Monoxide%27%20or%20Name%20eq%20%27Hydrogen%20Sulphide%27)
    const baseUrl = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters`;
    const pollutant_names = Object.keys(POLLUTANT_MAP);
    // format query parameters
    const queryParams = {
        $filter: `${_format_parameter_names(pollutant_names, "Name")}`,
        $select: `Name,UnitCode,UnitCodeName`,
        $format: 'json'
    };
    const url = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    return url;
}
async function get_pollutant_units() {
    const url = _format_url_pollutant_units();
    let units = null;
    try {
        // console.log(url)
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        const jsonObj = await response.json();
        const data = jsonObj.value;
        // format into object
        units = data.reduce((acc, pollutant) => {
            acc[pollutant.Name] = {
                units: pollutant.UnitCode,
                fullName: pollutant.UnitCodeName
            };
            return acc;
        }, {});
    }
    catch (err) {
        console.log(`Could not fetch pollutant units: ${err}`);
    }
    return units;
}
function get_full_url(stationKey, stationParams, hoursTimeRange = TIME_WINDOW_HOURS, beforeThisTime = null) {
    const baseUrl = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/StationMeasurements`;
    // format query parameters
    const queryParams = {
        $filter: `${_format_parameter_names(stationParams)} and StationKey eq ${stationKey} and Value ne null`,
        $select: `StationName,${parameterKey},Value,ReadingDate,StationKey,ParameterKey`,
        $orderby: 'ReadingDate desc',
        $expand: 'Station($select=Latitude,Longitude)', // fetches coordinates from 'Station' navigation property (odata_)
        $format: 'json'
    };
    if (hoursTimeRange) {
        // optional time range filter - if you want to ignore all readings older than 12 hours
        const baseDate = beforeThisTime ? new Date(beforeThisTime) : new Date();
        const ts_limit_upper = new Date(baseDate.getTime() - (hoursTimeRange * 60 * 60 * 1000));
        const formatted_timestamp = ts_limit_upper.toISOString();
        queryParams['$filter'] += ` and ReadingDate ge ${formatted_timestamp}`;
    }
    if (beforeThisTime !== null) {
        // to get historical data
        const formatted_timestamp = (new Date(beforeThisTime)).toISOString();
        queryParams['$filter'] += ` and ReadingDate le ${formatted_timestamp}`;
    }
    // console.log(queryParams)
    const url = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
    return url;
}
/** Fetches recent air quality measurement data for a specific ACA monitoring station
 * from Alberta Environment's OData API.
 *
 * @param stationName - The human-readable name of the station to fetch data for.
 * @param stationParams - A list of pollutant or parameter names used to build the query filter.
 *                        Defaults to the global `STATION_PARAMS` constant.
 * @param hoursTimeRange - The time window, in hours, used to restrict readings to recent values.
 *                         Defaults to 12 (last 12 hours).
 *
 * @returns A promise resolving to an array of `StationRecord` objects, where each entry includes:
 *          - `StationName`: Station name string.
 *          - `ParameterName`: Parameter or pollutant name.
 *          - `Value`: Numeric measurement value (nullable).
 *          - `ReadingDate`: ISO timestamp of the reading.
 *          - `StationKey`: Unique internal key identifying the station.
 *          - `ParameterKey`: Unique key identifying the parameter.
 *
 * @throws An error if the network request fails, the response is invalid, or the API returns a non-200 status.
 */
async function fetch_ACA_station_data(stationKey, stationParams = API_PARAMS, hoursTimeRange = TIME_WINDOW_HOURS, beforeThisTimestamp = null) {
    const url = get_full_url(stationKey, stationParams, hoursTimeRange, beforeThisTimestamp);
    // console.log(url);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }
        const data = await response.json();
        return data.value;
    }
    catch (err) {
        throw new Error(`Could not fetch ACA station data: ${err}`);
    }
}
/**
 * --- PROCESS RAW STATION DATA
 * Input: One station's readings in the last 3 hours
 * Output: Record<Date, StationRecord>
 *
 * Steps:
 *  - group raw readings by date (should have 3 groups, one for each hour)
 *  - for each date: construct a StationRecord
 *  - return StationRecords, indexed by date
 */
// All raw readings should belong to ONE station only
// includes multiple reading dates
const groupRawReadingsByDate = (station_data_raw) => {
    const grouped = station_data_raw.reduce((acc, reading) => {
        const date = new Date(reading.ReadingDate);
        const timestamp = date.toISOString();
        if (!acc[timestamp])
            acc[timestamp] = [];
        acc[timestamp].push(reading);
        return acc;
    }, {});
    return grouped;
};
/** Process raw station data into a single StationRecord.
 *
 * Assumes:
 *      - all readings are for one station only
 *      - all readings are for one timestamp only
 *      - measurements are sorted descending by ReadingDate
 *
 * Design decision (to note):
 *      The station's timestamp is defined by the most recent reading.
 *       Eg. if AQHI is the most recent measurement, then the station will
 *          go by the AQHI measurement's timestamp, even if its O3
 *          measurement was taken an hour behind.
 *      In practice, we'll still want to keep these measurements
 *          since they'll only be an hour or so behind the most recent one.
 *
 *
 * @param station_data - An array of measurements for a single station.
 *  Each record contains the reading for only one pollutant/AQHI reading at a time.
 * @returns {Promise<StationRecord | null>} - Returns null if there was no station data
 *  for the given time window.
 */
function constructStationRecord(station_data) {
    if (!station_data || station_data.length === 0)
        return null;
    // only one date for all measurements here
    const dates = station_data.map(r => new Date(r.ReadingDate).getTime());
    const uniqueTimestamps = new Set(dates);
    if (uniqueTimestamps.size !== 1) {
        console.warn(`Data Mismatch: Found ${uniqueTimestamps.size} distinct timestamps for station ${station_data[0]?.StationKey}`);
        return null;
    }
    const validTimestamp = dates[0];
    33;
    const timestampUTC = new Date(validTimestamp);
    // metadata setup
    const firstReading = station_data[0];
    const metadata = {
        station_key: firstReading.StationKey,
        name: firstReading.StationName,
        lat: firstReading.Station?.Latitude ?? null,
        lon: firstReading.Station?.Longitude ?? null,
    };
    // initialize all pollutant readings to null
    const readings = Object.fromEntries(STATION_RECORD_POLLUTANTS.map(pollutant => [pollutant, null]));
    // initialize station record
    const station_record = {
        ...metadata,
        timestamp: timestampUTC,
        raw_timestamp: firstReading.ReadingDate,
        readings: readings,
        aqhi: null,
        aqi: null
    };
    // collapse all readings into one stationrecord
    for (const reading of station_data) {
        const paramName = reading[parameterKey];
        if (!paramName)
            continue;
        if (!isAPIStationParam(paramName)) {
            console.log(`${parameterKey} is not a valid parameter. Valid parameters: ${API_PARAMS}`);
            continue;
        }
        const stationRecordKey = STATION_PARAM_MAPPING[paramName];
        const val = reading.Value;
        if (isPollutant(stationRecordKey)) {
            // pollutant reading
            station_record.readings[stationRecordKey] = val;
        }
        else {
            // AQHI or AQI
            const keyLowered = stationRecordKey.toLowerCase();
            if (keyLowered === "aqhi")
                station_record.aqhi = val;
            else if (keyLowered === "aqi")
                station_record.aqi = val;
        }
    }
    return station_record;
}
/**
 * Transforms a list of station readings from the past 3 hours
 * to StationRecords, indexed by timestamp.
 *
 * All readings must come from the same station.
 *
 * @param raw_readings Readings from the past 3 hours, from the same station
 * @returns
 */
function processRawStationData(raw_readings) {
    const groupedReadings = groupRawReadingsByDate(raw_readings);
    const stationRecords = {};
    // StationRecords indexed by timestamp
    for (const [timestamp, readings] of Object.entries(groupedReadings)) {
        stationRecords[timestamp] = constructStationRecord(readings);
    }
    return stationRecords;
}
async function fetch_all_stations() {
    const stationKeys = await fetch_station_keys();
    // maps station readings to their key
    const stationMap = Object.fromEntries(stationKeys.map(key => [key, null]));
    // initialize queue
    const queue = new p_queue_1.default({
        concurrency: 5, // up to 5 active requests at once
        intervalCap: 3, // no more than x requests per second
        interval: 2000, // rate limit window
        carryoverIntervalCount: true // keep flow steady between intervals
    });
    // add jobs to queue
    for (const key of stationKeys) {
        queue.add(async () => {
            try {
                const raw = await fetch_ACA_station_data(key);
                const dataPast3Hours = processRawStationData(raw);
                const record = appendManualAQHI(dataPast3Hours);
                stationMap[key] = record;
                console.log(`Processed station key ${key}`);
            }
            catch (err) {
                console.warn(`Failed for station key ${key}: ${err.message}`);
            }
        });
    }
    await queue.onIdle();
    return stationMap;
}
/**
 * Requires readings from previous 3 hours to calculate the AQHI
 */
function appendManualAQHI(recordsByTimestamp) {
    const { aqhi, aqis_ranked, extraInfo } = (0, manual_aqhi_1.execute_AQHI_calculation_flow)({ readingsByTimestamp: recordsByTimestamp });
    const timestamps = Object.keys(recordsByTimestamp).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (timestamps.length === 0)
        return null; // no data from the past 3 hours
    // most recent record
    let recordNow = recordsByTimestamp[timestamps[0]];
    return {
        ...recordNow,
        manual_aqhi: aqhi,
        aqis: aqis_ranked,
        extraInfo
    };
}
