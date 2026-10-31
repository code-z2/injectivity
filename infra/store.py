"""INFRA-1 local store: SQLite schema, seed loading, env config.

Tables:
  seed_versions  version pin per risk-list source (OFAC commit, exploits date)
  risk_lists     exact-match screening rows (OFAC + exploit attackers/victims)
  addresses      observed-address cache
  transfers      transfer cache (Alchemy payloads)
  traces         investigation traces as path JSON (document style)
  risk_hits      screening results with list name + version + match type
  reports        saved local reports as JSON

Address matching is case-insensitive (mixed-case checksum input).
"""
import json
import os
import sqlite3

SCHEMA = """
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
  source     TEXT NOT NULL DEFAULT ''
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
CREATE INDEX IF NOT EXISTS idx_risk_lists_addr ON risk_lists(address);
CREATE INDEX IF NOT EXISTS idx_transfers_addrs ON transfers(from_addr, to_addr);
"""


def connect(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def seed_all(db, ofac_path, exploits_path):
    ofac = json.load(open(ofac_path))
    ex = json.load(open(exploits_path))
    ofac_v = ofac["meta"]["lists_branch_commit"]
    ex_v = ex["meta"]["generated"]
    n_ofac = 0
    for r in ofac["sanctioned"]:
        db.execute(
            "INSERT OR REPLACE INTO risk_lists VALUES (?,?,?,?,?,?,?)",
            ("OFAC SDN", r["address"].lower(), json.dumps(r["chains"]),
             "sanctioned", "|".join(r["assets"]), r["source_url"], ofac_v),
        )
        n_ofac += 1
    n_ex = 0
    for e in ex["exploits"]:
        for h in e["hacker_addresses"]:
            db.execute(
                "INSERT OR REPLACE INTO risk_lists VALUES (?,?,?,?,?,?,?)",
                ("exploit", h["address"].lower(), json.dumps([h["chain"]]),
                 "attacker", e["protocol"] + " / " + h["label"],
                 (e["sources"] or [""])[0], ex_v),
            )
            n_ex += 1
        for v in e["victim_addresses"]:
            db.execute(
                "INSERT OR REPLACE INTO risk_lists VALUES (?,?,?,?,?,?,?)",
                ("exploit", v["address"].lower(), json.dumps([v["chain"]]),
                 "victim", e["protocol"] + " / " + v["label"],
                 (e["sources"] or [""])[0], ex_v),
            )
            n_ex += 1
    db.execute(
        "INSERT OR REPLACE INTO seed_versions VALUES (?,?,?,?)",
        ("OFAC SDN", ofac_v, ofac["meta"]["fetched"], n_ofac),
    )
    db.execute(
        "INSERT OR REPLACE INTO seed_versions VALUES (?,?,?,?)",
        ("exploit", ex_v, ex_v, n_ex),
    )
    db.commit()
    return {"ofac": n_ofac, "exploit": n_ex}


def load_env(path=".env"):
    if not os.path.exists(path):
        return {}
    out = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out
