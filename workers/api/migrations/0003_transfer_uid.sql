-- One row per transfer, not per transaction: a tx with several transfers
-- (multi-token swaps, batch payouts, exploit drains) kept only one under
-- the old (tx_hash, chain) key. uid is Alchemy's uniqueId when known.
CREATE TABLE transfers_new (
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
INSERT OR IGNORE INTO transfers_new
  (uid, tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
SELECT COALESCE(json_extract(raw, '$.uniqueId'), tx_hash), tx_hash, chain, from_addr, to_addr,
       asset, amount, block_number, raw, fetched_at
FROM transfers;
DROP TABLE transfers;
ALTER TABLE transfers_new RENAME TO transfers;
CREATE INDEX IF NOT EXISTS idx_transfers_addrs ON transfers(from_addr, to_addr);
CREATE INDEX IF NOT EXISTS idx_transfers_hash ON transfers(tx_hash, chain);
