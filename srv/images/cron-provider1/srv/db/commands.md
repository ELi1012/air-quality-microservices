# which npm: /home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin/npm
# where to output logs: /home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv/postgres/crons/logs

# ensures the cron shell knows exactly where to find the Node v20 binaries and uses bash instead of the default sh
# (according to gemini)
SHELL=/bin/bash
PATH=/home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin:/usr/local/bin:/usr/bin:/bin

# purpleair
*/30 * * * * cd "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv" && /home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin/npm run cron:pa >> "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv/postgres/crons/logs/cron-pa.log" 2>&1

# stations
20,30,40 * * * * cd "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv" && /home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin/npm run cron:stations >> "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv/postgres/crons/logs/cron-stations.log" 2>&1

# data loading
5-59/10 * * * * cd "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv" && /home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin/npm run compare >> "/home/lukewarmspaghettisauce/projects/air_quality/IST VM/srv/images/cron-provider1/srv/postgres/crons/logs/cron-load.log" 2>&1



# original command
*/10 * * * * /home/lukewarmspaghettisauce/.nvm/versions/node/v20.19.5/bin/node /home/lukewarmspaghettisauce/projects/air_quality/test/index.js >> /home/lukewarmspaghettisauce/projects/air_quality/test/cron.log 2>&1