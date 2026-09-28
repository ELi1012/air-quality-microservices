/** Update hourly AQHI values.
 * 
 * This file contains two data sources:
 *  1. Regional AQHI -> GeoMet
 *  2. Regional AQHI + individual stations -> MSC Datamart
 * 
 */


import { formatUrl } from "./utils"
import { _read_data, _write_data } from "../../utils";

import { XMLParser } from "fast-xml-parser"
import { type RegionReading, type Region } from "../../types/contracts"

import { fixCurrentObservationPath } from "./utils"


// ----- MSC Datamart ----- //



/**
 * Fetches datamart observation (XML file) as JSON.
 * 
 * @param url path to xml file as URL
 * @returns XML data as JSON object
 */
async function fetchXmlAsJson(url: string): Promise<Record<string, any> | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Response status ${response.status}: Failed to fetch XML stations list`);
            return null;
        }
        
        const xmlData = await response.text();
        
        const parser = new XMLParser({
            ignoreAttributes: false, // Keep attributes like 'name' or 'id'
            attributeNamePrefix: ""  // Optional: removes the default '@_' prefix
        });
        
        const jsonObj = parser.parse(xmlData);

        if (jsonObj === null || jsonObj === undefined) {
            console.warn("Could not fetch stations from XML file. Check the schema here: https://dd.weather.gc.ca/today/air_quality/doc/AQHI_XML_File_List.xml");
            return null;
        }

        return jsonObj;
    } catch (error) {
        console.error(`Error parsing XML for ${url}:`, error);
        return null;
    }
}


// To parse timestamps from XML data (UTCStamp)
// UTCStamp is in this format: 20260516030000
const formatUTCTimestamp = (UTCStamp: string|number) => {
    const ts = String(UTCStamp);

    // Uses regex to split into groups: [2026, 05, 16, 03, 00, 00]
    const match = ts.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    
    if (!match) throw new Error(`Invalid timestamp format for UTCStamp: ${ts}`);

    // Destructure the matches (skipping the first element which is the whole string)
    const [, year, month, day, hour, minute, second] = match;

    // Format to: "2026-05-16T03:00:00Z"
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;

    return new Date(isoString);
}


/** Purpose: Fetch the data located at the url, then return as JSON.
 * 
 * Usage: Fetch the datamart link from the region's metadata,
 *  and pass it to this function.
 * 
 * 
 * @param datamart_url URL to XML file (property: url_msc-datamart_observation)
 * @param url_needs_fixing If true, inserts `/aqhi` in path
 * @returns XML data as JSON object
 */
export async function getDatamartFile(datamart_url: string, url_needs_fixing: boolean) {
    // DEBUG ONLY
    // const cgndb_id = "IACMP;"

    const url = url_needs_fixing ? fixCurrentObservationPath(datamart_url) : datamart_url;

    if (!url) {
        throw new Error(`Empty/invalid URL cannot be processed: ${url}`);
    }


    // fetch xml data
    const json = await fetchXmlAsJson(url);
    if (json === null) {
        throw new Error("URL exists but nothing was fetched.");
    }

    // -- process XML data
    const raw = json.conditionAirQuality;

    // check for associated stations, if any
    let stations = raw?.associatedStations?.station ?? [];
    if (!Array.isArray(stations) && typeof stations === "object") stations = [stations];

    // rename airQualityHealthIndex to aqhi
    stations = stations.map(({airQualityHealthIndex: aqhi, ...rest}) => ({
        aqhi,
        ...rest
    }));

    // get aqhi and timestamp
    // purpose: compare to API
    const rawTimestamp = raw?.dateStamp?.['UTCStamp'];
    const timestamp = formatUTCTimestamp(rawTimestamp);
    const aqhi = raw.airQualityHealthIndex;

    const xmlData = {
        name: raw.region.nameEn,
        aqhi,
        timestamp,
        rawTimestamp,
        stations
    }

    return xmlData;
}


// ----- GeoMet API ----- //


/** Fetches AQHIs from GeoMet API.
 * 
 * Purpose: Compare against AQHIs fetched via XML files.
 * 
 * Usage: For fetching all latest AQHIs.
 * 
 * Docs: https://api.weather.gc.ca/openapi?f=html#/aqhi-observations-realtime/getAqhi-observations-realtimeFeatures
 * 
 */
async function fetchRegionAqhis() {
    const baseUrl = 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items';
    const options = {
        f: 'json',
        limit: 10000,
        latest: true
    }

    const url = formatUrl(baseUrl, options)

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const msg = await res.json()
            console.error(`HTTP ${res.status}: ${msg}`);
            return
        }

        const data = await res.json();
        return data
    } catch (err) {
        console.error(`Failed to fetch region AQHIs: ${err}`)
    }
}



/** Fetches latest regional AQHIs.
 * 
 */
export async function getGeoMetRegionalReadings(): Promise<RegionReading[]> {

    const rawReadingsByRegion = await fetchRegionAqhis();
    _write_data('./raw-region-aqhis.json', rawReadingsByRegion);

    // strip metadata
    const readingsByRegion = rawReadingsByRegion.features.map(r => ({
        id: r.properties.location_id,
        name: r.properties.location_name_en,
        aqhi: r.properties.aqhi,
        timestamp: r.properties.observation_datetime,
        rawTimestamp: r.properties.observation_datetime,

        lat: r.geometry.coordinates[1],
        lon: r.geometry.coordinates[0],
    }));

    return readingsByRegion;
}

