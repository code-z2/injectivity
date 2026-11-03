import { Link, useRouterState } from "@tanstack/react-router";
import { WordmarkSequence } from "./brand/WordmarkSequence";

// Inner pages: the brand at rest as the aurora orb, top-left. The landing
// page plays the full wordmark → orb sequence itself, centred, so the mark
// is hidden there. (The landing → inner-page hand-off comes next.)
export function Wordmark() {
  const onHome = useRouterState({
    select: (s) => s.location.pathname === "/",
  });
  if (onHome) return null;
  return (
    <Link
      to="/"
      aria-label="Intel Terminal home"
      className="fixed top-2 left-5 z-50 block size-[30px] animate-[fade-in_400ms_ease-out_both]"
      style={{ height: 40 }}
    >
      <WordmarkSequence state="orb" />
    </Link>
  );
}
