// One address in the user-built chain. Role drives the colour everywhere:
// attacker black, victim yellow, normal grey.
export type AddressRole = "attacker" | "victim" | "normal";

export interface ChainLink {
  address: string;
  role: AddressRole;
  label?: string;
  ens?: string;
}

export const ROLE_TAG: Record<AddressRole, string | null> = {
  attacker: "Known attacker",
  victim: "Known victim",
  normal: null,
};

// Known-list label → chain role and a readable name. Exploit rows read
// "Protocol / attacker" (or hacker, runner…): attacker-side roles become
// "Protocol exploiter"; victims keep "Protocol · contract". OFAC rows are
// attackers named "OFAC sanctioned".
export function roleFromLabel(l: { role: string } | undefined): AddressRole {
  if (!l) return "normal";
  if (l.role === "attacker" || l.role === "sanctioned") return "attacker";
  if (l.role === "victim") return "victim";
  return "normal";
}

export function nameFromLabel(
  l: { role: string; label: string } | undefined,
): string | undefined {
  if (!l) return undefined;
  if (l.role === "sanctioned") return "OFAC sanctioned";
  const [protocol, what] = l.label.split(" / ").map((s) => s.trim());
  if (!protocol) return l.label;
  if (l.role === "attacker") return `${protocol} exploiter`;
  return what ? `${protocol} · ${what}` : protocol;
}
