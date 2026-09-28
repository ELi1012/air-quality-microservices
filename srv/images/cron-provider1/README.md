# About

This service runs multiple cronjobs, whose purpose
is to fetch periodic air quality data from 2 data sources.

Cronjobs are run using Javascript's NPM. I define
each job to run as an npm command under `srv/package.json`.
Each NPM command points to a build file generated via `npm run build`.

**Cronjobs**

| Name               | Purpose                                          | NPM Command                     |
| ------------------ | ------------------------------------------------ | ------------------------------- |
| `pa-data`          | Pulls PurpleAir sensor readings every half hour. | `npm run sync-pa`               |
| `pa-meta`          | Pulls PurpleAir sensor metadata every month.     | `npm run sync-pa-meta`          |
| `eccc-aqhi`        | Pulls AQHI per region from ECCC every hour.      | `npm run sync-eccc-aqhi`        |
| `eccc-region-meta` | Pulls ECCC regional metadata every month.        | `npm run sync-eccc-region-meta` |



# Setup

The cron service should be set up in this order:
1. Install npm dependencies: `npm install`
2. Build files: `npm run build`
3. Initialize database: `npm db-setup`

The database will be ready to receive data pulled via cronjobs.



# Data Sources

Two data sources:
- PurpleAir
- Environment Climate Change Canada (ECCC)


**Note: Deleting Data**
> The tables populated by the jobs `pa-data` and `eccc-aqhi` are effectively 1 hour caches of air quality data.
> If you need to prune these tables, it's not a problem.
> Just leave a few hours of data in both tables.


## PurpleAir

Reports PM2.5 data from outdoor PurpleAir sensors.
Data is pulled every half hour.

PurpleAir data is quick to update - eg. readings taken at 2:13
will usually be available to the PurpleAir API a few minutes later.


### API Keys

PurpleAir data requires API keys.

There are two API keys:
- PA_READ_KEY: required to fetch purpleair data
- PA_WRITE_KEY: required to update purpleair metadata

**Where to Get API Keys**:
If lost, please contact aehussein@ualberta.ca and ask for the PurpleAir API keys.

**API Key expiry**:
The API keys are not known to expire. If they do, email amli1@ualberta.ca.


## Environment Climate Change Canada

Reports AQHI *per region.* This is the primary data source for ECCC.

| Name           | Purpose                                       | Link to Docs                                                | Further Reading                                              |
| -------------- | --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| GeoMet-OGC-API | **Primary Data Source** - Fetches regional AQHI | [Swagger UI Docs](https://api.weather.gc.ca/openapi?f=html) | https://eccc-msc.github.io/open-data/msc-geomet/readme_en/   |
| MSC Datamart   | Fetches AQHI per station                      | [HTML Docs](https://dd.meteo.gc.ca/today/air_quality/doc/)  | https://eccc-msc.github.io/open-data/msc-datamart/readme_en/ |



**AQHI Per Region vs. AQHI Per Station**

Under ECCC, AQHI is always provided for a particular *region.*
This "AQHI per region" is the dashboard's primary interest.

Some regions may report individual AQHI stations, but this is rare.
Larger cities like Edmonton and Toronto tend to have these "associated stations".

**Station Coordinates**: In the interest of reducing the number of unnecessary APIs tied to the dashboard,
the station coordinates are not fetched from the NAPS database.
This is also because most regions don't have associated stations. Regions that *do* have descriptive names for each station,
such that their location relative to the region is easy to understand.

