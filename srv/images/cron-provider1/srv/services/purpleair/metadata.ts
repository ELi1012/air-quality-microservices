/**
 * Purpose: Update sensor metadata
 * - Add newly registered PurpleAir sensors
 * - Remove PurpleAir sensors down for > 6 months
 * 
 * 
 * Note difference between fetching from *group* and fetching from non-group:
 * - group is a user-defined collection of sensors
 *      - makes fetching cheaper and more efficient
 * - non-group: should only be for updating the group
 *      - may contain newly added sensors not currently in group
 * 
 * See here for how to make API calls w/ PurpleAir:
 *      https://community.purpleair.com/t/making-api-calls-with-the-purpleair-api/180
 * 
 * 
 * TODO: change from edmonton to alberta
 * - currently using edmonton to keep api costs low during testing
 * 
 */

import PQueue from 'p-queue';               // handles multiple API requests while respecting rate limits
import { fetch_from_url, validateEnvs } from "../utils"   // utility functions
import { LOCATION_TYPE_OUTSIDE, ALBERTA_BBOX_COORDINATES, EDMONTON_BBOX_COORDINATES, METADATA_FIELDS } from "./consts"

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
    } catch (err) {
        console.error("Could not fetch current members: ", err);
        throw err
    }
}


// sensors not within our cached group
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


// all sensors that reported in the last month
async function fetchAllSensorsAlberta() {
    let params: Record<string, any> = {
        fields: 'last_seen',    // in seconds
        max_age: ONE_MONTH,
        location_type: LOCATION_TYPE_OUTSIDE,
        ...(ALBERTA_BBOX_COORDINATES || {})
    }

    return await getSensors(params);
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
 * - fetch ALL sensors within Alberta
 * - fetch current members in group
 * - compare the two
 * - add all sensors that are NOT in group
 * - pass newly added sensors to calling function to update database
 * 
 * @returns List of newly added sensors. Includes all metadata necessary to update table with.
 */
export async function addNewMembers(): Promise<SensorAddingResponse[]> {
    const allRaw = await fetchAllSensorsAlberta();
    const membersRaw = await getCurrentMembers();


    const all = fieldMapper(allRaw.fields, allRaw.data);
    const membersCurrent = fieldMapper(membersRaw.fields, membersRaw.data);

    // add new members
    const membersIndexes = membersCurrent.map(m => m.sensor_index);
    const toAdd = all.filter(s => !membersIndexes.includes(s.sensor_index));

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



// for debugging only
async function removeMembers(){//(sensor_indexes: number[]) {
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


// (async () => {
//     // const allSensorsRaw = _read_data('./outputs/all-sensors.json');
//     // const allSensors = allSensorsRaw.data.map(row => row[0]);

//     // const currentMembersRaw = _read_data('./outputs/pa-2772-group.json');
//     // const currentMembers = currentMembersRaw.members.map(row => row.sensor_index);

//     // console.log(allSensors.filter(idx => !currentMembers.includes(idx)));

//     // const newMembers = await addNewMembers();
//     // _write_data('./outputs/newMembers.json', newMembers)

// })
// ();