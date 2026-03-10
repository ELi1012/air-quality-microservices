# syntax=docker/dockerfile:1
FROM alpine:3.20

ARG GIT_SRV="github.com"
ARG GIT_USER="ELi1012"
ARG GIT_REPO="skeleton-app"

WORKDIR /srv/client

COPY ./srv/client /srv/client

RUN set -eux; \
    apk --no-cache add \
        nodejs \
        npm; \
    npm install; \
    npm run build

EXPOSE 8080/tcp

CMD ["npm", "run", "dev"]
