FROM alpine:3.23

WORKDIR /srv

RUN set -eux; \
    apk --no-cache add \
        nodejs \
        npm; \
    npm install -g typescript

COPY srv/package*.json ./

RUN npm install

COPY srv/ .

RUN tsc

EXPOSE 8080/tcp

CMD ["npm", "run", "start"]