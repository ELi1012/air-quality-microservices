"use strict";
/**
 * Manual AQHI calculations.
 *
 * Government API service doesn't always provide an AQHI.
 * This file appends a fallback value for AQHI,
 * as well as manual AQI calculations.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute_AQHI_calculation_flow = execute_AQHI_calculation_flow;
// do not import anything fron ingest.ts
// contains util functions for manual AQHI calculations
// this includes AQI calculations too
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
const save_calculation_stats = true;
// ----- utility functions
// formats timestamp for readable folders
// for logging only
function getFolderName(ts) {
    const date = new Date(ts);
    // Using 'en-US' to ensure month abbreviations (Jan, Feb, etc.)
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${month}${day}_${hours}-${mins}-${secs}`;
}
// -------- MANUAL AQI CALCULATIONS
// need: a ranked list of pollutants and their AQIs
// Apply the following formula to each station's 6 AQI pollutants
//  using the current hourly reading to get the AQI value for each substance.
// TODO: double check that the units for all pollutants are in ppm
// except PM2.5, which is in ug/m3
// check here for units of each pollutant: https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json
// formulas come from the AQHI calculation flow, updated April 2024
function apply_aqi_formula({ no2, so2, co, o3, pm25, h2s }) {
    const isValid = (num) => (0, utils_1.parseNumber)(num) !== null;
    const pollutant_types = [
        "no2",
        "so2",
        "co",
        "o3",
        "pm25",
        "h2s"
    ];
    // initialize all to null
    const AQIs = Object.fromEntries(pollutant_types.map(p => [p, null]));
    if (isValid(no2)) {
        if (no2 <= 0.0505)
            AQIs["no2"] = 49.505 * no2 + 1;
        else if (no2 <= 0.1595)
            AQIs["no2"] = 27.523 * no2 + 2.1101;
        else
            AQIs["no2"] = 1.6295 * no2 + 6.2401;
    }
    if (isValid(so2)) {
        if (so2 <= 0.1005)
            AQIs["so2"] = 24.876 * so2 + 1;
        else if (so2 <= 0.1725)
            AQIs["so2"] = 41.667 * so2 - 0.6875;
        else
            AQIs["so2"] = 5.1903 * so2 + 5.6047;
    }
    if (isValid(co)) {
        if (co <= 13.5)
            AQIs["co"] = 0.18519 * co + 1;
        else
            AQIs["co"] = 0.028037 * co + 6.1215;
    }
    if (isValid(o3)) {
        if (o3 <= 0.0505)
            AQIs["o3"] = 49.505 * o3 + 1;
        else if (o3 <= 0.0765)
            AQIs["o3"] = 115.38 * o3 - 2.3269;
        else
            AQIs["o3"] = 68.182 * o3 + 1.2841;
    }
    if (isValid(pm25)) {
        AQIs["pm25"] = Math.max(1.0, Math.ceil(pm25 / 10.0));
    }
    if (isValid(h2s)) {
        if (h2s <= 0.0105)
            AQIs["h2s"] = 238.1 * h2s + 1;
        else if (h2s <= 1.0005)
            AQIs["h2s"] = 3.0303 * h2s + 3.4682;
        else
            AQIs["h2s"] = 0.33333 * h2s + 6.1665;
    }
    // sort AQIs by descending AQI value
    // pollutant with highest aqi is the "determining pollutant"
    const entries = Object.entries(AQIs);
    // all AQIs are null
    if (!entries.some(([p, val]) => val !== null))
        return null;
    const sortedAQIs = Object.entries(AQIs)
        .sort(([, valueA], [, valueB]) => valueB - valueA);
    return sortedAQIs;
}
function calculate_station_AQI(stationRecord, asOf) {
    const reference_timestamp = (0, utils_1.normalizeTimestamp)(asOf);
    // check if data is stale
    const timestamp = stationRecord.timestamp;
    // if older than an hour, report timestamp of last valid AQI set
    // const dataIsStale = (timestamp: Timestamp) => {
    //     const threshold = reference_timestamp - (1 * 60 * 60 * 1000);
    //     const readingTime = new Date(timestamp).getTime();
    //     return readingTime < threshold
    // }
    // if (dataIsStale(timestamp)) {
    //     console.log("Warning: AQI data is older than an hour");
    //     return null;
    // }
    const pollutantData = stationRecord.readings;
    // apply AQI calculation
    const aqis_unrounded = apply_aqi_formula(pollutantData) ?? null;
    if (save_calculation_stats) {
        const aqi_calculations = {
            "timestamp": timestamp,
            // "data_is_stale": dataIsStale(timestamp),
            // "missing_pollutants": Object.entries(pollutantData).filter(([k, v]) => v === null).map(([k, v]) => k),
            "pollutants_readings": pollutantData,
            "aqis_ranked": aqis_unrounded
        };
        (0, utils_1._write_data)(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/aqi_calculations.json`, aqi_calculations);
    }
    return aqis_unrounded;
}
// -------- MANUAL AQHI CALCULATIONS
// fetches timestamps no older than 3 hours ago
// and sorts from most to least recent
// note: since the API updates hourly, there should be no more than 3 timestamps
const getRelevantTimestamps = (timestamps, reference_timestamp) => {
    if (!timestamps || timestamps.length === 0)
        return [];
    const now = reference_timestamp;
    // threshold: no older than 3 hours ago
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const threshold = now - threeHoursInMs;
    // filter out timestamps older than threshold
    // important: use '>' instead of '>=' to avoid fencepost errors
    let recentTimestamps = timestamps
        .filter(ts => {
        const ms = new Date(ts).getTime();
        return ms > threshold && ms <= reference_timestamp;
    }).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (recentTimestamps.length > 3) {
        console.warn("more than 3 timestamps - only keeping most recent of the 3");
        recentTimestamps = recentTimestamps.slice(0, 3);
    }
    return recentTimestamps;
};
/** Reject if:
 * - current reading was over an hour ago (wrt reference timestamp)
 * - there is only one data point out of the three possible timeslots
 *
 * Assumptions:
 * - timestamps are sorted from most to least recent
 * - only includes 3 timestamps
 */
