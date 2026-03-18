/**
 * Abandoned station comparison - rolling updates + slow fetch times makes a thorough comparison impractical
 */

import { _read_data, _write_data, getFilesFromDir } from "../../utils";
import * as fs from "fs";
import path from 'path';


const INPUT_FOLDER = './logs/'
const OUTPUT_FOLDER = 'postgres/crons/diffs/'


/**
 * Normalizes an object according to comparison rules.
 */
function normalizeStationData(obj) {
  // Use structuredClone to avoid mutating the original objects
  const normalized = structuredClone(obj);

  // Rule: Round readings to 3 decimal places
  if (normalized.readings) {
    for (const key in normalized.readings) {
      if (typeof normalized.readings[key] === 'number') {
        normalized.readings[key] = Number(normalized.readings[key].toFixed(3));
      }
    }
  }

  // Rule: aqis order stays the same, readings rounded to 3 decimal places
  if (Array.isArray(normalized.aqis)) {
    normalized.aqis = normalized.aqis.map(item => [
      item[0], 
      typeof item[1] === 'number' ? Number(item[1].toFixed(3)) : item[1]
    ]);
  }

  // Rule: Rename extraInfo to extra_info
  if (normalized.extraInfo !== undefined) {
    normalized.extra_info = normalized.extraInfo;
    delete normalized.extraInfo;
  }

  if (normalized.timestamp) {
    normalized.timestamp = (new Date(normalized.timestamp)).getTime();
  }

  // Rule: Remove use_aqi before comparison
  if (normalized.extra_info && normalized.extra_info.use_aqi !== undefined) {
    delete normalized.extra_info.use_aqi;
  }

  return normalized;
}

/**
 * Standard deep equality check.
 */
function isDeepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    console.log('typeof check failed');
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    console.log('different key lengths');
    return false
  };

  for (const key of keys1) {
    if (!keys2.includes(key)) {
        console.log(`${key} not found in second object`);
        return false;
    }

    // if (key === 'timestamp' && new Date(obj1[key]) !== new Date(obj2[key])) {
    //     return false;
    // }

    if (!isDeepEqual(obj1[key], obj2[key])) {
        console.log(`deep equal failed on ${key}`);
        return false;
    }
  }

  return true;
}


function compareMetadata(obj1, obj2) {
    // only compare: station_key, name, lat, lon, timestamp, raw_timestamp
    const keys = ['station_key', 'name', 'lat', 'lon', 'timestamp', 'raw_timestamp'];
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    for (const k of keys) {
        if (!keys1.includes(k) && !keys2.includes(k)) {
            console.log(`${k} missing from both objects`);
            continue;
        }

        const val1 = obj1[k];
        const val2 = obj2[k];

        // date conversion
        if (k === 'timestamp' && new Date(val1).getTime() !== new Date(val2).getTime()) {
            console.log(`timestamps don't match: ${new Date(val1)} !== ${new Date(val2)}`);
            return false;
        }

        if (val1 !== val1) {
            console.log(`mismatch for ${k}: ${val1}`);
            return false;
        }
    }

    return true;
}

/**
 * Compares two lists of objects matching by station_key.
 */
function compareStationLists(list1, list2, output_folder) {
  const list2Map = new Map(list2.map(item => [item.station_key, item]));
  const results = [];
  const list1_output = "list1_diff.json";
  const list2_output = "list2_diff.json";

  for (const item1 of list1) {
    const item2 = list2Map.get(item1.station_key);

    if (!item2) {
      results.push({ station_key: item1.station_key, isEqual: false, error: 'Missing in second list' });
      continue;
    }

    const norm1 = normalizeStationData(item1);
    const norm2 = normalizeStationData(item2);

    // const isEqual = isDeepEqual(norm1, norm2);
    const isEqual = compareMetadata(norm1, norm2);

    if (!isEqual) {
        // make output folder
        fs.mkdirSync(output_folder, { recursive: true });

        // write data
        _write_data(`${output_folder}${list1_output}`, item1);
        _write_data(`${output_folder}${list2_output}`, item2);

        // write results
        results.push({
          station_key: item1.station_key,
          isEqual,
          item1,
          item2
        });
    }

  }

  if (results.length > 0) {
        // make output folder
        fs.mkdirSync(output_folder, { recursive: true });

        // write data
        for (const r of results) {
            _write_data(`${output_folder}${list1_output}`, r.item1);
            _write_data(`${output_folder}${list2_output}`, r.item2);
        }

        // write results
        _write_data(`${output_folder}results.json`, results.map(r => r.station_key))
    }

  return results;
}


function compareSensors(dbFile: string, azFile: string) {
    const azSensors = _read_data(azFile);
    const dbSensors = _read_data(dbFile);

    if (azSensors.length !== dbSensors.length) return false;

    // remove use_aqi from extra_info
    

    // Create a lookup map by sensor_index
    const lookup = _.keyBy(azSensors, 'sensor_index');

    // Check if every item in the second array has a deep match in the first
    return _.every(dbSensors, (item2) => {
        const item1 = lookup[item2.sensor_index];
        return item1 && _.isEqual(item1, item2);
    });
}


(async () => {


    // 1. Get all filenames in the directory
    const filenames = fs.readdirSync(INPUT_FOLDER, {recursive: true}) as string[];
    
    // 2. sort by date and type (azure or local db)
    const filteredFilenames = filenames.filter(file => file.endsWith('.json'));
    const logs = {};
    for (const filename of filteredFilenames) {
        const date = filename.split('/')[0];
        const logType = filename.split('/').at(-1);
        const key = logType.includes('az') 
            ? 'azure'
            : logType.includes('db') 
                ? 'db'
                : null;
        if (key === null) {
            console.log(`filename skipped: ${filename}`);
            continue;
        }

        logs[date] = {
            ...logs[date],
            [key]: filename
        }
    }

    
    // 3. do comparison
    for (const [key, val] of Object.entries(logs)) {
        console.log(`----------------- ${key}`)
        // prepare folder for diff comparison
        const folderName = `${OUTPUT_FOLDER}${key}/`
        
        // azure
        const azFilename = val.azure;
        const azData = _read_data(`${INPUT_FOLDER}${azFilename}`)
        // db
        const dbFilename = val.db;
        const dbData = _read_data(`${INPUT_FOLDER}${dbFilename}`)

        // compare station files
        const result = compareStationLists(azData, dbData, folderName);
    }

    
})
();