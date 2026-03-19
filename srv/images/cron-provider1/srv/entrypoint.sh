#!/bin/sh
# Exit on error
set -e

echo "Running database setup..."
npm run db-setup

echo "Starting cron..."
exec crond -f -d 8