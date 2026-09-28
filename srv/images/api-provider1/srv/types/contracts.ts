/**
 * Data schemas
 */



export type RegionReading = {
    region_id: string
    name: string,
    lat: number,
    lon: number,

    timestamp: number,
    aqhi: number | null,
    backup_aqhi: number | null,

    stations: StationReading[]
}

// SPECIFIC TO ECCC, NOT AB GOV
type StationReading = {
    naps_id: number,
    name: string,
    timestamp: number,
    aqhi: number
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

