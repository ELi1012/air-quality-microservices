Contains the following:
- api service to serve air quality station data
- cron job to pull:
    1. station data from government API
    2. PM2.5 sensor data from PurpleAir
- gateway: contains react app

Please note: this is a temporary implementation.
Main objective is to move off Azure ASAP.
You'll see some old docker files - please ignore, those are just for reference.

Done:
- postgres database implementation
- containers can talk to each other

What I'll do next:
- prune postgres database w/ extra cronjobs
- methods to update table metadata (stations, sensors)


Steps:
- run all commands in `docker-builds.sh`
- run `docker compose up -d`
- check if api service works: `curl http://localhost/api/purpleair`



Note: the `docker-compose.yaml` file is omitted from the repo
because it contains secrets. Please email if you need it.


# About the Data

The API and cron providers are responsible for two data sources:
1. FEM Stations: aka stations, ACA stations
2. PurpleAir PM2.5 Sensors: aka sensors, pa sensors


### FEM Stations

Hourly air quality readings, updated throughout the hour.
Updates typically happen around 20-40 minutes into the hour,
hence the cronjob updates at minutes 20, 30, and 40.

Eg. The station measurements for 1:00 pm are usually available at 1:20, 1:30, or 1:40.

New stations won't be added often, so the future cronjob
will probably check for new stations every month.


### PurpleAir PM2.5 Sensors

PM2.5 readings. Cronjob pulls readings every 30 min.
Unlike stations, PA sensors are quick to update (almost to the minute).

However, they use a private API so each pull does cost some money.

New sensors will be checked every week by a cronjob (currently under construction.)

