/**
 * Updates db with latest station measurements.
 */

import { updateStationMeasurements } from "../db/update_station_measurements";
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updateStationMeasurements, "Stations synced successfully", "Cronjob failed to sync ACA station data");
})
();     // comment this entire line to prevent execution