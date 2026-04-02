import { URLSearchParams } from "url";
import { _read_data, _write_data } from "../../utils"

import { fetch_from_url } from "../utils"
import { LOCATION_TYPE_OUTSIDE, METADATA_FIELDS, EDMONTON_BBOX_COORDINATES } from "./consts"


// const PURPLE_AIR_FIELDS="name,last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,latitude,longitude,humidity";
const READING_FIELDS="last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,humidity";

const { PA_READ_KEY, PA_GROUP_ID } = process.env;


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

