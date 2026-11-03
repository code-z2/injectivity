import { memo, useMemo } from "react";

// What lies beneath the aurora: a technical underlay of the on-chain world,
// drawn as fine ink line art with no background of its own (it sits over
// the aurora with multiply, so it takes the sky's tint). Chains of blocks, locks, keys,
// shields, Merkle trees, fund-flow graphs, the ether diamond, circuit
// traces, hashes and exploit-flavoured code. Generated once per viewport
// size from a fixed seed, so it is stable across renders. Purely
// decorative (aria-hidden); revealed only through the cursor lens.

const INK = "rgb(11 13 18 / 0.5)";
const INK_SOFT = "rgb(11 13 18 / 0.28)";
const RED = "rgb(229 72 77 / 0.75)";
const ION = "rgb(47 91 255 / 0.7)";
const CELL = 190;

const CODE = [
  ["delegatecall(", "  target, data", ");"],
  ["function flashLoan(", "  uint256 amount", ") external"],
  ["approve(spender,", "  MAX_UINT256);"],
  ["require(msg.sender", "  == owner);"],
  ["// reentrancy", 'call{value: bal}("");', "balances[msg.sender] = 0;"],
  ["selfdestruct(", "  payable(attacker));"],
  ["ecrecover(h, v, r, s)"],
  ["modifier onlyOwner {", "  _;", "}"],
  ["tx.origin == owner"],
  ["permit(owner, spender,", "  value, deadline, v, r, s)"],
];
const LABELS = [
  ["EXPLOIT", RED],
  ["DRAINER", RED],
  ["SANCTIONED", RED],
  ["MIXER", RED],
  ["VERIFIED", ION],
  ["ROOT", ION],
  ["HOP 2", INK],
  ["BRIDGE", INK],
] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(r: () => number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(r() * 16)];
  return s;
}

const line = {
  fill: "none",
  stroke: INK,
  strokeWidth: 1,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};
const mono = {
  fontFamily: "Geist Mono Variable, ui-monospace, monospace",
  fontSize: 10.5,
  fill: INK,
};

