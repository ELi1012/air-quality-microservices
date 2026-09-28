/**
 * Updates db with latest purpleair sensor readings.
 */

import { updateReadings } from "../db/update_sensor_readings";
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updateReadings, "Sensors synced successfully", "Cronjob failed to sync purpleair data");
})
();     // comment this entire line to prevent execution