const aqhiCanBeCalculated = (reference_timestamp, sorted_timestamps, // most to least recent
station_records) => {
    // checks if NO2, O3, and PM2.5 are all missing
    const aqhi_3_pollutants_missing = (readings) => {
        const required = ['pm25', 'no2', 'o3'];
        return required.some(key => !(key in readings) || readings[key] == null);
    };
    let reasonIfFalse = null;
    if (!sorted_timestamps || sorted_timestamps.length === 0) {
        reasonIfFalse = "No station data in the last 3 hours - cannot calculate 3 hour average";
        return {
            canCalculate: false,
            reasonIfFalse
        };
    }
    // if latest reading was over an hour ago, reject
    // UPDATE: do not reject readings older than an hour (3 hr average)
    // const now = reference_timestamp;
    // const oneHourInMs = 60 * 60 * 1000;
    // const oneHourAgo = now - oneHourInMs;
    // const noneWithinLastHour = new Date(sorted_timestamps[0]).getTime() < oneHourAgo;
    // if (noneWithinLastHour) {
    //     console.log("⚠️ Data is stale. No readings received in the last 60 minutes.");
    //     return false;
    // }
    if (sorted_timestamps.length < 2) {
        const missing = 3 - sorted_timestamps.length;
        reasonIfFalse = `Cannot provide 3-hour average with ${missing} hours of missing station data`;
        console.log(`⚠️ ${reasonIfFalse}`);
        return {
            canCalculate: false,
            reasonIfFalse
        };
    }
    // check for null aqhis
    const valid_datapoints = sorted_timestamps
        .map(ts => station_records[ts].readings)
        .filter(r => !aqhi_3_pollutants_missing(r));
    if (valid_datapoints.length < 2) {
        const missing = 3 - valid_datapoints.length;
        reasonIfFalse = `Cannot provide 3-hour average with ${missing} hours of invalid pollutant data`;
        console.log(`⚠️ ${reasonIfFalse}`);
        return {
            canCalculate: false,
            reasonIfFalse
        };
    }
    return { canCalculate: true, reasonIfFalse };
};
// extracts the readings for the 3 AQHI pollutants (o3, no2, pm2.5)
// from an object whose keys are the timestamps of each reading
// assumes this list has only the relevant timestamps
const extract_AQHI_pollutant_readings = (records // each index corresponds to a timestamp
) => {
    // extract pollutants from last 3 hours
    const hourlyPollutants = records.map(record => {
        // each record corresponds to one timestamp
        return {
            o3_ppm: record.readings["o3"],
            no2_ppm: record.readings["no2"],
            pm25: record.readings["pm25"],
        };
    });
    return hourlyPollutants;
};
// calculates averages for the 3 AQHI pollutants (o3, no2, pm2.5)
const get_averages_for_AQHI_pollutants = (extractedPollutants) => {
    if (!extractedPollutants || extractedPollutants.length === 0)
        return {};
    // average pollutant readings across last 3 hours
    const getAverage = (data, key) => {
        if (!data)
            return undefined;
        const values = data.map(d => d[key]).filter(v => v !== null && v !== undefined);
        return values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : undefined;
    };
    return {
        o3_ppm: getAverage(extractedPollutants, 'o3_ppm'),
        no2_ppm: getAverage(extractedPollutants, 'no2_ppm'),
        pm25: getAverage(extractedPollutants, 'pm25')
    };
};
// note: these readings should be an average from the past 3 hours
function apply_AQHI_formula({ o3_ppm, no2_ppm, pm25 // AQHI formula is expecting units of ug/m3
 }) {
    if (no2_ppm === undefined || o3_ppm === undefined || pm25 === undefined)
        return null;
    // convert to ppb for the AQHI formula below
    const o3 = o3_ppm * 1000;
    const no2 = no2_ppm * 1000;
    const AQHI_unbounded = (1000 / 10.4) * ((Math.exp(0.000537 * o3) - 1)
        + (Math.exp(0.000871 * no2) - 1)
        + (Math.exp(0.000487 * pm25) - 1));
    return Math.max(1, AQHI_unbounded);
}
// note: will return null if no readings were made within the last 3 hours
function calculate_station_AQHI({ readingsByTimestamp, asOf }) {
    const reference_timestamp = (0, utils_1.normalizeTimestamp)(asOf);
    // sort for relevant readings
    const recentTimestamps = getRelevantTimestamps(Object.keys(readingsByTimestamp), reference_timestamp);
    const { canCalculate: continueCalculation, reasonIfFalse: reasonForMissingAQHI // show this for null AQHIs
     } = aqhiCanBeCalculated(reference_timestamp, recentTimestamps, readingsByTimestamp);
    const relevantReadings = recentTimestamps
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .map(ts => readingsByTimestamp?.[ts])
        .filter(reading => reading !== undefined && reading !== null);
    // extract and average pollutants
    const extractedPollutants = extract_AQHI_pollutant_readings(relevantReadings);
    const pollutantAverages = get_averages_for_AQHI_pollutants(extractedPollutants);
    // apply formula
    let aqhi = null;
    if (continueCalculation)
        aqhi = apply_AQHI_formula(pollutantAverages);
    // logging
    if (save_calculation_stats) {
        const aqhi_calculations = {
            "timestamps": recentTimestamps,
            "extracted_pollutants": extractedPollutants,
            "pollutant_averages": pollutantAverages,
            "aqhi_raw": aqhi,
            "insufficient_data": !continueCalculation
        };
        (0, utils_1._write_data)(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/aqhi_calculations.json`, aqhi_calculations);
    }
    return { aqhi, reasonForMissingAQHI };
}
// coerces nullish values of aqhi_given to 0
function use_AQI_instead({ determining_pollutant, highest_aqi, aqhi_given }) {
    const aqi = Math.round(highest_aqi ?? 0);
    const aqhi = aqhi_given ?? 0;
    if (aqi > aqhi) {
        if (determining_pollutant === "pm25")
            return true;
        if (aqi > 6)
            return true;
    }
    return false;
}
// if no reference timestamp provided, calculates AQHI
// as of right now.
// if asOf is provided, this becomes a historical analysis
function execute_AQHI_calculation_flow({ readingsByTimestamp, asOf = Date.now() }) {
    // setup
    const reference_timestamp = (0, utils_1.normalizeTimestamp)(asOf);
    console.log(`-------- start: ${(0, utils_1.formatToLocalISO)(new Date(reference_timestamp))}`);
    if (save_calculation_stats)
        fs.mkdirSync(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/`, { recursive: true });
    const extraInfo = {};
    // --- calculate AQHI for current hour
    const { aqhi, reasonForMissingAQHI } = calculate_station_AQHI({ readingsByTimestamp, asOf: reference_timestamp });
    if (reasonForMissingAQHI !== null)
        extraInfo['reasonForMissingAQHI'] = reasonForMissingAQHI;
    // --- calculate AQIs for each reading
    const recentTimestamps = getRelevantTimestamps(Object.keys(readingsByTimestamp), reference_timestamp);
    let raw_aqi = null;
    let determining_pollutant = null;
    let aqis = null;
    if (recentTimestamps.length > 0) {
        // get valid set of AQIs
        // if not found: check next record
        for (const [i, ts] of recentTimestamps.entries()) {
            const record = readingsByTimestamp[ts];
            const recordAQIs = calculate_station_AQI(record, reference_timestamp);
            // aqis that belong to the most recent station record
            if (i === 0)
                aqis = recordAQIs;
            if (recordAQIs !== null) {
                // differentiate between CURRENT AQIs and soonest valid AQIs
                if (i === 0) {
                    raw_aqi = aqis[0][1];
                    determining_pollutant = aqis[0][0];
                }
                else {
                    // valid set of AQIs is not from current reading
                    extraInfo['readings_older'] = {
                        pollutants: record.readings,
                        aqis: recordAQIs,
                        pollutants_timestamp: ts
                    };
                }
                break;
            }
        }
        // const mostRecentStationRecord = readingsByTimestamp[recentTimestamps[0]]
        // aqis = calculate_station_AQI(mostRecentStationRecord, reference_timestamp);
        // if (aqis !== null) {
        //     raw_aqi = aqis[0][1];
        //     determining_pollutant = aqis[0][0]
        // }
    }
    else {
        console.log(`Cannot calculate AQI: Could not find most recent timestamps wrt ${new Date(reference_timestamp).toISOString()}`);
    }
    // --- decide whether or not to use AQI instead of AQHI
    let final_aqhi = aqhi == null
        ? null
        : Math.round(aqhi);
    const use_aqi = use_AQI_instead({
        determining_pollutant,
        highest_aqi: raw_aqi,
        aqhi_given: aqhi
    });
    if (use_aqi)
        final_aqhi = Math.round(raw_aqi);
    if (save_calculation_stats) {
        // assumes that now is when the data was requested
        const stats = {
            "timestamp": (0, utils_1.formatToLocalISO)(new Date(asOf)),
            "final_aqhi": final_aqhi,
            "use_aqi_instead": use_aqi,
            "determining_pollutant": determining_pollutant,
            "raw_aqhi": aqhi,
            "raw_aqi": raw_aqi,
        };
        (0, utils_1._write_data)(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/overall_stats.json`, stats);
    }
    return {
        aqhi: final_aqhi,
        aqis_ranked: aqis,
        extraInfo
    };
}
const path_1 = __importDefault(require("path"));
// expect to skip two timestamps
// since those are the first two which will always be missing data
function mergeStationData(mainData, baseFolderPath, skipFirstTwo = true // set false if you've already excluded the first two
) {
    const mergedResults = {};
    const timestamps = Object.keys(mainData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const timestamps_asc = timestamps.reverse();
    for (const [i, timestamp] of timestamps_asc.entries()) {
        if (i < 2 && skipFirstTwo)
            continue;
        const record = mainData[timestamp];
        // Generate the expected folder name from the timestamp key
        const folderName = getFolderName(timestamp);
        // Construct the full path to the target JSON file
        const targetFile = path_1.default.join(baseFolderPath, folderName, 'overall_stats.json');
        let mergedRecord = {};
        if (fs.existsSync(targetFile)) {
            try {
                const fileContent = fs.readFileSync(targetFile, 'utf-8');
                const statsData = JSON.parse(fileContent);
                // MERGE STRATEGY: 
                // We spread statsData second, so it appends to the record.
                // If keys collide (e.g. both have 'aqhi'), statsData overwrites stationRecord.
                mergedRecord = {
                    given: record,
                    manual: statsData
                };
            }
            catch (err) {
                console.error(`Error parsing JSON at ${targetFile}:`, err);
            }
        }
        else {
            console.warn(`File not found for ${timestamp}: ${targetFile}`);
        }
        // augment data with aqhi stats
        const aqhi_stats_file = path_1.default.join(baseFolderPath, folderName, 'aqhi_calculations.json');
        if (fs.existsSync(aqhi_stats_file)) {
            try {
                const fileContent = fs.readFileSync(aqhi_stats_file, 'utf-8');
                const aqhiStats = JSON.parse(fileContent);
                const toKeep = {
                    insufficient_data: aqhiStats["insufficient_data"],
                    // invalid_pollutants: aqhiStats[]
                };
                if ("manual" in mergedRecord) {
                    mergedRecord.manual = {
                        ...mergedRecord["manual"],
                        ...toKeep
                    };
                }
            }
            catch (err) {
                console.error(`Error parsing JSON at ${aqhi_stats_file}:`, err);
            }
        }
        else {
            console.warn(`File not found for ${timestamp}: ${aqhi_stats_file}`);
        }
        mergedResults[timestamp] = mergedRecord;
    }
    return mergedResults;
}
(async () => {
    const stationKeys = [139, 140, 216];
    const stationKey = 140;
    // // --- get recent station data
    // // to fetch most recent, do `npm run test:aca` and note the filepath of the data saved
    // const station_records_filepath = `./outputs/station-records-${stationKey}.json`;
    // const station_records = _read_data(station_records_filepath) as Record<string, StationRecord>;
    // const timestamps = Object.keys(station_records)
    //     .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    // const timestamps_asc = timestamps.reverse()//.slice(0, 100);
    // for (const [i, timestamp] of timestamps_asc.entries()) {
    //     if (i < 2) {console.log(`skip ${timestamp}`); continue;}
    //     // if (!["2026-01-10T04:00:00-07:00"].includes(timestamp)) continue;  // to filter for particular timestamps
    //     const current_group = Object.fromEntries(
    //         timestamps
    //             .slice(i-2, i+1)
    //             .map(ts => [ts, station_records[ts]])     // get last 3
    //     );
    //     const final_aqhi = execute_AQHI_calculation_flow({
    //         readingsByTimestamp: current_group,
    //         asOf: new Date(timestamp)
    //     });
    //     console.log(`final aqhi: ${final_aqhi}`)
    //     console.log(' ');
    // }
    // // // merge data for comparison
    // const comparisons_path = `./outputs/comparisons/${stationKey}/comparison.json`
    // const mergedStationData = mergeStationData(station_records, "./outputs/calculation_stats")
    // _write_data(comparisons_path, mergedStationData);
    // // // do the comparison
    // // const thing = _read_data(comparisons_path);
    // const thing = mergedStationData;
    // const aqhis_mismatched = {}
    // const aqhis_match = {}
    // for (const [ts, record] of Object.entries(thing) as any) {
    //     if (record === undefined || Object.keys(record).length === 0) { console.log(`skipping ${ts}`); continue;}
    //     const merged_data = {
    //         timestamp: record.given.timestamp,
    //         raw_timestamp: record.given.raw_timestamp,
    //         "aqhi": record.given.aqhi,
    //         "aqi": record.given.aqi,
    //         "final_aqhi": record.manual.final_aqhi,
    //         "use_aqi_instead": record.manual.use_aqi_instead,
    //         "insufficient_data": record.manual.insufficient_data,
    //         "missing_pollutant_num": record.manual.missing_pollutant_num,
    //         "determining_pollutant": record.manual.determining_pollutant,
    //         "raw_aqhi": record.manual.raw_aqhi,
    //         "raw_aqi": record.manual.raw_aqi,
    //     }
    //     // compare timestamps
    //     const given_timestamp = new Date(record.given.timestamp);
    //     const manual_timestamp = new Date(record.manual.timestamp)
    //     if (given_timestamp.getTime() !== manual_timestamp.getTime()) console.log(`timestamps don't match: ${formatToLocalISO(given_timestamp)} !== ${formatToLocalISO(manual_timestamp)}`)
    //     if (record.given.aqhi !== record.manual.final_aqhi
    //         && record.given.aqi !== Math.round(record.manual.raw_aqi)
    //     ) {
    //         console.log(`--- aqhi mismatch at ${ts}`);
    //         aqhis_mismatched[ts] = merged_data;
    //     } else {
    //         aqhis_match[ts] = merged_data;
    //     }
    // }
    // _write_data(`./outputs/comparisons/${stationKey}/aqhi_mismatch.json`, aqhis_mismatched)
    // _write_data(`./outputs/comparisons/${stationKey}/aqhi_match.json`, aqhis_match)
    // const comparisons =_read_data(`./outputs/comparisons/${stationKey}/comparison.json`);
    // const filtered = Object.keys(comparisons)
    //     .map(ts => comparisons[ts])
    //     .filter(r => r.given.aqhi !== null && r.manual.missing_pollutant_num > 4)
    // see how many pollutants are missing
    const mismatches = (0, utils_1._read_data)(`./outputs/comparisons/${stationKey}/aqhi_mismatch.json`);
    const filtered_mismatches = Object.entries(mismatches)
        .map(([ts, r]) => r)
        .filter(r => r.aqhi === null);
    // console.log(filtered_mismatches)
    // // const filtered = Object.fromEntries(aqi_mismatches);
    (0, utils_1._write_data)(`./outputs/comparisons/${stationKey}/null_aqhi.json`, filtered_mismatches);
});
// ();      // uncomment to execute function for debugging
