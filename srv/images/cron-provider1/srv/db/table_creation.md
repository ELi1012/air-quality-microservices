-- STATIONS

CREATE TABLE IF NOT EXISTS stations (
    station_key INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10,7) NOT NULL,
    lon DECIMAL(10,7) NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE station_measurements (
    station_key INT,
    timestamp TIMESTAMPTZ NOT NULL,
    raw_timestamp TEXT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    -- Pollutant readings
    no2 REAL,
    so2 REAL,
    pm25 REAL,
    o3 REAL,
    co REAL,
    h2s REAL,
    
    -- AQI/AQHI values
    aqhi SMALLINT,
    aqi SMALLINT,
    manual_aqhi SMALLINT,

    extraInfo JSONB,
    
    -- Composite Primary Key
    PRIMARY KEY (station_key, timestamp),
    FOREIGN KEY (station_key) REFERENCES stations(station_key) ON DELETE CASCADE
);

CREATE TABLE station_aqis (
    station_key INT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    pollutant TEXT NOT NULL,
    value REAL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (station_key, timestamp, pollutant),
    FOREIGN KEY (station_key, timestamp) REFERENCES station_measurements(station_key, timestamp) ON DELETE CASCADE
);



-- PURPLEAIR
CREATE TABLE IF NOT EXISTS sensors (
    sensor_index INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    sensor_index INT REFERENCES sensors(sensor_index),
    last_seen BIGINT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    -- PM2.5 Readings
    "pm2.5_10minute" REAL,
    "pm2.5_30minute" REAL,
    "pm2.5_60minute" REAL,
    "pm2.5_6hour" REAL,
    "pm2.5_24hour" REAL,

    
    -- Other
    humidity REAL,
    
    PRIMARY KEY (sensor_index, last_seen)
);




