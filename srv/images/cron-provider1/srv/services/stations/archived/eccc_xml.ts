import { XMLParser } from "fast-xml-parser"
import { _read_data, _write_data } from "../utils";


interface Point {
  lat: number;
  lng: number;
}

const ALBERTA_BBOX = {
    minLng: -120,
    minLat: 49,
    maxLng: -110,
    maxLat: 60
};

const formatBboxQuery = (bbox) => `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`;
const formatTimerange = (timestamp: string|number|null, hoursBefore=0) => {
    const ref_date = timestamp===null
        ? new Date()
        : new Date(new Date(timestamp).getTime() - (hoursBefore*60*60*1000));
    
    return `${ref_date.toISOString()}/..`
}

const formatQuery = (timestamp: string|number|null, hoursBefore=0) => {
    // example: 'https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?f=json&lang=en-CA&bbox=-120,49,-110,60&limit=50&datetime=2026-01-15T00%3A27%3A50.234Z%2F..'
    const params = new URLSearchParams({
        f: "json",
        lang: "en-CA",
        bbox: formatBboxQuery(ALBERTA_BBOX),
        limit: "3000",
        datetime: formatTimerange(timestamp)    
    });

    return params.toString();
}


function isPointInAlberta(point: Point): boolean {
  const isLngInRange = point.lng >= ALBERTA_BBOX.minLng && point.lng <= ALBERTA_BBOX.maxLng;
  const isLatInRange = point.lat >= ALBERTA_BBOX.minLat && point.lat <= ALBERTA_BBOX.maxLat;

  return isLngInRange && isLatInRange;
}



async function fetchStationsList() {
    const url = "https://dd.weather.gc.ca/today/air_quality/doc/AQHI_XML_File_List.xml";

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch XML stations list");
        
        const xmlData = await response.text();
        
        // Initialize parser
        const parser = new XMLParser({
            ignoreAttributes: false, // Keep attributes like 'name' or 'id'
            attributeNamePrefix: ""  // Optional: removes the default '@_' prefix
        });
        
        const jsonObj = parser.parse(xmlData);
        const data = jsonObj?.dataFile?.EC_administrativeZone

        if (data === null || data === undefined) {
            console.warn("Could not fetch stations from XML file. Check the schema here: https://dd.weather.gc.ca/today/air_quality/doc/AQHI_XML_File_List.xml");
        }

        return data;
    } catch (error) {
        console.error("Error parsing XML:", error);
        return null;
    }
}

function parse_xml_list(data: Record<string, any>) {
    // remove metadata
    const pnr_data = data.find((zone: Record<string, any>) => zone?.abreviation === "pnr");
    if (pnr_data === undefined || pnr_data === null) {
        console.warn(`Could not find pnr region in the list of administrative zones: ${data.map(zone => zone?.abreviation)}`);
        return null;
    }

    // note: DO NOT USE pathToCurrentObservation
    // link is broken
    const pnr_regions = pnr_data.regionList.region;
    // _write_data("./outputs/eccc_stations.json", pnr_regions);

    // filter for only inside alberta
    const ab_regions = pnr_regions.filter(r => isPointInAlberta({lat: r.latitude, lng: r.longitude}))
    _write_data("./outputs/ab_eccc_stations.json", ab_regions);

    return ab_regions;
}

async function get_valid_urls(urls: string[]): Promise<Record<string, any>[]> {
    const results = [];

    const parser = new XMLParser({
            ignoreAttributes: false, // Keep attributes like 'name' or 'id'
            attributeNamePrefix: ""  // Optional: removes the default '@_' prefix
        });

    for (const url of urls) {
        try {
            console.log(`Fetching: ${url}`);
            
            const response = await fetch(url);

            // Handle 404s or other non-200 statuses gracefully
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Skipping (404 Not Found): ${url}`);
                } else {
                    console.error(`Error ${response.status}: ${url}`);
                }
                // Wait 1 second before the next iteration to respect rate limit
                await delay(1000);
                continue;
            }

            // convert xml to json
            const raw = await response.text();
            const data = parser.parse(raw);

            results.push({ url, data });
            console.log(`Success: ${url}`);

        } catch (error) {
            console.error(`Network error for ${url}:`, error);
        }

        // Enforce Rate Limit: Wait 1 second before the next request
        await delay(1000);
    }

    return results;
}


// respects ECCC's rate limits
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


// changes may be made to the MSC Datamart service
// strongly suggest subscribing to the announcement mailing list here:
// https://comm.collab.science.gc.ca/mailman3/postorius/lists/dd_info.comm.collab.science.gc.ca/
(async () => {
    // const data = await fetchStationsList();
    // const ab_regions = parse_xml_list(data);

    

    // construct the URL
    // example: https://dd.weather.gc.ca/today/air_quality/aqhi/pnr/observation/realtime/xml/AQ_OBS_IACMP_CURRENT.xml

    // const urls = ab_regions
    //     // .slice(0, 3)        // for debugging
    //     .filter(region => region?.cgndb) // Only keep regions that have an ID
    //     .map(region => `https://dd.weather.gc.ca/today/air_quality/aqhi/pnr/observation/realtime/xml/AQ_OBS_${region.cgndb}_CURRENT.xml`);

    // urls.forEach(url => console.log(url));

    // const results = await get_valid_urls(urls);
    // _write_data("./outputs/eccc_readings.json", results);
    

    // assume that Alberta and ECCC have identical names for the stations
    
    // const results = _read_data("./outputs/eccc_readings.json")
    //     .map(result => result?.data?.conditionAirQuality)
    //     .filter(r => r !== null && r!== undefined);

    // if (results.length === 0) throw new Error("All ECCC readings are empty. Check the URLs accessed for the XML files.");


    // const thing = results[0];

    // const rawStations = thing?.associatedStations?.station;
    // const stationList = rawStations 
    //     ? (Array.isArray(rawStations) ? rawStations : [rawStations]) 
    //     : [];   // In XML, if there is only one station, the parser usually converts it into a single Object. If there are multiple, it converts it into an Array.


    // let stationsData = [];
    // if (stationList.length > 0) {
    //     stationsData.push(...stationList
    //         .map(station => ({
    //             aqhi: station.airQualityHealthIndex,
    //             name: station.nameEn,
    //             timestamp: new Date(thing.dateStamp.UTCStamp)
    //         })
    //     ))
    // } else {
    //     // this region has only one station
    //     const single_station = thing;
    //     stationsData.push({
    //         aqhi: single_station.airQualityHealthIndex,
    //         name: single_station.region.nameEn,
    //         timestamp: new Date(thing.dateStamp.UTCStamp)
    //     })
    // }

    // console.log(stationsData)

    // const res = await fetch()
    console.log(new Date(new Date().getTime() - (1*60*60*1000)).toISOString());



})
();