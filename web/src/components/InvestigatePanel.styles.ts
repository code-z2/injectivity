import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  box: {
    marginTop: 16,
    borderTop: "1px solid var(--panel-edge)",
    paddingTop: 16,
  },
  row: { display: "flex", gap: 10 },
  key: {
    flex: 1,
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--panel-edge)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: "var(--mono)",
  },
  run: {
    backgroundColor: "var(--accent)",
    color: "#14100a",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    opacity: { default: 1, ":disabled": 0.5 },
  },
  error: { color: "var(--verified)", fontSize: 13, marginTop: 10 },
  report: { marginTop: 12 },
  summary: { fontSize: 14, lineHeight: 1.55, margin: "0 0 8px" },
  meta: { color: "var(--muted)", fontSize: 12, margin: 0 },
  hint: { color: "var(--faint)", fontSize: 12, margin: "12px 0 0" },
});
