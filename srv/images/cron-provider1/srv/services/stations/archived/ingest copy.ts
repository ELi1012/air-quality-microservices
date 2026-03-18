/** copied in case i accidentally delete something and can't recover it

import PQueue from 'p-queue';
import * as fs from "fs";
import { Client } from 'pg';


const client = new Client({
  connectionString: process?.env?.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/air_quality_data"
});

const STATION_TABLE = process?.env?.DB_NAME || 'stations';



// the parameters we want to report for each station
// see here for full list of allowed parameters:
// https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json&$select=Name&$orderby=Name

const STATION_PARAM_MAPPING = {
    // key: property name from API
    // value: what we'll use as the property name
    'Air Quality Health Index': 'AQHI',
    // 'Air Quality Index',     // US only
    'Nitrogen Dioxide': 'NO2',
    'Sulphur Dioxide': 'SO2',
    'Fine Particulate Matter': 'PM2',
    'Ozone': 'O3'
} as const;

const STATION_METADATA_MAP = {
    'StationKey': 'station_key',
    'StationName': 'name',
    'Value': 'value',
    'ReadingDate': 'timestamp',
    'Latitude': 'lat',
    'Longitude': 'lon'
} as const;


type StationMeasurementRaw = keyof typeof STATION_PARAM_MAPPING;
type StationMeasurementKeys = StationMeasurementRaw[];
const STATION_PARAMS = Object.keys(STATION_PARAM_MAPPING) as StationMeasurementKeys;

type StationRecordMeasurements = typeof STATION_PARAM_MAPPING[keyof typeof STATION_PARAM_MAPPING];

// given by API
interface StationReading {
    StationKey: number;
    StationName: string;
    ReadingDate: string;

    Value: number | null;
    DeterminantParameterName: string
    ParameterKey: number;

    Station?: {
        Latitude: number;
        Longitude: number;
    }
}

// what we're returning
interface StationRecord {
    station_key: number;
    name: string;
    timestamp: string;

    lat: number | null;
    lon: number | null;

    aqi_by_pollutant: [string, number][];

    [key: string]: any;
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


// used to think this was "ParameterName"
// only "DeterminantParameterName" returns useful values despite not appearing in the docs
// try "ParameterName" if this stops returning useful data
const parameterKey = "DeterminantParameterName";
const olderReadingsKeyName = "olderReadingsTimestamped";    // where to look for readings flagged as older
const TIME_WINDOW_HOURS = 12;   // readings older than this will be rejected


// for personal use
async function _read_data(filepath) {
  try {
    const raw = fs.readFileSync(filepath, "utf-8");
    const data = JSON.parse(raw);

    return data;
  } catch (error) {
    throw new Error(`Could not read data at ${filepath}`)
  }
}

async function _write_data(filepath, data, indentation=2) {
  // data can be any js value (usually object, array)
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, indentation));
  } catch (error) {
    console.log(error);
    throw new Error(`Could not write data to ${filepath}`)
  }
}




/********************************************
 * ACA STATION DATA FUNCTIONS
 ********************************************/

/** Fetches an up-to-date list of federal monitoring stations in Alberta.
 * Used to fetch each station's corresponding pollutant data.
 * 
 */
