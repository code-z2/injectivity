import * as stylex from "@stylexjs/stylex";

export const styles = stylex.create({
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    padding: "6px 12px",
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  verified: {
    backgroundColor: "rgba(240,68,56,0.12)",
    color: "var(--verified)",
  },
  inferred: {
    backgroundColor: "rgba(240,180,41,0.12)",
    color: "var(--inferred)",
  },
  clean: { backgroundColor: "rgba(63,185,80,0.12)", color: "var(--clean)" },
});
