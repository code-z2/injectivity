import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  bar: { display: "flex", gap: 10, width: "100%" },
  select: {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--panel-edge)",
    borderRadius: 8,
    padding: "12px 10px",
    fontSize: 14,
  },
  input: {
    flex: 1,
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    border: "1px solid var(--panel-edge)",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 14,
    fontFamily: "var(--mono)",
  },
  button: {
    backgroundColor: "var(--accent)",
    color: "#14100a",
    border: "none",
    borderRadius: 8,
    padding: "12px 22px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    opacity: { default: 1, ":disabled": 0.5 },
  },
});