async function fetch_station_keys(): Promise<number[]> {
    // const url = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Stations?$format=json&$select=Name&$orderby=Name`;
    const url = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Stations?$format=json&$select=StationKey,Name&$orderby=StationKey`;
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const stationKeys: number[] = data.value
            .map(({ StationKey, Name }) => {
                const key = Number(StationKey);
                if (!Number.isInteger(key) || key <= 0) {
                    console.log(`Station ${Name} filtered out - has non numerical key: ${StationKey}`);
                    return null;
                }
                return key;
            })
            .filter(key => key !== null);

        return stationKeys;

    } catch (err) {
        throw new Error(`Could not fetch ACA station keys: ${err}`);
    }
}


function _format_timestamp(hours=12): string {
    return (new Date(Date.now() - hours * 60 * 60 * 1000)).toISOString();
}

function _format_parameter_names(parameters: any[]): string {
    if (!parameters || parameters.length === 0) return "";

    const conditions = parameters.map(p => `${parameterKey} eq '${p}'`);
    return `(${conditions.join(" or ")})`;
}

function get_full_url(
    stationKey: number, 
    stationParams: string[] = STATION_PARAMS, 
    hoursTimeRange: number = TIME_WINDOW_HOURS
): string {
    
    const baseUrl = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/StationMeasurements`;

    // format query parameters
    // note: these parameters must match the keys defined in StationReading
    const queryParams = {
        $filter: `${_format_parameter_names(stationParams)} and StationKey eq ${stationKey} and Value ne null`,
        $select: `StationName,${parameterKey},Value,ReadingDate,StationKey,ParameterKey`,
        $orderby:'ReadingDate desc',
        $expand:'Station($select=Latitude,Longitude)',      // fetches coordinates from 'Station' navigation property (odata_)
        $format: 'json'
    }

    if (hoursTimeRange) {
        // optional time range filter - if you want to ignore all readings older than 12 hours
        queryParams['$filter'] += ` and ReadingDate ge ${_format_timestamp(hoursTimeRange)}`;
    }
    

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
async function fetch_ACA_station_data(
    stationKey: number, 
    stationParams: string[] = STATION_PARAMS, 
    hoursTimeRange: number = TIME_WINDOW_HOURS
): Promise<StationReading[]> {

    const url = get_full_url(stationKey, stationParams, hoursTimeRange);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        const data = await response.json();
        return data.value as StationReading[];

    } catch (err) {
        throw new Error(`Could not fetch ACA station data: ${err}`);
    }
}


/** Process raw station data into a single StationRecord.
 * Data arrives as a list of individual measurements, defined by
 * the pollutant/AQHI reading being measured.
 * 
 * 
 * Assumes measurements are sorted descending by ReadingDate,
 *  and all readings are for one station only.
 * 
 * Design decision (to note):
 *      The station's timestamp is defined by the most recent reading.
 *       Eg. if AQHI is the most recent measurement, then the station will
 *          go by the AQHI measurement's timestamp, even if its O3
 *          measurement was taken an hour behind.
 *      In practice, we'll still want to keep these measurements
 *          since they'll only be an hour or so behind the most recent one.
 *      If this is not desired, then collapse_readings_into_one_timestamp
 *          can be set to 'true' to nullify any measurement older than
 *          the  most recent.
 * 
 * 
 * @param station_data - An array of measurements for a single station.
 *  Each record contains the reading for only one pollutant/AQHI reading at a time.
 * @param collapse_readings_into_one_timestamp  - (Optional) Sets any parameter older than the
 *  most recent measurement to null.
 * @returns {Promise<StationRecord | null>} - Returns null if there was no station data
 *  for the given time window.
 */
async function process_station_data(
    station_data: StationReading[],
    collapse_readings_into_one_timestamp: boolean=false
): Promise<StationRecord | null> {

    function format_metadata(reading: StationReading): Record<string, any> {
        if (!reading.Station) return reading;
        return {
            station_key: reading.StationKey,
            name: reading.StationName,
            timestamp: reading.ReadingDate,     // assume most recent reading is being passed

            lat: reading.Station?.Latitude ?? null,
            lon: reading.Station?.Longitude ?? null,
        }
    }

    // in practice, pollutants share common timestamps most of the time
    // flag any pollutants that don't share the timestamp
    
    if (!station_data || station_data.length === 0) return null;

    const firstReading = station_data[0];
    var mostRecentTimestamp = firstReading.ReadingDate;     // guaranteed since API sorts timestamp from most recent to least

    // -------- HANDLE METADATA
    let station = format_metadata(firstReading) as Partial<StationRecord>;

    // -------- PARSE READINGS
    let currentReadings = station_data;
    if (collapse_readings_into_one_timestamp) {
        console.log("filtering for readings w/ identical timestamps");
        currentReadings = station_data.filter((reading) => reading.ReadingDate === mostRecentTimestamp);
    }

    const olderReadings: Partial<Record<StationRecordMeasurements, string|null>> = {};

    // ----- first pass
    // gets most recent readings for each pollutant/AQHI
    // gets most recent timestamp from latest reading
    let stationMeasurement = currentReadings.reduce((acc, reading) => {
        // each reading only has one parameter at a time (pollutant or AQHI)
        const oldKey = reading[parameterKey] as StationMeasurementRaw;                      // use for reading
        const key = STATION_PARAM_MAPPING[oldKey] as StationRecordMeasurements || null;     // use for acc
        const timestamp = reading.ReadingDate;
        if (key === null) {
            console.warn(`Parameter key ${oldKey} was not found in map.`);
            return acc;
        }

        if (acc[key] !== null && acc[key] !== undefined) return acc;    // more recent value already found for this parameter
        acc[key] = reading.Value;

        // store pollutants with older readings in their own object
        if (new Date(timestamp).getTime() < new Date(mostRecentTimestamp).getTime()) {
            // most recent timestamp is guaranteed to be most recent
            // assuming that our API call sorts it from ReadingDate desc
            olderReadings[key] = timestamp;
        }

        return acc;
    }, station);

    // set station timestamp to most recent reading
    stationMeasurement.timestamp = mostRecentTimestamp;


    // ----- second pass
    // store older readings in their own object
    // optional: set older readings to null
    if (Object.keys(olderReadings).length > 0) {
        stationMeasurement[olderReadingsKeyName] = olderReadings;

        if (collapse_readings_into_one_timestamp) {
            // readings older than most recent timestamp are set to null
            for (const key in olderReadings) {
                stationMeasurement[key] = null;
            }
        }
    }


    return stationMeasurement as StationRecord;
}


