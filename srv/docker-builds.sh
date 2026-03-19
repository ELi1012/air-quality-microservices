# `build` isn't used in compose file - don't know why but don't put it in

docker build -t cron-provider1 ./images/cron-provider1
docker build -t api-provider1 ./images/api-provider1
docker build -t gateway --ssh default ./images/gateway
docker build -t nginx:local ./images/nginx