import { Pool } from "pg";


const { DATABASE_URL } = process?.env;
if (DATABASE_URL === undefined) throw new Error("Database url is missing from env");

const pool = new Pool({
    connectionString: DATABASE_URL
});


// error handling must be done from caller
export async function runQuery(query: string) {

    const start = Date.now();   // for logging

    await pool.connect();
    const res = await pool.query(query);

    const duration = Date.now() - start;
    console.log(`executed query for ${duration/1000} s`);

    return res;
}


