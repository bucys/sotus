import { isYouTubeHostname, normalizeHost } from "./hosts.ts";

const URL_MAX_LENGTH = 2048;
const ALLOWED_PORTS: ReadonlySet<string> = new Set(["", "80", "443"]);

type Range = readonly [base: number, prefix: number];

// 0001 *Ingestion boundary*: unspecified, private, CGNAT, loopback, link local
// (including 169.254.169.254), IETF, documentation, relay, benchmarking, multicast, reserved.
const BLOCKED_IPV4: readonly Range[] = [
  [ipv4("0.0.0.0"), 8],
  [ipv4("10.0.0.0"), 8],
  [ipv4("100.64.0.0"), 10],
  [ipv4("127.0.0.0"), 8],
  [ipv4("169.254.0.0"), 16],
  [ipv4("172.16.0.0"), 12],
  [ipv4("192.0.0.0"), 24],
  [ipv4("192.0.2.0"), 24],
  [ipv4("192.88.99.0"), 24],
  [ipv4("192.168.0.0"), 16],
  [ipv4("198.18.0.0"), 15],
  [ipv4("198.51.100.0"), 24],
  [ipv4("203.0.113.0"), 24],
  [ipv4("224.0.0.0"), 4],
  [ipv4("240.0.0.0"), 4],
];

function ipv4(address: string): number {
  return address
    .split(".")
    .reduce((total, part) => total * 256 + Number(part), 0);
}

function parseIpv4(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  if (!parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    return undefined;
  }
  return ipv4(address);
}

function inRange(value: number, [base, prefix]: Range): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(value / size) === Math.floor(base / size);
}

function isPublicIpv4(value: number): boolean {
  return !BLOCKED_IPV4.some((range) => inRange(value, range));
}

/** Eight 16 bit groups, or undefined when the text is not an IPv6 address. */
function parseIpv6(address: string): readonly number[] | undefined {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);

  // An embedded dotted IPv4 tail (`::ffff:127.0.0.1`) becomes two groups.
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1] && dotted[2]) {
    const value = parseIpv4(dotted[2]);
    if (value === undefined) return undefined;
    text = `${dotted[1]}${Math.floor(value / 65536).toString(16)}:${(value % 65536).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const toGroups = (part: string | undefined) => (part ? part.split(":") : []);
  const head = toGroups(halves[0]);
  const tail = toGroups(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;

  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return undefined;
  return groups.map((group) => parseInt(group, 16));
}

function isPublicIpv6(groups: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = groups;
  const firstFiveZero = groups.slice(0, 5).every((group) => group === 0);

  // IPv4 mapped (`::ffff:a.b.c.d`) is judged by the IPv4 address it carries.
  if (firstFiveZero && g5 === 0xffff) return isPublicIpv4(g6 * 65536 + g7);

  // Only global unicast (2000::/3) is public, minus IETF (2001::/23, includes Teredo),
  // documentation (2001:db8::/32) and 6to4 (2002::/16, it tunnels to an IPv4 address).
  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && g1 < 0x0200) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false;
  if (g0 === 0x2002) return false;
  return true;
}

/** True only for an address Sotus may dial. Anything it cannot parse is not public. */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4 !== undefined) return isPublicIpv4(v4);
  const v6 = parseIpv6(address);
  return v6 !== undefined && isPublicIpv6(v6);
}

export type HopCheck = "ok" | "blocked_url";

/**
 * Runs on every hop before DNS. The connect time lookup still checks every resolved
 * address for names, so a name that later resolves inward is caught there.
 */
export function checkHop(url: URL): HopCheck {
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "blocked_url";
  if (!ALLOWED_PORTS.has(url.port)) return "blocked_url";
  if (url.username !== "" || url.password !== "") return "blocked_url";
  if (url.href.length > URL_MAX_LENGTH) return "blocked_url";

  const host = normalizeHost(url.hostname);
  if (host === "" || isYouTubeHostname(host)) return "blocked_url";
  if (host === "localhost" || host.endsWith(".localhost")) return "blocked_url";

  // The WHATWG parser already turned `2130706433` and `0x7f.1` into dotted form.
  if (host.startsWith("[") && host.endsWith("]")) {
    return isPublicAddress(host.slice(1, -1)) ? "ok" : "blocked_url";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPublicAddress(host) ? "ok" : "blocked_url";
  }
  return "ok";
}
