/**
 * Purpose: Update sensor metadata
 * - Add newly registered PurpleAir sensors
 * - Remove PurpleAir sensors down for > 6 months
 * 
 * 
 * **PurpleAir Group**: A "cache" that exists on PurpleAir's servers.
 * - Allocated to each API user
 * - Identified by a *group ID*
 * - Purpose: More cost-effective querying of PurpleAir API
 * 
 * When to query PA sensors *outside the group*:
 * - checking for newly-registered sensors
 * - debugging/testing
 * 
 * 
 * See here for best practices:
 *      https://community.purpleair.com/t/making-api-calls-with-the-purpleair-api/180
 * 
 * 
 */

import PQueue from 'p-queue';               // handles multiple API requests while respecting rate limits
import { fetch_from_url, validateEnvs } from "../utils"   // utility functions
import { LOCATION_TYPE_OUTSIDE, ALBERTA_BBOX_COORDINATES, EDMONTON_BBOX_COORDINATES, METADATA_FIELDS, CANADA_BBOX_COORDINATES } from "./consts"

import { _read_data, _write_data } from "../../utils"   // for local testing


// load envs
validateEnvs(['PA_READ_KEY', 'PA_WRITE_KEY', 'PA_GROUP_ID'])
const { PA_READ_KEY, PA_WRITE_KEY, PA_GROUP_ID } = process?.env;


// constants
const ONE_MONTH = 60  *   60  *   24  *   30; // 2592000 seconds
//              seconds  minutes  hours   days   months



type SensorIndex=number;
type SensorName=string;
type Latitude=number;
type Longitude=number;

export interface MembersMetadataResponse {
    "api_version": string,
    "time_stamp": number,
    "data_time_stamp": number,
    "group_id": number,
    "max_age": number,
    readonly "fields": [
        "sensor_index",
        "name",
        "latitude",
        "longitude"
    ],
    "data": [SensorIndex,SensorName,Latitude,Longitude][]
}





// ----- WITHIN PA GROUP -----
/**
 * Fetches sensors from our defined group.
 * 
 * @returns MembersMetadataResponse
 */
export async function getCurrentMembers(): Promise<MembersMetadataResponse> {
    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members`;

    let params = {
        fields: METADATA_FIELDS,
        max_age: 0      // to fetch ALL members, not just ones reporting within last week
    }

    // @ts-ignore
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${query}`;

    const headers = { "X-API-KEY": PA_READ_KEY }
    try {
        return await fetch_from_url(url, headers) as MembersMetadataResponse;
        // const thing = await fetch_from_url(url, headers) as MembersMetadataResponse;
        // _write_data('./outputs/pa-metadata.json', thing);
        // return thing;
    } catch (err) {
        console.error("Could not fetch current members: ", err);
        throw err
    }
}



// ----- OUTSIDE OF PA GROUP -----
// This code should only be run
// if creating a new PurpleAir group
// or updating the current PurpleAir group.

/**
 * Sensors fetched are *not limited* to those within our user-defined group.
 * 
 * @param params 
 * @returns 
 */
async function getSensors(params: Record<string, any>) {
    const baseUrl = `https://api.purpleair.com/v1/sensors`;

    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${query}`;

    const headers = { "X-API-KEY": PA_READ_KEY }
    try {
        return await fetch_from_url(url, headers);
    } catch (err) {
        console.error("Could not fetch alberta sensors: ", err);
        throw err
    }
}


/**
 * Adds new member to the group.
 * 
 * @param sensor_index 
 * @returns 
 */
async function addNewMember(sensor_index: number) {

    const params = { sensor_index }
    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members`;
    const url = `${baseUrl}`;

    try {

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-API-KEY": PA_WRITE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });
    
        if (!response.ok) {
            let errorDetails;
            try { errorDetails = await response.json(); }
            catch {
                // Fallback if the body isn't JSON (e.g., a string or empty)
                errorDetails = await response.text();
            }
    
            const errorMessage = typeof errorDetails === 'object' 
                ? JSON.stringify(errorDetails) 
                : errorDetails;
    
            throw new Error(`HTTP ${response.status}: ${errorMessage}`);
        }
    
        return await response.json();
    } catch (err) {
        console.error("Could not add new member: ", err);
        throw err
    }

}


