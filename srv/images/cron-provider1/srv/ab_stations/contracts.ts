/**
 * Data schemas
 */




// the parameters we want to report for each station
// see here for full list of allowed parameters:
// https://data.environment.alberta.ca/EDWServices/aqhi/odata/Parameters?$format=json&$select=Name&$orderby=Name
export type PollutantKey = "co" | "pm25" | "h2s" | "no2" | "o3" | "so2";



// Unified shape for a single station's readings
export interface StationRecord {
    station_key?: number;
    name: string;
    name_fr?: string;
    timestamp: Date;

    raw_timestamp: string;

    lat: number | null;
    lon: number | null;

    readings: Record<PollutantKey, number | null>;
    aqhi: number | null;
    aqi?: number | null;

    manual_aqhi: number | null;
    aqis: [PollutantKey, number][]

    extraInfo: Record<string, any>
}




