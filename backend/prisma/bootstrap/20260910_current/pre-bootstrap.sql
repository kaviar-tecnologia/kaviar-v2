-- DR bootstrap pre-requisites for empty PostgreSQL 15 databases.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