/** Fetches sensors within Canada.
 * 
 * Removes US sensors and formats the raw PurpleAir response
 * as a list of sensor objects.
 * 
 * @returns Array of sensor objects
 */
async function fetchAllSensorsCanada(): Promise<Array<Record<string, any>>> {
    let params: Record<string, any> = {
        fields: 'last_seen,latitude,longitude',    // last_seen: in seconds
        max_age: ONE_MONTH,
        location_type: LOCATION_TYPE_OUTSIDE,
        ...(CANADA_BBOX_COORDINATES || {})
    }

    const sensors_raw = await getSensors(params);
    const sensors = fieldMapper(sensors_raw.fields, sensors_raw.data);

    return sensors.filter(sensor => !isPointInUS([sensor.longitude, sensor.latitude]));

}


export interface SensorAddingResponse {
    api_version: string;
    time_stamp: number;
    data_time_stamp: number;
    group_id: number;
    member_id: number;
    sensor: {
        sensor_index: SensorIndex;
        last_seen: number;
        name: SensorName;
        latitude: Latitude;
        longitude: Longitude
    }
}


/**
 * 
 * Steps executed:
 * - fetch ALL sensors within Canada
 * - fetch current members in group
 * - compare the two
 * - add all sensors that are NOT in group
 * - pass newly added sensors to calling function to update database
 * 
 * @returns List of newly added sensors. Includes all metadata necessary to update table with.
 */
export async function addNewMembers(): Promise<SensorAddingResponse[]> {
    const sensors = await fetchAllSensorsCanada();
    const membersRaw = await getCurrentMembers();


    const membersCurrent = fieldMapper(membersRaw.fields, membersRaw.data);

    // add new members
    const membersIndexes = membersCurrent.map(m => m.sensor_index);
    const toAdd = sensors
        .filter(s => !membersIndexes.includes(s.sensor_index))
        .filter(s => s.latitude != null && s.longitude !== null);   // prevent downstream errors w/ null constraint violation

    if (toAdd.length === 0) {
        console.log('No new members to add.')
        return [];
    }

    const addedSensors: SensorAddingResponse[] = [];

    const queue = new PQueue({
        concurrency: 5,         // up to 5 active requests at once
        intervalCap: 1,         // no more than 1 requests per second
        interval: 1200,         // rate limit window
        carryoverIntervalCount: true        // keep flow steady between intervals
    });

    
    for (const newSensor of toAdd) {
        const sensor_index = newSensor.sensor_index;
        console.log(sensor_index)

        queue.add(async () => {
            try {
                const res = await addNewMember(sensor_index);
                addedSensors.push(res);

            } catch (err: any) {
                console.log(`Could not add ${sensor_index}: `, err);
            }
        });
    }

    await queue.onIdle();

    // calling function needs to update database w/ new sensors
    return addedSensors as SensorAddingResponse[];
}


/** For debugging only.
 * 
 * Note: "Removed" sensors may still appear in the group.
 *      This is not an issue - readings are queried from when
 *      the sensor was last modified/updated (max_age).
 * 
 *      Decomissioned sensors can remain in the group without issue.
 * 
 */
