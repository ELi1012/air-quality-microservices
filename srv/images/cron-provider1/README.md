The database is effectively a 3-hour cache for air quality data.
If database is lost, no big deal. Just restart the cron provider
and it'll recreate the tables.

A note on the PurpleAir API keys:
- There are two API keys:
    - PA_READ_KEY: required to fetch purpleair data
    - PA_WRITE_KEY: required to update purpleair metadata
- Where to obtain API keys: Please contact aehussein@ualberta.ca and ask for the PurpleAir API keys
- API Key Expiry: They do not expire as far as I know. If this changes, I will update this README.