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

RUN npm run build

# should i add a package.json for the postgres client?

CMD ["crond", "-f", "-d", "8"]
