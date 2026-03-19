# Does the same thing as the Dockerfile to run the code (for local testing)

cd srv/
npm install
npm run build
npm run db-setup

# To update pg database w/ purpleair data
npm run pa-sync
# To update pg database w/ FEM station data (takes about 1.5 minutes)
npm run station-sync