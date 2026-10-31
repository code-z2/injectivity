-- D1 port of the INFRA-1 schema, plus fetched_at for cache freshness.
-- Run: wrangler d1 execute intel-terminal --local --file=./schema.sql
CREATE TABLE IF NOT EXISTS seed_versions (
  source      TEXT PRIMARY KEY,
  version     TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  entry_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS risk_lists (
  list_name  TEXT NOT NULL,
  address    TEXT NOT NULL,
  chains     TEXT NOT NULL,
  role       TEXT NOT NULL,
  label      TEXT NOT NULL,
  source_url TEXT NOT NULL,
  version    TEXT NOT NULL,
  PRIMARY KEY (list_name, address, role)
);
CREATE TABLE IF NOT EXISTS addresses (
  address    TEXT PRIMARY KEY,
  chain      TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  first_seen TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS transfers (
  tx_hash      TEXT NOT NULL,
  chain        TEXT NOT NULL,
  from_addr    TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  asset        TEXT NOT NULL DEFAULT '',
  amount       TEXT NOT NULL DEFAULT '',
  block_number INTEGER NOT NULL DEFAULT 0,
  raw          TEXT NOT NULL DEFAULT '{}',
  fetched_at   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tx_hash, chain)
);
CREATE TABLE IF NOT EXISTS traces (
  id           INTEGER PRIMARY KEY,
  root_address TEXT NOT NULL,
  direction    TEXT NOT NULL,
  depth        INTEGER NOT NULL,
  paths        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS risk_hits (
  id         INTEGER PRIMARY KEY,
  address    TEXT NOT NULL,
  list_name  TEXT NOT NULL,
  version    TEXT NOT NULL,
  match_type TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS expansions (
  chain      TEXT NOT NULL,
  address    TEXT NOT NULL,
  direction  TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (chain, address)
);
CREATE INDEX IF NOT EXISTS idx_risk_lists_addr ON risk_lists(address);
CREATE INDEX IF NOT EXISTS idx_transfers_addrs ON transfers(from_addr, to_addr);
