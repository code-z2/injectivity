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
  uid          TEXT NOT NULL,
  tx_hash      TEXT NOT NULL,
  chain        TEXT NOT NULL,
  from_addr    TEXT NOT NULL,
  to_addr      TEXT NOT NULL,
  asset        TEXT NOT NULL DEFAULT '',
  amount       TEXT NOT NULL DEFAULT '',
  block_number INTEGER NOT NULL DEFAULT 0,
  raw          TEXT NOT NULL DEFAULT '{}',
  fetched_at   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (uid, chain)
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
  created_at TEXT NOT NULL DEFAULT '',
  key        TEXT,
  owner_hash TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_key ON reports(key);
CREATE TABLE IF NOT EXISTS expansions (
  chain      TEXT NOT NULL,
  address    TEXT NOT NULL,
  direction  TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (chain, address)
);
CREATE INDEX IF NOT EXISTS idx_risk_lists_addr ON risk_lists(address);
CREATE INDEX IF NOT EXISTS idx_transfers_addrs ON transfers(from_addr, to_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_hash ON transfers(tx_hash, chain);
-- Agent backend: the exploits dataset as rows, curated memory, tool-result
-- cache and node-summary cache.
CREATE TABLE IF NOT EXISTS exploits (
  id         TEXT PRIMARY KEY,
  protocol   TEXT NOT NULL,
  date       TEXT NOT NULL,
  chains     TEXT NOT NULL,
  loss_usd   REAL NOT NULL DEFAULT 0,
  technique  TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exploits_protocol ON exploits(protocol);

CREATE TABLE IF NOT EXISTS memory_facts (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  chain        TEXT NOT NULL DEFAULT '',
  statement    TEXT NOT NULL,
  confidence   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  learned_from INTEGER,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_subject ON memory_facts(subject, status);

CREATE TABLE IF NOT EXISTS memory_sources (
  fact_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  ref     TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  url     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (fact_id, kind, ref)
);

CREATE TABLE IF NOT EXISTS memory_conflicts (
  id           INTEGER PRIMARY KEY,
  fact_id      INTEGER NOT NULL,
  candidate    TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_cache (
  key        TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS node_summaries (
  chain      TEXT NOT NULL,
  address    TEXT NOT NULL,
  watermark  TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (chain, address)
);
