import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Wordmark } from "@/components/Wordmark";

// The brand mark sits outside the page outlet so it persists across
// navigation and morphs between wordmark and orb.
export const Route = createRootRoute({
  component: () => (
    <>
      <Wordmark />
      <Outlet />
    </>
  ),
});
