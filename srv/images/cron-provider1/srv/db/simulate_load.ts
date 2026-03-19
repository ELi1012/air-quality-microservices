import { getMicrosensors } from "../azure/fetch_sensors";
import { getStations } from "../azure/fetch_stations";

import { updateReadings } from "./update_sensor_readings";
import { updateStationMeasurements } from "./update_station_measurements";

import _ from "lodash";

// to end connection
import { pool } from "./pools"

import * as fs from "fs"
import { _read_data, _write_data } from "../utils";

const LOG_DIRECTORY = "./logs"

// formats timestamp for readable folders
// for logging only
// example: Mar-17__14:00-6

function getFolderName(ts: string | number): string {
    const date = new Date(ts);

    const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'shortOffset' // This gives us "GMT-6" or "GMT+5:30"
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    
    // Extract the offset (e.g., "GMT-06:00" -> "-06:00")
    const tzName = getPart('timeZoneName') || ''; 
    const offset = tzName.replace('GMT', '') || '+00:00';

    return `${month}-${day}__${hour}:${minute}:${second}${offset}`;
}


// if you want to time the duration of each function
// makes code too complicated - leave out for now
async function runAndTime(fn: () => any) {
    const now = Date.now();
    const result = await fn();
    const duration = (Date.now() - now)/1000;

    return { result, duration }
}


async function updateDatabases() {
    try {
        await Promise.all([
            updateReadings(),
            updateStationMeasurements()
        ]);
    } catch (err) {
        console.error(`Couldn't update databases (pg): `, err)
    }
}



// MAKE SURE CRONJOB IS RUNNING BEFORE ACCESSING FROM DB
// otherwise db data won't match azure data
(async () => {
    const now = Date.now();

    // await updateDatabases();
    // return;

    // -- update database
    const [_, azSensors, azStations] = await Promise.all([
        updateReadings(),       // needs to run at same time as azure function
        getMicrosensors(),
        getStations()
    ]);
    
    // --- fetch from database
    const [dbSensors, dbStations] = await Promise.all([
        [], []
        // getLatestReadings(),
        // getLatestStationMeasurements()
    ]);

    console.log(`Took ${(Date.now() - now)/1000} s to finish all`)
    pool.end();

    // --- log results

    // make dir
    const folderName = `${LOG_DIRECTORY}/${getFolderName(now)}/`;
    fs.mkdirSync(folderName, { recursive: true });

    // put results in dir
    _write_data(`${folderName}dbSensors.json`, dbSensors);
    _write_data(`${folderName}dbStations.json`, dbStations);
    _write_data(`${folderName}azSensors.json`, azSensors);
    _write_data(`${folderName}azStations.json`, azStations);
})
();