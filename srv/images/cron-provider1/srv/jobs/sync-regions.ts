/**
 * Updates db with latest region AQHIs (hourly).
 */

import { updateRegionAqhis } from "../db/update_region_readings";
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updateRegionAqhis, "Region AQHIs synced successfully", "Cronjob failed to sync ECCC AQHI readings");
})
();     // comment this entire line to prevent execution