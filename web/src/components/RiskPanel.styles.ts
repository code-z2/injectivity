import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  box: {
    marginTop: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text)",
    margin: "0 0 10px",
  },
  section: {
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 10,
    borderWidth: 1,
    borderStyle: "solid",
  },
  verifiedBox: {
    borderColor: "var(--verified)",
  },
  inferredBox: {
    borderColor: "var(--inferred)",
  },
  cleanBox: {
    borderColor: "var(--panel-edge)",
  },
  head: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 8px",
  },
  headVerified: { color: "var(--verified)" },
  headInferred: { color: "var(--inferred)" },
  headClean: { color: "var(--clean)" },
  match: {
    fontSize: 13,
    color: "var(--text)",
    margin: "4px 0",
  },
  sub: {
    fontSize: 12,
    color: "var(--muted)",
  },
  disclaimer: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "8px 0 0",
  },
});
