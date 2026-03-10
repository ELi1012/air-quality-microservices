FROM alpine:3.23

COPY srv /srv/

WORKDIR /srv

RUN set -eux; \
    apk --no-cache add \
        nodejs \
        npm; \
    npm install

EXPOSE 8080/tcp

CMD ["node", "app.js"]
