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
