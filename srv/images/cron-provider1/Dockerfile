FROM alpine:3.23

COPY etc /etc/
COPY srv /srv/
COPY package*.json ./

WORKDIR /srv

RUN set -eux; \
    apk --no-cache add \
        nodejs \
        npm; \
    npm install;

RUN ls -l ./entrypoint.sh

RUN npm run build

ENTRYPOINT ["./entrypoint.sh"]

