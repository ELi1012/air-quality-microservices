/**
 * Updates list of stations + their name, lat, lon.
 * 
 */

import { updateRegionMetadata } from "../db/metadata"
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updateRegionMetadata, "Region metadata synced successfully", "Cronjob failed to sync ECCC region metadata");
})
();     // comment this entire line to prevent execution