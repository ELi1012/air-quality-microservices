/**
 * fetchAllStations: Fetches all station metadata (infrequently changed)
 */

type StationRaw = {
    StationKey: number;
    Name: string;
    Latitude: number;
    Longitude: number;
}

async function fetchAllStations(): Promise<StationRaw[]> {

    const url = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Stations?$format=json&$select=StationKey,Name,Latitude,Longitude&$orderby=StationKey`;
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const jsonData = await response.json();
        const data: StationRaw[] = jsonData.value;
        
        return data;

    } catch (err) {
        throw new Error(`Could not fetch ACA station keys: ${err}`);
    }
}



// fetch metadata for ONE station
// useful for upserting measurements for nonexistent stations (prevents foreign key violation)
async function fetchStationMetadata(station_key: number): Promise<StationRaw | null> {
    const url = `https://data.environment.alberta.ca/EDWServices/aqhi/odata/Stations?$format=json&$select=StationKey,Name,Latitude,Longitude&$filter=StationKey eq ${station_key}&$orderby=StationKey`;
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }

        const jsonData = await response.json();
        const data: StationRaw[] = jsonData.value;

        if (data.length === 0) {
            console.warn(`No station found for key ${station_key}`);
            return null;
        }

        if (data.length > 1) console.warn(`Found more than one station for ${station_key}: ${data.map(s => s.StationKey)}`);
        
        return data[0];

    } catch (err) {
        throw new Error(`Could not fetch station metadata for ${station_key}: ${err}`);
    }
}


export {
    fetchAllStations,
    fetchStationMetadata
}