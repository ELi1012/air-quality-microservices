
-- Purpose: confirm tables have received updated data

-- Purpleair
\c purpleair

SELECT DISTINCT ON (sensor_index) *
    FROM readings
    ORDER BY sensor_index, last_seen DESC;


-- Stations
\c aca_stations

SELECT DISTINCT ON (station_key) *
    FROM measurements
    ORDER BY station_key, timestamp DESC;
-- look at last_updated, not timestamp