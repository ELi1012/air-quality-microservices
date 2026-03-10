# check how many rows in the table
sudo -u postgres psql -d purpleair -c "SELECT COUNT(*) FROM sensor_readings;"

# to clear table
TRUNCATE TABLE sensor_readings