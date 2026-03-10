// ingest_metadata.ts

import { Client } from 'pg';
import sensorData from '../purpleair.json';

const client = new Client({
  connectionString: process?.env?.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/air_quality_data"
});

const METADATA_TABLE = 'sensors';  // todo: replace with env

const PURPLE_AIR_FIELDS=["name","last_seen","latitude","longitude"];
// const PURPLE_AIR_FIELDS="name,last_seen,pm2.5_10minute,pm2.5_30minute,pm2.5_60minute,pm2.5_6hour,pm2.5_24hour,latitude,longitude,humidity";


function _formatSensorData(fields, data): Record<string, any>[] {
	return data.map(row => {
			const obj = {};
			fields.forEach((f, i) => obj[f] = row[i]);
			return obj;
		});
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
      const { sensor_index, name, latitude, longitude } = sensor;

      // format query
      const q = 
        `INSERT INTO ${METADATA_TABLE} 
        (sensor_index, name, latitude, longitude)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING`; // Prevent dupes if cron runs twice
        console.log(q);

      const values = [sensor_index, name, latitude, longitude]
      console.log(values)

      await client.query(q, values);
  }


  await client.end();


}

(async () => {
    await runIngestion();
})();