type AlbertaStations = Record<string, StationRecord|null>;
async function fetch_all_stations(): Promise<AlbertaStations> {
    const stationKeys = await fetch_station_keys();

    // initialize station map
    const stationMap: Record<number, Record<any, any>|null> = Object.fromEntries(stationKeys.map(key => [key, null]));
    
    // initialize queue
    const queue = new PQueue({
        concurrency: 5,         // up to 5 active requests at once
        intervalCap: 5,         // no more than x requests per second
        interval: 1000,         // rate limit window
        carryoverIntervalCount: true        // keep flow steady between intervals
    });

    // add jobs to queue
    for (const key of stationKeys) {
        queue.add(async () => {
            try {
                const raw = await fetch_ACA_station_data(key);
                const data = await process_station_data(raw, true);
                stationMap[key] = data;

                console.log(`Processed station key ${key}`);

            } catch (err: any) {
                console.warn(`Failed for station key ${key}: ${err.message}`);
            }
        })
    }

    await queue.onIdle();

    return stationMap as AlbertaStations;
}


const STATION_COLUMNS = ["station_key", "name", "timestamp",
    "lat", "lon",
    "AQHI","NO2","O3","PM2","SO2"
]
async function runIngestion() {
    const stations_data: AlbertaStations = await _read_data("./outputs/aca.json");


    await client.connect();
    try {
        await client.query('BEGIN');
        for (const station of Object.values(stations_data)) {
            if (!station) continue;
            const { station_key, name, timestamp, lat, lon, AQHI, NO2, O3, PM2, SO2 } = station;

            // format query
            const q = 
                `INSERT INTO ${STATION_TABLE} 
                (${STATION_COLUMNS.join(',')})
                VALUES (${STATION_COLUMNS.map((_, i) => `$${i+1}`).join(',')})
                ON CONFLICT DO NOTHING`; // Prevent dupes if cron runs twice

            const values = [station_key, name, timestamp, lat, lon, AQHI, NO2, O3, PM2, SO2]

            // pass to db
            await client.query(q, values);

            console.log(`added station ${station.name}`);
        }

        await client.query("COMMIT");

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Error during ingestion:", err);
    } finally {
        await client.end();
    }
    
}



// -------- MANUAL AQHI CALCULATIONS


// Use the following formulas for each station
//  using the current hourly reading to get the AQI value for each substance.

