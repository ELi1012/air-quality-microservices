import { _read_data, _write_data, formatToLocalISO } from "./utils";
import { PollutantKey, StationRecord } from './contracts';



const ALBERTA_BBOX = {
    minLng: -120,
    minLat: 49,
    maxLng: -110,
    maxLat: 60
};

const formatBboxQuery = (bbox) => `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;

const formatTimerange = (timestamp: string|number|null) => {
    // note: if using custom timestamp, implement an upper bound too
    const ref_date = timestamp===null
        ? new Date()
        : new Date(timestamp);
    
    // move to top of the hour
    // ref_date.setUTCMinutes(0, 0, 0);
    // include readings from the last 3 hours
    // note: ECCC is slow to update at the top of the hour.
    // cronjob may need to fetch again halfway through the hour
    ref_date.setUTCHours((ref_date.getUTCHours() - 3));

    return `${ref_date.toISOString()}/..`
}

const formatQuery = (timestamp: string|number|null, hoursBefore=0) => {
    // example: 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&lang=en-CA&bbox=-120,49,-110,60&limit=50&datetime=2026-01-15T00%3A27%3A50.234Z%2F..'
    const params = {
        f: "json",
        lang: "en-CA",
        bbox: formatBboxQuery(ALBERTA_BBOX),
        limit: "1000",
        datetime: encodeURIComponent(formatTimerange(timestamp))
    };

    const final_params = Object.entries(params)
        .map(([param, value]) => `${param}=${value}`)
        .join("&");

    return final_params;
}



async function fetch_raw_data() {
    const baseURL = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items'
    const query = formatQuery(null, 1);

    const url = `${baseURL}?${query}`;
    console.log(url)

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch stations list");

        const data = await response.json();

        if (data === null || data === undefined) {
            console.warn("Could not fetch stations from ECCC. Check here: https://api.weather.gc.ca/openapi#/aqhi-observations-realtime/getAqhi-observations-realtimeFeatures");
        }

        return data;
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}


// if any changes are made to the API, this is the first place to update
function format_raw_ECCC_data(data: Record<string, any>) {
    return {
        fetched_at: data.timeStamp,
        number_returned: data.numberReturned,
        stations: data.features
    }
}




// assumes all readings are from the same station
function createStationRecords(
    station_data: Record<string, any>[]
): Record<string, StationRecord[]> {
    // readings can be from multiple timestamps

    const results = {};
    for (const station of station_data) {
        const timestampRaw = station.properties.observation_datetime;
        const timestamp = formatToLocalISO(new Date(timestampRaw));

        if (!results[timestamp]) results[timestamp] = []

        const properties = station.properties;
        const record = {
            name: properties.location_name_en,
            timestamp: new Date(properties.observation_datetime),
        
            lat: station.geometry.coordinates[1],
            lon: station.geometry.coordinates[0],
        
            aqhi: properties.aqhi
        } as StationRecord;

        // include french name if not identical to english
        const nameEn = properties.location_name_en?.trim().toLowerCase();
        const nameFr = properties.location_name_fr?.trim().toLowerCase();
        if (nameEn !== nameFr) record.name_fr = properties.location_name_fr

        results[timestamp].push(record);
    }

    return results;
}


export async function getECCCStationReadings() {
    const raw = await fetch_raw_data();
    const stationsRaw = raw.features;
    const stationsGrouped = createStationRecords(stationsRaw);

    _write_data("./outputs/eccc_station_aqhis.json", stationsGrouped);
    return stationsGrouped;
}


// changes may be made to the MSC Datamart service
// strongly suggest subscribing to the announcement mailing list here:
// https://comm.collab.science.gc.ca/mailman3/postorius/lists/dd_info.comm.collab.science.gc.ca/
(async () => {
    
    await getECCCStationReadings();
})
();