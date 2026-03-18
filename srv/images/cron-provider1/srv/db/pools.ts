import { Pool } from "pg";

// All of the following properties should be read from environment variables
// We're hardcoding them here for simplicity
// const pa_pool = new Pool({
//   host: "localhost", // or wherever the db is hosted
//   user: "lukewarmspaghettisauce",
//   database: "purpleair",
//   password: "Bunniez12#",
//   port: 5432 // The default port
// });

// const stations_pool = new Pool({
//   host: "localhost", // or wherever the db is hosted
//   user: "lukewarmspaghettisauce",
//   database: "aca_stations",
//   password: "Bunniez12#",
//   port: 5432 // The default port
// });

const pool = new Pool({
  host: "localhost", // or wherever the db is hosted
  user: "lukewarmspaghettisauce",
  database: "air_quality_data",
  password: "Bunniez12#",
  port: 5432 // The default port
});


export { pool };