function Motif({ kind, r }: { kind: number; r: () => number }) {
  switch (kind) {
    case 0: {
      // Chain of blocks with heights.
      const h = 18_000_000 + Math.floor(r() * 900_000);
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${i * 62} 0)`}>
              <rect x={0} y={0} width={42} height={42} rx={4} {...line} />
              <line
                x1={8}
                y1={14}
                x2={34}
                y2={14}
                {...line}
                stroke={INK_SOFT}
              />
              <line
                x1={8}
                y1={22}
                x2={28}
                y2={22}
                {...line}
                stroke={INK_SOFT}
              />
              <text x={0} y={58} {...mono} fontSize={9}>
                #{(h + i).toLocaleString("en-US")}
              </text>
              {i < 2 && <line x1={42} y1={21} x2={62} y2={21} {...line} />}
            </g>
          ))}
        </g>
      );
    }
    case 1:
      // Padlock.
      return (
        <g transform="scale(2.2)">
          <rect x={4} y={11} width={16} height={11} rx={2} {...line} />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" {...line} />
          <circle cx={12} cy={16} r={1.4} {...line} />
          <line x1={12} y1={17.4} x2={12} y2={19} {...line} />
        </g>
      );
    case 2:
      // Key.
      return (
        <g transform="scale(2.4) rotate(-20 12 12)">
          <circle cx={7} cy={12} r={4} {...line} />
          <path d="M11 12h10m-3 0v3m-3-3v2" {...line} />
        </g>
      );
    case 3:
      // Shield with check.
      return (
        <g transform="scale(2.3)">
          <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" {...line} />
          <path d="M9 12l2 2 4-4" {...line} stroke={ION} />
        </g>
      );
    case 4:
      // Merkle tree.
      return (
        <g>
          <circle cx={60} cy={8} r={6} {...line} stroke={ION} />
          {[30, 90].map((x) => (
            <g key={x}>
              <line
                x1={60}
                y1={14}
                x2={x}
                y2={34}
                {...line}
                stroke={INK_SOFT}
              />
              <circle cx={x} cy={40} r={6} {...line} />
              {[x - 15, x + 15].map((lx) => (
                <g key={lx}>
                  <line
                    x1={x}
                    y1={46}
                    x2={lx}
                    y2={66}
                    {...line}
                    stroke={INK_SOFT}
                  />
                  <rect
                    x={lx - 6}
                    y={66}
                    width={12}
                    height={12}
                    rx={2}
                    {...line}
                  />
                </g>
              ))}
            </g>
          ))}
          <text x={78} y={11} {...mono} fontSize={9}>
            0x{hex(r, 6)}…
          </text>
        </g>
      );
    case 5: {
      // Fund-flow graph: root → hops, one flagged.
      const nodes = [
        [0, 40],
        [60, 10],
        [60, 70],
        [120, 0],
        [120, 40],
        [125, 82],
      ];
      const edges = [
        [0, 1],
        [0, 2],
        [1, 3],
        [1, 4],
        [2, 5],
      ];
      const flagged = 3 + Math.floor(r() * 3);
      return (
        <g>
          {edges.map(([a, b]) => {
            const [x1, y1] = nodes[a]!;
            const [x2, y2] = nodes[b]!;
            return (
              <line
                key={`${a}-${b}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                {...line}
                stroke={INK_SOFT}
              />
            );
          })}
          {nodes.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === 0 ? 6 : 4}
              {...line}
              stroke={i === 0 ? ION : i === flagged ? RED : INK}
            />
          ))}
        </g>
      );
    }
    case 6:
      // Ether diamond.
      return (
        <g transform="scale(1.8)">
          <path d="M16 2L6 18l10 6 10-6z" {...line} />
          <path d="M6 18l10 4.5L26 18M16 2v20.5" {...line} stroke={INK_SOFT} />
          <path d="M6 21l10 11 10-11-10 6z" {...line} />
        </g>
      );
    case 7: {
      // Circuit traces.
      return (
        <g>
          <path d="M0 10h40l12 12h50" {...line} />
          <path d="M0 40h24l14-14h28l10 10h28" {...line} stroke={INK_SOFT} />
          <path d="M10 70h50l16-16h30" {...line} />
          {[
            [102, 22],
            [104, 36],
            [106, 54],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={3} {...line} />
          ))}
        </g>
      );
    }
    case 8: {
      // Exploit code.
      const lines = CODE[Math.floor(r() * CODE.length)]!;
      return (
        <g>
          {lines.map((l, i) => (
            <text key={i} x={0} y={i * 15} {...mono}>
              {l}
            </text>
          ))}
        </g>
      );
    }
    case 9: {
      // Hash block.
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <text
              key={i}
              x={0}
              y={i * 14}
              {...mono}
              fill={i === 0 ? INK : INK_SOFT}
            >
              {i === 0 ? `tx 0x${hex(r, 10)}…` : `0x${hex(r, 24)}`}
            </text>
          ))}
        </g>
      );
    }
    case 10: {
      // Labelled address chip.
      const [label, color] = LABELS[Math.floor(r() * LABELS.length)]!;
      return (
        <g>
          <rect
            x={0}
            y={0}
            width={150}
            height={26}
            rx={13}
            {...line}
            stroke={color}
          />
          <circle cx={13} cy={13} r={3} fill={color} />
          <text x={24} y={17} {...mono} fontSize={9.5} fill={color}>
            {label}
          </text>
          <text x={0} y={44} {...mono} fontSize={9.5}>
            0x{hex(r, 4)}…{hex(r, 4)}
          </text>
        </g>
      );
    }
    default:
      // Warning triangle.
      return (
        <g transform="scale(2.2)">
          <path d="M12 3l10 17H2z" {...line} stroke={RED} />
          <path d="M12 9v5m0 3v.5" {...line} stroke={RED} />
        </g>
      );
  }
}

export const Underlay = memo(function Underlay({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const items = useMemo(() => {
    const r = rng(7331);
    const out: {
      x: number;
      y: number;
      rot: number;
      kind: number;
      seed: number;
    }[] = [];
    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        out.push({
          x:
            i * CELL +
            30 +
            r() * (CELL - 150) +
            (j % 2 ? CELL / 2 : 0) -
            CELL / 2,
          y: j * CELL + 30 + r() * (CELL - 140) - CELL / 4,
          rot: (r() - 0.5) * 10,
          kind: Math.floor(r() * 12),
          seed: Math.floor(r() * 1e9),
        });
      }
    }
    return out;
  }, [width, height]);

  return (
    <svg aria-hidden width={width} height={height} className="absolute inset-0">
      {items.map((it, k) => (
        <g key={k} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}>
          <Motif kind={it.kind} r={rng(it.seed)} />
        </g>
      ))}
    </svg>
  );
});
