import { createRootRoute, Outlet } from "@tanstack/react-router";

// Pages own their own chrome for now; the persistent brand mark
// (components/Wordmark) comes back when the trace page is laid out.
export const Route = createRootRoute({
  component: () => <Outlet />,
});
