// originally meant for historical data fetched raw from aca
// applies its own formatting

// do not import anything fron ingest.ts
// contains util functions for manual AQHI calculations
// this includes AQI calculations too

import * as fs from "fs";
import { _read_data, _write_data, formatToLocalISO, normalizeTimestamp, type Timestamp } from "./utils";
import { getECCCStationReadings } from "./ingest_eccc";
import { StationRecord, type PollutantKey } from "./contracts";

const save_calculation_stats = true;

type AQHIPollutants = {
    o3_ppm: number;
    no2_ppm: number;
    pm25: number;  // AQHI formula is expecting units of ug/m3
}

type AQIPollutants = {
    o3_ppm: number;
    no2_ppm: number;
    pm25: number;

    so2: number;
    co: number;
    h2s: number;
}

type ReadingsByTimestampProps = {
    readingsByTimestamp: Record<string, any[]>;
    asOf?: Date | number | string;
}






// ----- utility functions


// formats timestamp for readable folders
// for logging only
function getFolderName(ts: string | number): string {
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
function apply_aqi_formula({
    no2,
    so2,
    co,
    o3,
    pm25,
    h2s
}): any[][] {
    const AQIs: Record<string, number> = {};
    
    if (no2 !== undefined) {
        if (no2 <= 0.0505)      AQIs["no2"] = 49.505 * no2 + 1;
        else if (no2 <= 0.1595) AQIs["no2"] = 27.523 * no2 + 2.1101;
        else                    AQIs["no2"] = 1.6295 * no2 + 6.2401;
    }

    if (so2 !== undefined) {
        if (so2 <= 0.1005)      AQIs["so2"] = 24.876 * so2 + 1;
        else if (so2 <= 0.1725) AQIs["so2"] = 41.667 * so2 - 0.6875;
        else                    AQIs["so2"] = 5.1903 * so2 + 5.6047;
    }

    if (co !== undefined) {
        if (co <= 13.5)         AQIs["co"] = 0.18519 * co + 1;
        else                    AQIs["co"] = 0.028037 * co + 6.1215;
    }

    if (o3 !== undefined) {
        if (o3 <= 0.0505)       AQIs["o3"] = 49.505 * o3 + 1;
        else if (o3 <= 0.0765)  AQIs["o3"] = 115.38 * o3 - 2.3269;
        else                    AQIs["o3"] = 68.182 * o3 + 1.2841;
    }

    if (pm25 !== undefined) {
        AQIs["pm2.5"] = Math.max(1.0, Math.ceil(pm25 / 10.0));
    }

    if (h2s !== undefined) {
        if (h2s <= 0.0105)      AQIs["h2s"] = 238.1 * h2s + 1;
        else if (h2s <= 1.0005) AQIs["h2s"] = 3.0303 * h2s + 3.4682;
        else                    AQIs["h2s"] = 0.33333 * h2s + 6.1665;
    }


    // sort AQIs by descending AQI value
    // pollutant with highest aqi is the "determining pollutant"
    const entries = Object.entries(AQIs);
    if (entries.length === 0) return null;

    const sortedAQIs = Object.entries(AQIs)
        .sort(([, valueA], [, valueB]) => valueB - valueA);

    return sortedAQIs;

}

// takes a list of readings from **one timestamp**
// creates a map with pollutant as key and its reading as a value
const mapReadingsToPollutants = (readings: any[]) => {
  const pollutantMap: Record<string, PollutantKey> = {
    "Nitrogen Dioxide": "no2",
    "Sulphur Dioxide": "so2",
    "Carbon Monoxide": "co",
    "Ozone": "o3",
    "Fine Particulate Matter": "pm25",
    "Hydrogen Sulphide": "h2s"
  };

  return readings.reduce((acc, curr) => {
    const key = pollutantMap[curr.DeterminantParameterName];
    if (key) {
      acc[key] = curr.Value;
    }
    return acc;
  }, {} as any);
};


function calculate_station_AQI(
    readingsByTimestamp,//: Record<string, Record<string, any>[]>,
    asOf: Timestamp
) {
    const reference_timestamp = normalizeTimestamp(asOf);

    // check if data is stale
    const mostRecentTimestamp = Object.keys(readingsByTimestamp)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        [0];

    const dataIsStale = (timestamp: string) => {
        const threshold = reference_timestamp - (1 * 60 * 60 * 1000);
        const readingTime = new Date(timestamp).getTime();
        return readingTime < threshold
    }

    if (dataIsStale(mostRecentTimestamp)) {
        console.log("Warning: AQI data is older than an hour");
        // return [];  // TODO: put this back in
    }

    // format the array into the expected { no2, so2... } shape
    // const pollutantData = mapReadingsToPollutants(readingsByTimestamp[mostRecentTimestamp]);
    const pollutantData = readingsByTimestamp[mostRecentTimestamp].readings;
    console.log(mostRecentTimestamp)
    console.log(readingsByTimestamp)
    console.log(pollutantData)
    
    // apply AQI calculation
    const aqis_unrounded = apply_aqi_formula(pollutantData);

    if (save_calculation_stats) {
        const aqi_calculations = {
            "timestamp": mostRecentTimestamp,
            "data_is_stale": dataIsStale(mostRecentTimestamp),
            "pollutants_readings": pollutantData,
            "aqis_ranked": aqis_unrounded
        }
        _write_data(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/aqi_calculations.json`, aqi_calculations);
    }

    return aqis_unrounded;
}



// -------- MANUAL AQHI CALCULATIONS


// fetches timestamps no older than 3 hours ago
// and sorts from most to least recent
// note: since the API updates hourly, there should be no more than 3 timestamps
const getMostRecentTimestamps = (
    readingsByTimestamp: string[],
    reference_timestamp: number
): string[] => {

    if (!readingsByTimestamp || readingsByTimestamp.length === 0) return [];

    const now = reference_timestamp;

    // threshold: no older than 3 hours ago
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const threshold = now - threeHoursInMs;

    // filter out timestamps older than threshold
    let recentTimestamps = readingsByTimestamp.filter(ts => new Date(ts).getTime() >= threshold)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (recentTimestamps.length > 3) {
        console.warn("more than 3 timestamps - only keeping most recent of the 3");
        recentTimestamps = recentTimestamps.slice(0, 3);
    }

    // if latest reading was over an hour ago, reject
    const oneHourInMs = 60 * 60 * 1000;
    const oneHourAgo = now - oneHourInMs;

    const noneWithinLastHour = new Date(recentTimestamps[0]).getTime() < oneHourAgo;
    if (noneWithinLastHour) {
        console.log("⚠️ Data is stale. No readings received in the last 60 minutes.");
        return recentTimestamps;        // for debugging only
        // return [];   // TODO: put this back in
    } else if (recentTimestamps.length === 0) {
        console.log("⚠️ No recent timestamps found within the last 3 hours.");
    }

    return recentTimestamps;
}


// extracts the readings for the 3 AQHI pollutants (o3, no2, pm2.5)
// from an object whose keys are the timestamps of each reading
// assumes this list has only the relevant timestamps
const extract_AQHI_pollutant_readings = (
    readingsIndexedByTimestamp: Record<string, any>[][]       // each index corresponds to a timestamp
): AQHIPollutants[] => {

    // extract pollutants from last 3 hours
    const hourlyPollutants = readingsIndexedByTimestamp.map(readings => {
        // each reading corresponds to one timestamp
        
        // Helper to find a value by name
        const getValue = (name: string) => 
            readings.find(r => r.DeterminantParameterName === name)?.Value;

        return {
            o3_ppm: getValue("Ozone"),
            no2_ppm: getValue("Nitrogen Dioxide"),
            pm25: getValue("Fine Particulate Matter")
        };
    });

    return hourlyPollutants;

}


// calculates averages for the 3 AQHI pollutants (o3, no2, pm2.5)
const get_averages_for_AQHI_pollutants = (
    extractedPollutants: AQHIPollutants[]
) => {
    if (!extractedPollutants || extractedPollutants.length === 0) return {};

    // average pollutant readings across last 3 hours
    const getAverage = (data: any[], key: string) => {
        if (!data) return undefined;
        const values = data.map(d => d[key]).filter(v => v !== null && v !== undefined);
        return values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : undefined;
    };

    return {
        o3_ppm: getAverage(extractedPollutants, 'o3_ppm'),
        no2_ppm: getAverage(extractedPollutants, 'no2_ppm'),
        pm25: getAverage(extractedPollutants, 'pm25')
    }
}


// note: these readings should be an average from the past 3 hours
function apply_AQHI_formula({
    o3_ppm,
    no2_ppm,
    pm25  // AQHI formula is expecting units of ug/m3
}: Partial<AQHIPollutants>) {
    if (no2_ppm === undefined || o3_ppm === undefined || pm25 === undefined) return null;

    // convert to ppb for the AQHI formula below
    const o3 = o3_ppm*1000;
    const no2 = no2_ppm*1000;
    
    const AQHI_unbounded = (1000/10.4) * (
            (Math.exp(0.000537 * o3) - 1)
        +   (Math.exp(0.000871 * no2) - 1)
        +   (Math.exp(0.000487 * pm25) - 1)
    );

    return Math.max(1, AQHI_unbounded);
}


// note: will return null if no readings were made within the last 3 hours
function calculate_station_AQHI({
    readingsByTimestamp,
    asOf
}: ReadingsByTimestampProps) {
    const reference_timestamp = normalizeTimestamp(asOf);

    const recentTimestamps = getMostRecentTimestamps(Object.keys(readingsByTimestamp), reference_timestamp);
    const relevantReadings = recentTimestamps
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .map(ts => readingsByTimestamp?.[ts])
        .filter(reading => reading !== undefined && reading !== null) as Record<string, any>[][];

    // does the extraction preserve the order of the original timestamps?
    const extractedPollutants = extract_AQHI_pollutant_readings(relevantReadings);
    const pollutantAverages = get_averages_for_AQHI_pollutants(extractedPollutants);

    const aqhi = apply_AQHI_formula(pollutantAverages);

    if (save_calculation_stats) {
        const aqhi_calculations = {
            "timestamps": recentTimestamps,
            "extracted_pollutants": extractedPollutants,
            "pollutant_averages": pollutantAverages,
            "aqhi_raw": aqhi
        }
        _write_data(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/aqhi_calculations.json`, aqhi_calculations);
    }

    return aqhi;
}


function use_AQI_instead({
    determining_pollutant,
    highest_aqi,
    aqhi
}): boolean {
    const aqi = Math.round(highest_aqi);

    if (aqi > aqhi) {
        if (determining_pollutant === "pm2.5")  return true;
        if (aqi > 6)                            return true;
    }

    return false;
}


// if no reference timestamp provided, calculates AQHI
// as of right now.
// if asOf is provided, this becomes a historical analysis
export async function execute_AQHI_calculation_flow({
    readingsByTimestamp,
    asOf = Date.now()
}: ReadingsByTimestampProps) {

    // setup
    const reference_timestamp = normalizeTimestamp(asOf);
    console.log(`-------- start: ${formatToLocalISO(new Date(reference_timestamp))}`)
    if (save_calculation_stats) fs.mkdirSync(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/`, { recursive: true });

    // --- calculate AQHI for current hour
    const aqhi = calculate_station_AQHI({readingsByTimestamp, asOf: reference_timestamp});


    // --- calculate AQIs for each reading
    const aqis = calculate_station_AQI(readingsByTimestamp, reference_timestamp);
    const aqi = Math.round(aqis[0][1])

    // --- decide whether or not to use AQI instead of AQHI
    let final_aqhi = Math.round(aqhi);
    const use_aqi = use_AQI_instead({
            determining_pollutant: aqis[0][0],
            highest_aqi: aqis[0][1],
            aqhi: aqhi
    });

    if (use_aqi) final_aqhi = aqi;


    if (save_calculation_stats) {
        // assumes that now is when the data was requested
        const stats = {
            "timestamp": formatToLocalISO(new Date(asOf)),
            "final_aqhi": final_aqhi,
            "used_aqi_instead": use_aqi,
            "determining_pollutant": aqis[0][0],
            "raw_aqhi": aqhi,
            "raw_aqi": aqis[0][1],
        }
        _write_data(`./outputs/calculation_stats/${getFolderName(reference_timestamp)}/overall_stats.json`, stats)
    }

    return final_aqhi;
}



(async () => {

    const parameters = [
        "Air Quality Health Index",
        "Air Quality Index",
        "Carbon Monoxide",
        "Fine Particulate Matter",
        "Hydrogen Sulphide",
        "Nitrogen Dioxide",
        "Ozone",
        "Sulphur Dioxide",
        // "Total Reduced Sulphur"
    ]


    // --- get recent station data
    // to fetch most recent, do `npm run test:aca` and note the filepath of the data saved
    const groupedbyfilepath = "./outputs/processed_ab_gov.json";

    const groupedData = await _read_data(groupedbyfilepath) as Record<string, StationRecord>;
    const timestamps = Object.keys(groupedData).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const timestamps_asc = timestamps.reverse();

    for (const [i, timestamp] of timestamps_asc.slice(0, 4).entries()) {
        if (i < 2) {console.log(`skip ${timestamp}`); continue;}

        const current_group = Object.fromEntries(
            timestamps
                .slice(i-2, i+1)
                .map(ts => [ts, groupedData[ts]])     // get last 3
        );

        // const final_aqhi = await execute_AQHI_calculation_flow({
        //     readingsByTimestamp: current_group,
        //     asOf: new Date(timestamp)
        // });
        console.log(current_group);

        const final_aqhi = calculate_station_AQI(current_group['2025-08-23T00:00:00-06:00'], new Date("2025-09-01T01:00:00-06:00"));

        console.log(final_aqhi);
    }


    
})
();      // uncomment to execute function for debugging