async function removeAllMembers() {
    // get current members
    let currentMembers = [];
    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}`;

    let params = {
        group_id: PA_GROUP_ID
    }

    // @ts-ignore
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${query}`;

    const headers = { "X-API-KEY": PA_READ_KEY }
    try {
        const raw = await fetch_from_url(url, headers);
        currentMembers = raw.members;
    } catch (err) {
        console.error("Could not fetch current members: ", err);
        throw err
    }


    const queue = new PQueue({
        concurrency: 3,         // up to 5 active requests at once
        intervalCap: 1,         // no more than 1 requests per second
        interval: 1200,         // rate limit window
        carryoverIntervalCount: true        // keep flow steady between intervals
    });


    for (const member of currentMembers) {
        const member_id = member.id;

        queue.add(async () => {
            try {
                const url = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members/${member_id}`

                try {
                    const res = await fetch(url, {
                        method: "DELETE",
                        headers: { "X-API-KEY": PA_WRITE_KEY }
                    });
                
                    if (!res.ok) {
                        let errorDetails;
                        try { errorDetails = await res.json(); }
                        catch {
                            // Fallback if the body isn't JSON (e.g., a string or empty)
                            errorDetails = await res.text();
                        }
                
                        const errorMessage = typeof errorDetails === 'object' 
                            ? JSON.stringify(errorDetails) 
                            : errorDetails;
                
                        throw new Error(`HTTP ${res.status}: ${errorMessage}`);
                    }
                    console.log(res)
                } catch (err) {
                    console.error("Could not delete member: ", err);
                    throw err
                }

            } catch (err: any) {
                console.log(`Could not delete ${member_id}: `, err);
            }
        });
    }

    await queue.onIdle();
}




// ----- UTILITY FUNCTIONS ----- //



/**
 * Checks if a coordinate point is inside a polygon.
 * @param {Array<number>} point - [longitude, latitude]
 * @param {Array<Array<number>>} polygon - Array of [longitude, latitude] vertices
 * @returns {boolean} - true if the point is inside the polygon
 */
function isPointInPolygon(point, polygon) {
    const x = point[0]; // Longitude
    const y = point[1]; // Latitude
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        // Ray-casting math check
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}


/** Iterates through multiple polygons.
 * 
 * Polygons denote where US states are.
 * The rectangular bounding box containing Canada contains some US states,
 * which is why this function was created.
 * 
 * @param point {Array<number>} point - [longitude, latitude]
 */
function isPointInUS(point: Array<number>) {
    const areas_us_raw = _read_data('./outputs/subtract-bboxes.json');
    const areas_us: Array<Array<number>> = areas_us_raw.features.map(f => f.geometry.coordinates[0]);

    // none of the points should be in the bounding boxes
    return areas_us.map(a => isPointInPolygon(point, a)).some(result => result === true);
}


/**
 * Utility function to format API response.
 * Each row becomes an object w/ fields as attributes
 * 
 * Example:
 *      "fields": ["sensor_index", "last_seen"],
        "data": [  [279217, 1773209892], ...   ]
    becomes
        [ { sensor_index: 279217, last_seen: 1773209892 }, ...  ]
 * 
 * @param fields 
 * @param data 
 * @returns 
 */
const fieldMapper = (fields: string[], data: any[][]): Record<string, any>[] => {
    return data.map(row => row.reduce((acc, value, index) => {
        const key = fields[index];  // one of the field names
        acc[key] = value;
        return acc;
    }, {} as Record<string, any>));
}




            // 'sensor_index', s.sensor_index,
            // 'last_seen', r.last_seen,
            // 'name', s.name,
            // 'latitude', s.latitude,
            // 'longitude', s.longitude,

            // 'pm2.5_10minute',   r."pm2.5_10minute",
            // 'pm2.5_30minute',   r."pm2.5_30minute",
            // 'pm2.5_60minute',   r."pm2.5_60minute",
            // 'pm2.5_6hour',      r."pm2.5_6hour",
            // 'pm2.5_24hour',     r."pm2.5_24hour",
            // 'humidity',         r.humidity



// (async () => {

//     // await addNewMembers();

//     // Fetch Canada Sensors
    
//     const csensors_metadata_Filename = './outputs/canada-sensors.json'
//     const demo_data_readings_filename = './outputs/canada-pa-data.json'

//     const allSensorsCanada = await getCurrentMembers();
//     _write_data(csensors_metadata_Filename, allSensorsCanada);

//     const csensors = fieldMapper(allSensorsCanada.fields, allSensorsCanada.data).map(s => ({...s, name: "DEMO"}));
    

//     const demo_readings = _read_data(demo_data_readings_filename);
//     const readings = fieldMapper(demo_readings.fields, demo_readings.data);

//     const readingsMap = new Map(readings.map(r => [r.sensor_index, r]));

//     const integrated = csensors.map(s => {
//         let r = readingsMap.get(s.sensor_index);

//         return {
//             ...s,
//             ...r
//         }
//     });

//     console.log(integrated);


//     // const mapped = fieldMapper(allSensorsCanada.fields, allSensorsCanada.data);
//     // const demo_data = mapped.map(s => ({...s, name: "DEMO"}));

//     _write_data('./outputs/DEMO-DATA.json', integrated);
// })
// // ();