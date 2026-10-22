import { createHash } from "node:crypto";

// Fixed namespace for this seed. Together with a name it always produces the SAME id (a "version 5" uuid),
// which is what lets the script skip rows that already exist instead of duplicating them.
export const SEED_NAMESPACE = "5d3b1c9e-2f4a-4b7d-8c61-0a9e7f3d2b15";

export function uuidV5(name: string, namespace: string = SEED_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** A repeatable "random" number between 0 and 1 for the same inputs, so attendance never changes between runs. */
export function hash01(...parts: (string | number)[]): number {
  const h = createHash("sha1").update(["demo-v1", ...parts].join("|")).digest();
  return h.readUInt32BE(0) / 0x100000000;
}
