/** Update region metadata.
 * 
 * Properties:
 * - region ID (CGNDB)
 * - lat
 * - lon
 * - MSC Datamart URL
 * 
 */


import { formatUrl, fixCurrentObservationPath } from "./utils"
import { _read_data, _write_data } from "../../utils";

import { type Region } from "../../types/contracts"




/**
 * 
 * Links to the relevant XML data for each region.
 * These links provide a region's individual AQHI stations
 * (if applicable).
 * 
 * Use output to check if a region
 * even has individual AQHI stations.
 * 
 */

async function fetchRegionMetadata() {
    const baseUrl = 'https://api.weather.gc.ca/collections/aqhi-stations/items'
    const options = {
        f: "json",
        limit: "1000",
    };

    const url = formatUrl(baseUrl, options);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch stations list");

        const data = await response.json();

        if (data === null || data === undefined) {
            console.error("Could not fetch region metadata from ECCC. Check here: https://api.weather.gc.ca/openapi?f=html#/aqhi-stations/getAqhi-stationsFeatures");
        }

        return data;
    } catch (error) {
        console.error("Error fetching region metadata:", error);
        throw error;
    }
}

/** Fetches and formats metadata for each region.
 * 
 * @returns 
 */
export async function getGeoMetRegionalMetadata(): Promise<Region[]> {
    const rawRegionMetadata = await fetchRegionMetadata();

    // format metadatas
    let regionMetadatas = rawRegionMetadata.features.map(f => ({
        id: f.id,       // CGNDB ID (Canadian Geographical Names Database)
        properties: f.properties,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        name: f.properties.location_name_en,
    }));


    // clean up + unnest datamart urls
    regionMetadatas = regionMetadatas.map(f => {
        const rawLink = f.properties?.["url_msc-datamart_observation"];
        const datamart_link = rawLink ? fixCurrentObservationPath(rawLink) : null;

        return { ...f, "url_msc-datamart_observation": datamart_link }
    });

    return regionMetadatas;
}

