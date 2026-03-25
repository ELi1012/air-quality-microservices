import { Pool } from "pg";


const { DATABASE_URL } = process?.env;
if (DATABASE_URL === undefined) throw new Error("Database url is missing from env");

const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,      // wait 5 s for a connection before failing
    idleTimeoutMillis: 30000            // close idle clients after 30 s
});


// error handling must be done from caller
export async function runQuery(query: string) {

    const start = Date.now();   // for logging
    try {
        const res = await pool.query(query);
    
        const duration = Date.now() - start;
        console.log(`executed query for ${duration/1000} s`);
    
        return res;
    } catch (err) {
        console.error("Database query failed:", err.message);
        throw err;
    }
}


