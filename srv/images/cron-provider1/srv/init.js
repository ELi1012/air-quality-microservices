/** Initialization for cron service.
 * 
 * - Sets up databases
 * - Populates metadata tables
 * 
 * The actual jobs to run are located in `/srv/jobs/`
 * 
 */


import { createAllTables } from "./db/db_setup"
import { updatePurpleairMetadata, updateRegionMetadata } from "./db/metadata";


(async () => {
    try {
        
        await createAllTables();
        await updatePurpleairMetadata();
        await updateRegionMetadata();

        console.log('[init] Database schema and metadata tables initialized successfully.');
        console.log('[init] Ready to run cron jobs - found under `/srv/jobs/`.');
    } catch (err) {
        console.error('[init] Database initialization failed during table creation or metadata population:', err);
    }
})();