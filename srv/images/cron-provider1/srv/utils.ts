import * as fs from "fs";
import { formatInTimeZone } from 'date-fns-tz';
import path from 'path';


// only json files
export function getFilesFromDir(dir: string) {
  
  // 1. Get all filenames in the directory
  const filenames = fs.readdirSync(dir);
  
  // 2. Filter for JSON files and map them to your function
  const files = filenames
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const fullPath = path.join(dir, file);
      return _read_data(fullPath);
    });
  
    return files;
}


export function _read_data(filepath) {
  try {
    const raw = fs.readFileSync(filepath, "utf-8");
    const data = JSON.parse(raw);

    return data;
  } catch (error) {
    throw new Error(`Could not read data at ${filepath}`)
  }
}

export function _write_data(filepath, data, indentation=2) {
  // data can be any js value (usually object, array)
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, indentation));
  } catch (error) {
    console.log(error);
    throw new Error(`Could not write data to ${filepath}`)
  }
}


export function formatToLocalISO(date: Date) {
  // 'XXX' in the pattern prints the timezone offset (e.g., -06:00 or -07:00)
  // 'America/Edmonton' ensures it checks the AB rules for that specific date
  return formatInTimeZone(date, 'America/Edmonton', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export type Timestamp = string | number | Date;

/**
 * Ensures the timestamp input is converted to a valid Unix timestamp.
 * This prevents "Invalid Date" from polluting your AQHI calculations.
 */
export function normalizeTimestamp(timestamp: Timestamp): number {
    const parsed = new Date(timestamp).getTime();
    
    if (isNaN(parsed)) {
        throw new Error(`Invalid timestamp provided: ${timestamp}`);
    }
    else if (parsed > new Date().getTime()) {
        throw new Error(`reference timestamp (${timestamp}) cannot be in the future.`);
    }
    
    return parsed;
}


// handles cases where number is a string like '1.2'
export function parseNumber(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    const parsed = Number(val);
    return isNaN(parsed) ? null : parsed;
};


// inclusive of both start and end
export function dateInRange(ts: Date, start: Date, end: Date): boolean {
    return ts.getTime() >= start.getTime() && ts.getTime() <= end.getTime();
}


