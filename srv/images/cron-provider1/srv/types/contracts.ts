/**
 * Data schemas
 */


export type RegionReading = {
    id: string,
    name: string,
    aqhi: string | number | null,
    timestamp: Date | null,
    rawTimestamp: string | null,
    lat: number,
    lon: number,
    extraInfo?: Record<string, any>,

    "msc-datamart-data"?: Record<string, any>
}


export type Region = {
    id: string,
    name: string,
    lat: number,
    lon: number,
    
    "url_msc-datamart_observation": string
}




export type BaseMicrosensor = {
    sensor_index: number
    last_seen: number // unix timestamp
    name: string
    latitude: number
    longitude: number
    humidity: number

    "pm2.5_10minute": number
    "pm2.5_30minute": number
    "pm2.5_60minute": number
    "pm2.5_6hour": number
    "pm2.5_24hour": number
};

