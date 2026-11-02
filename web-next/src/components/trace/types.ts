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
