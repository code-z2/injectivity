import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    color: "var(--faint)",
    fontWeight: 600,
    padding: "8px 10px",
    borderBottom: "1px solid var(--panel-edge)",
  },
  tr: { borderBottom: "1px solid var(--panel-edge)" },
  td: { padding: "9px 10px", color: "var(--text)" },
  mono: { fontFamily: "var(--mono)", fontSize: 12 },
  link: {
    color: "var(--text)",
    textDecoration: "underline",
    textDecorationColor: "var(--faint)",
    textUnderlineOffset: 3,
  },
  more: {
    marginTop: 12,
    backgroundColor: "transparent",
    color: "var(--muted)",
    border: "1px solid var(--panel-edge)",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    cursor: "pointer",
  },
});
