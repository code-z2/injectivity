import { createFileRoute, notFound } from "@tanstack/react-router";
import { ReportPage } from "@/components/report/ReportPage";

// A generated post-mortem. Opens only in the browser that generated it
// (owner token); the PDF link can be shared.
export const Route = createFileRoute("/report/$key")({
  params: {
    parse: ({ key }) => {
      if (!/^[0-9a-f]{32}$/.test(key)) throw notFound();
      return { key };
    },
    stringify: ({ key }) => ({ key }),
  },
  component: ReportRoute,
});

function ReportRoute() {
  const { key } = Route.useParams();
  return <ReportPage reportKey={key} />;
}
