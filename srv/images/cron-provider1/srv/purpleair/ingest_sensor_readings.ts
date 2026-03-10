// ingest.ts

import { Client } from 'pg';
import sensorData from '../purpleair.json';

const client = new Client({
  connectionString: process?.env?.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/air_quality_data"
});

const READINGS_TABLE = 'sensor_readings';  // todo: replace with env

// TODO: store lat/lon in a separate area
const PURPLE_AIR_FIELDS=["name","last_seen","pm2.5_10minute","pm2.5_30minute","pm2.5_60minute","pm2.5_6hour","pm2.5_24hour","latitude","longitude","humidity"];
// const PURPLE_AIR_FIELDS="name,last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,latitude,longitude,humidity";
const PURPLE_AIR_READINGS=["last_seen","pm2.5_10minute","pm2.5_30minute","pm2.5_60minute","pm2.5_6hour","pm2.5_24hour","humidity"];
const READINGS_COLUMNS=[
    "sensor_index", "last_seen", "humidity", 
    "pm25_10m",
    "pm25_30m",
    "pm25_60m",
    "pm25_6h",
    "pm25_24h",
    "batch_time"
] as const;

const API_TO_DB_MAP = {
    "sensor_index": "sensor_index",
    "last_seen": "last_seen",
    "humidity": "humidity",

    "pm2.5_10minute": "pm25_10m",
    "pm2.5_30minute": "pm25_30m",
    "pm2.5_60minute": "pm25_60m",
    "pm2.5_6hour": "pm25_6h",
    "pm2.5_24hour": "pm25_24h"
} as const;



// columns in db are 1:1 with PURPLE_AIR_READINGS (except batch_time)
// const READINGS_COLUMNS = [...PURPLE_AIR_READINGS, "batch_time"] as const;


// type PurpleAirReading = (typeof PURPLE_AIR_READINGS)[number];


/**util function to map the returned field names to their respective object index
 * 
 * @param {string[]} fields
 * @returns {Record<string, number>}
 */
function _makeFieldMap(
  fields: string[]
): Record<string, number> {
  return fields.reduce((map, field, index) => {
    map[field] = index;
    return map;
  }, {});
}


function _formatSensorData(fields, data): Record<string, any>[] {
	return data.map(row => {
			const obj = {};
			fields.forEach((f, i) => obj[f] = row[i]);
			return obj;
		});
}





// supposedly faster
async function save_as_batch(sensor_rows: any[][], fields=[], batch_time: number) {
  function _extract_sensor_readings(
    sensor_readings: any[],
    fieldMap: Record<string, number>
  ): any[] {
      
      return PURPLE_AIR_READINGS.map(key => {
        const index = fieldMap[key];
        return sensor_readings[index];
      });
  }

  // format for db
  // needs to follow the same order as READINGS_COLUMNS
  function _format_data_for_db(
    extracted_sensor_readings: any[],
    batch_time: number
  ): any[] {
    return [...extracted_sensor_readings, batch_time]
  }



  const fieldMap = _makeFieldMap(fields);
  const query_batch_size = 200;

  for (var i=0; i<sensor_rows.length/query_batch_size; i++) {
    const sensors_batch = sensor_rows.slice(i*query_batch_size, Math.min((i+1)*query_batch_size, sensor_rows.length))
    // flatten rows into single array (across sensors)
    const extracted_readings = sensors_batch.flatMap(row =>
      _format_data_for_db(
        _extract_sensor_readings(row, fieldMap),
        batch_time
      )
    );

    // Create the placeholder string: ($1, $2, $3, $4, $5, $6, $7, $8), ($9, $10, ...)
    const placeholders = extracted_readings.slice(0, 3).map((_, i) => {
      const offset = i * READINGS_COLUMNS.length;
      const pg_indexes = READINGS_COLUMNS.map((_, i) => `$${offset+(i+1)}`);
      return pg_indexes.join(",");
    }).join(",");

    // ($1, $2, $3, $4, $5, $6, $7, $8)
    const q_columns_formatted = `(${READINGS_COLUMNS.join(',')})`;
    const q = 
        `INSERT INTO ${READINGS_TABLE} 
        ${q_columns_formatted}
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING`; // Prevent dupes if cron runs twice
    console.log(q);
    // console.log(extracted_readings.slice(0, 9));

    await client.query(q, extracted_readings);
  }
}

async function runIngestion() {
//   const response = await fetch('YOUR_API_URL');
//   const json = await response.json();
    const json = sensorData;

  const batch_time = new Date(json.data_time_stamp * 1000);
  const sensor_rows = json.data;

  const processed_data = _formatSensorData(json.fields, sensor_rows);
  
  await client.connect();


  for (const sensor of Object.values(processed_data)) {
      const {
        sensor_index, last_seen, humidity, 
        "pm2.5_10minute": pm25_10m, 
        "pm2.5_30minute": pm25_30m,
        "pm2.5_60minute": pm25_60m,
        "pm2.5_6hour": pm25_6h,
        "pm2.5_24hour": pm25_24h
      } = sensor;

      // format query
      const q = 
        `INSERT INTO ${READINGS_TABLE} 
        (sensor_index, batch_time, last_seen, humidity, pm25_10m, pm25_30m, pm25_60m, pm25_6h, pm25_24h)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING`; // Prevent dupes if cron runs twice

      const values = [
        sensor_index, batch_time, new Date(last_seen*1000), humidity,
        pm25_10m, pm25_30m, pm25_60m, pm25_6h, pm25_24h
      ]

      await client.query(q, values);
      console.log(`added sensor ${sensor.name}`);

  }


  await client.end();


}

(async () => {
    await runIngestion();
})();


// TODO: update metadata in separate cronjob
    // // 1. Update Sensor Metadata
    // await client.query(
    //   `INSERT INTO sensors (sensor_index, name, latitude, longitude)
    //    VALUES ($1, $2, $3, $4)
    //    ON CONFLICT (sensor_index) DO UPDATE SET 
    //    name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
    //   [sensor_index, name, lat, lon]
    // );