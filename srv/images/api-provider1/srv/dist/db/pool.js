"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runQuery = runQuery;
const pg_1 = require("pg");
const { DATABASE_URL } = process?.env;
if (DATABASE_URL === undefined)
    throw new Error("Database url is missing from env");
const pool = new pg_1.Pool({
    connectionString: DATABASE_URL
});
// error handling must be done from caller
async function runQuery(query) {
    const start = Date.now(); // for logging
    await pool.connect();
    const res = await pool.query(query);
    const duration = Date.now() - start;
    console.log(`executed query for ${duration / 1000} s`);
    return res;
}
