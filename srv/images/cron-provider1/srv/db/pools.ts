import { Pool } from "pg";


// get env variables
if (process?.env === undefined) throw new Error("Env variables missing");

const { DATABASE_URL } = process?.env;
if (!DATABASE_URL || DATABASE_URL.trim() === "") throw new Error("Database url is missing from env");


// start connection pool
const pool = new Pool({
  connectionString: DATABASE_URL
});


export { pool };