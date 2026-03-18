/**
 * Updates list of stations + their name, lat, lon.
 * 
 */

import { updateStationMetadata } from "../db/metadata"
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updateStationMetadata, "Station metadata synced successfully", "Cronjob failed to sync ACA station metadata");
})
();     // comment this entire line to prevent execution