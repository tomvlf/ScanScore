#!/bin/sh
set -eu
docker compose --profile test run --rm privilege-test
