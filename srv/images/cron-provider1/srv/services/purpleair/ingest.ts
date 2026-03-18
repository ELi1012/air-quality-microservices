import { URLSearchParams } from "url";
import { _read_data, _write_data } from "../../utils"

import { pool } from "../postgres/pool"
import format from "pg-format"

// const client = new Client({
//   connectionString: process?.env?.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/air_quality_data"
// });

const METADATA_FIELDS="name,latitude,longitude";
// const PURPLE_AIR_FIELDS="name,last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,latitude,longitude,humidity";
const READING_FIELDS="last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,humidity";
const LOCATION_TYPE_OUTSIDE = 0;
const EDMONTON_BBOX_COORDINATES = {
    nwlat: 53.7158,
    nwlng: -113.7945,
    selat: 53.3690,
    selng: -112.6420,
}

const { PA_READ_KEY, PA_GROUP_ID } = process.env;

async function fetch_from_url(url: string, headers: Record<string, any>) {
    const response = await fetch(url, {
        method: "GET",
        headers
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;

}

export async function get_purpleair_sensor_data() {
    if (PA_READ_KEY === undefined) throw new Error("PURPLEAIR READ KEY NOT PROVIDED");
    if (PA_GROUP_ID === undefined) throw new Error("PURPLEAIR GROUP ID NOT PROVIDED");

    const baseUrl = `https://api.purpleair.com/v1/groups/${PA_GROUP_ID}/members`;

    let params = {
        fields: READING_FIELDS,
        location_type: LOCATION_TYPE_OUTSIDE,  // this group should only have outdoor sensors
        ...(EDMONTON_BBOX_COORDINATES || {})
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
        ...(EDMONTON_BBOX_COORDINATES || {})
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

