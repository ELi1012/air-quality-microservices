import { URLSearchParams } from "url";
import { _read_data, _write_data } from "../../utils"

import { fetch_from_url } from "../utils"
import { LOCATION_TYPE_OUTSIDE, METADATA_FIELDS, ALBERTA_BBOX_COORDINATES, EDMONTON_BBOX_COORDINATES } from "./consts"


// const PURPLE_AIR_FIELDS="name,last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,latitude,longitude,humidity";
const READING_FIELDS="last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,humidity";


// if ENVIRONMENT === "dev", use edmonton bbox
const { PA_READ_KEY, PA_GROUP_ID, ENVIRONMENT } = process.env;


type PurpleairGroupResponse = {
    "api_version": string,
    "time_stamp": number,
    "data_time_stamp": number,
    "group_id": number,
    "location_type": 0,
    "max_age": number,
    "fields": [
        "sensor_index",
        "last_seen",
        "humidity",
        "pm2.5_10minute",
        "pm2.5_30minute",
        "pm2.5_60minute",
        "pm2.5_6hour",
        "pm2.5_24hour"
    ],
    "data": 
        [
            number,   // sensor_index
            number,   // last_seen
            number,   // humidity
            number,   // pm2.5_10minute
            number,   // pm2.5_30minute
            number,   // pm2.5_60minute
            number,   // pm2.5_6hour
            number    // pm2.5_24hour
        ][]
}

export async function get_purpleair_sensor_data(): Promise<PurpleairGroupResponse> {
    if (PA_READ_KEY === undefined) throw new Error("PURPLEAIR READ KEY NOT PROVIDED");
    if (PA_GROUP_ID === undefined) throw new Error("PURPLEAIR GROUP ID NOT PROVIDED");

    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members`;

    // fetch edmonton only when testing
    if (ENVIRONMENT === "dev") console.log('Querying sensors from Edmonton only');
    const bbox = ENVIRONMENT === "dev" ? EDMONTON_BBOX_COORDINATES : ALBERTA_BBOX_COORDINATES;

    let params = {
        fields: READING_FIELDS,
        location_type: LOCATION_TYPE_OUTSIDE,  // this group should only have outdoor sensors
        ...(bbox || {})
    }

    // @ts-ignore
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${query}`;      // use this instead

    const headers = { "X-API-KEY": PA_READ_KEY }
    try {
        return await fetch_from_url(url, headers);
    } catch (err) {
        console.error("Could not fetch sensor data: ", err)
    }
}

export async function get_group_metadata() {
    if (PA_READ_KEY === undefined) throw new Error("PURPLEAIR READ KEY NOT PROVIDED");
    if (PA_GROUP_ID === undefined) throw new Error("PURPLEAIR GROUP ID NOT PROVIDED");

    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members`;

    let params = {
        fields: METADATA_FIELDS,
        location_type: LOCATION_TYPE_OUTSIDE,  // this group should only have outdoor sensors
        ...(ALBERTA_BBOX_COORDINATES || {})
    }

    // @ts-ignore
    const query = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${query}`;      // use this instead

    const headers = { "X-API-KEY": PA_READ_KEY }

    try {
        return await fetch_from_url(url, headers);
    } catch (err) {
        console.error("Could not fetch sensor metadata: ", err)
    }
}

