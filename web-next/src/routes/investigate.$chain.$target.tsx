import { createFileRoute, notFound } from "@tanstack/react-router";
import { Terminal } from "@/components/terminal/Terminal";
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
  component: TerminalRoute,
});

function TerminalRoute() {
  const { chain, target } = Route.useParams();
  return <Terminal chain={chain} target={target} />;
}
