Contains the following:
- api service to serve air quality station data
- cron job to pull station data from government API

Please note: this is a temporary implementation.
Main objective is to move off Azure ASAP.
You'll see some old docker files - please ignore, those are just for reference.

What I'll do next:
- use postgres instead of local JSON files for database
- update stub with actual air quality dashboard