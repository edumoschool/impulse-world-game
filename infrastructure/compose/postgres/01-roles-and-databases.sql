-- Local development bootstrap. Passwords here are for the local container only.
-- See docs/deployment/production.md for how production roles are provisioned.
--
-- The roles separate migration, request handling and system work so that row-level
-- security always applies to request traffic (ADR-002).

CREATE ROLE impulse_owner LOGIN PASSWORD 'owner_dev_only' CREATEDB NOSUPERUSER NOBYPASSRLS;
CREATE ROLE impulse_app LOGIN PASSWORD 'app_dev_only' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE impulse_system LOGIN PASSWORD 'system_dev_only' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE impulse OWNER impulse_owner;
CREATE DATABASE impulse_test OWNER impulse_owner;
