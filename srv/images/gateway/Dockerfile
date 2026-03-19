# syntax=docker/dockerfile:1
FROM alpine:3.20

ARG GIT_SRV="github.com"
ARG GIT_USER="ELi1012"
ARG GIT_REPO="air-quality-dashboard-daycare"

WORKDIR /srv/client

RUN --mount=type=ssh set -eux; \
    apk --no-cache add \
        nodejs \
        npm; \
    apk --no-cache add --virtual .builddepts \
        git \
        openssh-client; \
    \
    mkdir -p /root/.ssh /tmp; \
    ssh-keyscan ${GIT_SRV} >> ~/.ssh/known_hosts; \
    git -C /tmp clone ssh://git@${GIT_SRV}/${GIT_USER}/${GIT_REPO}.git; \
    mv /tmp/air-quality-dashboard-daycare/client /srv; \
    \
    apk del .builddepts; \
    rm -rf /tmp/*

RUN set -eux; \
    npm install; \
    npm run build

EXPOSE 8080/tcp

CMD ["npm", "run", "start"]
