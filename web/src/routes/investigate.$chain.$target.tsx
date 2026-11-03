import { createFileRoute, notFound } from "@tanstack/react-router";
import { Trace } from "@/components/trace/Trace";
import { CHAINS, type Chain } from "@/lib/api";

// Shareable investigation URL: /investigate/ethereum/vitalik.eth
export const Route = createFileRoute("/investigate/$chain/$target")({
  params: {
    parse: ({ chain, target }) => {
      if (!CHAINS.includes(chain as Chain)) throw notFound();
      return { chain: chain as Chain, target: decodeURIComponent(target) };
    },
    stringify: ({ chain, target }) => ({ chain, target }),
  },
  component: TraceRoute,
});

function TraceRoute() {
  const { chain, target } = Route.useParams();
  return <Trace chain={chain} target={target} />;
}
