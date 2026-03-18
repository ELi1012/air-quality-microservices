

import { updatePurpleairMetadata } from "../db/metadata";
import { runCronjob } from "./util";

(async () => {
    await runCronjob(updatePurpleairMetadata, "Purpleair metadata synced successfully", "Cronjob failed to sync Purpleair metadata");
})
();     // comment this entire line to prevent execution