// TODO: double check that the units for all pollutants are in ppm
// except PM2.5, which is in ug/m3
// check here for units of each pollutant: https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json
// formulas come from the AQHI calculation flow, updated April 2024
function calculate_station_AQI({
    no2,
    so2,
    co,
    o3,
    pm25,
    h2s
}) {
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

// takes a list of readings from one timestamp
// creates an object with pollutant as key and its reading as a value
const mapReadingsToPollutants = (readings: any[]) => {
  const pollutantMap: Record<string, string|number> = {
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


// calculates averages for the 3 AQHI pollutants (o3, no2, pm2.5)
const calculateAverageConcentrationsAQHI = ({
    readingsByTimestamp
}: {
    readingsByTimestamp: Record<string, any[]>
}) => {
    
    const now = new Date().getTime();

    // threshold: no older than 3 hours ago
    const threeHoursInMs = 3 * 60 * 60 * 1000;
    const threshold = now - threeHoursInMs;

    // filter out timestamps older than threshold
    const recentTimestamps = Object.keys(readingsByTimestamp)
        .filter(ts => new Date(ts).getTime() >= threshold)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    console.log(recentTimestamps);
    if (recentTimestamps.length > 3) console.log("more than 3 timestamps");

    // if latest reading was over an hour ago, reject
    const oneHourInMs = 60 * 60 * 1000;
    const oneHourAgo = now - oneHourInMs;

    const noneWithinLastHour = new Date(recentTimestamps[0]).getTime() < oneHourAgo;
    if (noneWithinLastHour) {
        console.log("⚠️ Data is stale. No readings received in the last 60 minutes.");
        // return null;
    }

    // --- get average AQHIs

    // extract pollutants from last 3 hours
    const hourlyPollutants = recentTimestamps.map(ts => {
        const readings = readingsByTimestamp[ts];

        // Helper to find a value by name
        const getValue = (name: string) => 
            readings.find(r => r.DeterminantParameterName === name)?.Value;

        return {
            timestamp: ts,
            o3_ppm: getValue("Ozone"),
            no2_ppm: getValue("Nitrogen Dioxide"),
            pm25: getValue("Fine Particulate Matter")
        };
    });

    console.log(hourlyPollutants);

    // average pollutant readings across last 3 hours
    const getAverage = (data, key) => {
        const values = data.map(d => d[key]).filter(v => v !== null && v !== undefined);
        return values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : undefined;
    };

    return {
        o3_ppm: getAverage(hourlyPollutants, 'o3_ppm'),
        no2_ppm: getAverage(hourlyPollutants, 'no2_ppm'),
        pm25: getAverage(hourlyPollutants, 'pm25')
    }
}


// note: these readings should be an average from the past 3 hours
function calculate_station_AQHI({
    o3_ppm,
    no2_ppm,
    pm25  // AQHI formula is expecting units of ug/m3
}: {
    o3_ppm?: number,
    no2_ppm?: number,
    pm25?: number
}) {
    if (no2_ppm === undefined || o3_ppm === undefined || pm25 === undefined) return null;

    // convert to ppb for the AQHI formula below
    const o3 = o3_ppm*1000;
    const no2 = no2_ppm*1000;
    
    return (1000/10.4) * (
            (Math.exp(0.000537 * o3) - 1)
        +   (Math.exp(0.000871 * no2) - 1)
        +   (Math.exp(0.000487 * pm25) - 1)
    );
}




(async () => {
    // await runIngestion();

    // ----- manual aqhi calculations

    

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

    // formatting url
    // const url = get_full_url(139, parameters);
    // console.log(url);

    const get_recent_station_data = async (raw_filepath, groupedbyfilepath) => {
        // get raw data
        const station_data_raw = await fetch_ACA_station_data(139, parameters, 12);
        await _write_data(raw_filepath, station_data_raw);

        // group readings by date
        const data = station_data_raw; // await _read_data(filepath);
        await _write_data(groupedbyfilepath, data.reduce((acc, reading) => {
            const date = reading.ReadingDate;
            
            if (!acc[date]) {
                acc[date] = [];
            }
            
            acc[date].push(reading);
            return acc;
        }, {}));
    }

    // --- get recent station data
    const filepath = "./outputs/thing.json"
    const groupedbyfilepath = "./outputs/groupedbydate.json";

    // await get_recent_station_data(filepath, groupedbyfilepath);


    // --- calculate AQHI for current hour
    const groupedData: Record<string, any[]> = await _read_data(groupedbyfilepath);
    // const avgs = calculateAverageConcentrationsAQHI({readingsByTimestamp: groupedData});
    // console.log(avgs);

    // const aqhi = calculate_station_AQHI(avgs);
    // console.log(aqhi);


    // --- calculate AQIs for each reading
    // TODO: check for stale data first
    // this is data formatting stuff before it actually calculates the AQI. might want to put this in a helper function

    // sort timestamps
    const mostRecentTimestamp = Object.keys(groupedData)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        [0];
    
    // 1. Format the array into the expected { no2, so2... } shape
    const pollutantData = mapReadingsToPollutants(groupedData[mostRecentTimestamp]);
    
    // 2. Run AQI calculation
    const aqis_ranked = calculate_station_AQI(pollutantData);
    console.log(aqis_ranked);
    console.log(`Highest AQI is ${aqis_ranked[0][1]} from ${aqis_ranked[0][0]}`)


    
})();