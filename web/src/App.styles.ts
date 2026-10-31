import * as stylex from "@stylexjs/stylex";

export const layout = stylex.create({
  page: {
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    fontFamily: "var(--sans)",
    minHeight: "100vh",
    margin: 0,
  },
  wrap: { maxWidth: 1080, margin: "0 auto", padding: "32px 20px 64px" },
  panel: {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--panel-edge)",
    borderRadius: 10,
    padding: 20,
  },
  mono: { fontFamily: "var(--mono)" },
  muted: { color: "var(--muted)" },
});

export const styles = stylex.create({
  head: { marginBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: -0.5,
    margin: "0 0 6px",
  },
  sub: { color: "var(--muted)", fontSize: 14, margin: 0 },
  status: { color: "var(--muted)", fontSize: 13 },
  error: { color: "var(--verified)", fontSize: 13 },
  profile: { marginTop: 20 },
  idrow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  addr: { fontSize: 15, margin: "0 0 6px", overflowWrap: "anywhere" },
  chainline: { color: "var(--muted)", fontSize: 12, margin: 0 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    fontSize: 11,
    color: "var(--verified)",
    border: "1px solid var(--verified)",
    borderRadius: 999,
    padding: "4px 10px",
  },
  balances: { display: "flex", gap: 14, alignItems: "baseline", marginTop: 16 },
  balance: { fontSize: 20, fontWeight: 700 },
  tokencount: { color: "var(--muted)", fontSize: 12 },
  h2: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--faint)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    margin: "22px 0 6px",
  },
  graphStub: { marginTop: 16 },
  stubTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--faint)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    margin: "0 0 6px",
  },
  stubText: { color: "var(--muted)", fontSize: 13, margin: 0 },
});
