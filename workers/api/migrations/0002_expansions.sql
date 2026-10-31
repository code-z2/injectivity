CREATE TABLE IF NOT EXISTS expansions (
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  direction TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (chain, address)
);
