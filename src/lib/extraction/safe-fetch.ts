import "server-only";

import { lookup, type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import { Readable, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { Agent, request } from "undici";

import { checkHop, isPublicAddress } from "./hop-check.ts";

export const SOTUS_USER_AGENT = "Sotus/1.0 (+https://sotus.vercel.app)";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FOLLOWED_REDIRECTS: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);
const HTML_TYPES: ReadonlySet<string> = new Set([
  "text/html",
  "application/xhtml+xml",
]);
const BLOCKED_ADDRESS = "SOTUS_BLOCKED_ADDRESS";

export type FetchFailureReason =
  | "blocked_url"
  | "site_blocked"
  | "page_not_found"
  | "fetch_failed"
  | "too_many_redirects"
  | "too_large"
  | "unsupported_content"
  | "timeout";

export type SafeFetchResult =
  | {
      readonly ok: true;
      readonly html: string;
      readonly finalUrl: string;
      readonly status: number;
      readonly redirects: number;
    }
  | {
      readonly ok: false;
      readonly reason: FetchFailureReason;
      readonly status?: number;
      readonly redirects: number;
    };

// The address actually dialed is checked here, so DNS rebinding cannot reach inside.
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = addresses as unknown as readonly LookupAddress[];
    const first = list[0];
    if (!first || list.some((entry) => !isPublicAddress(entry.address))) {
      const blocked = Object.assign(new Error("blocked address"), {
        code: BLOCKED_ADDRESS,
      });
      callback(blocked, "", 0);
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, all: readonly LookupAddress[]) => void)(
        null,
        list,
      );
    } else {
      callback(null, first.address, first.family);
    }
  });
};

const agent = new Agent({ connect: { lookup: guardedLookup } });

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-encoding": "identity",
  "accept-language": "en",
  "user-agent": SOTUS_USER_AGENT,
} as const;

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isBlockedAddress(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if ((current as { code?: unknown }).code === BLOCKED_ADDRESS) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function failureFromError(
  error: unknown,
  signal: AbortSignal,
): FetchFailureReason {
  if (signal.aborted) return "timeout";
  if (isBlockedAddress(error)) return "blocked_url";
  return "fetch_failed";
}

function statusReason(status: number): FetchFailureReason | undefined {
  if (status >= 200 && status < 300) return undefined;
  if (status === 401 || status === 403 || status === 429) return "site_blocked";
  if (status === 404 || status === 410) return "page_not_found";
  return "fetch_failed";
}

function decompressor(encoding: string) {
  if (encoding === "gzip" || encoding === "x-gzip") return createGunzip();
  if (encoding === "deflate") return createInflate();
  if (encoding === "br") return createBrotliDecompress();
  return undefined;
}

function charsetFromContentType(value: string | undefined): string | undefined {
  return value ? /charset\s*=\s*"?([\w.:-]+)/i.exec(value)?.[1] : undefined;
}

function decode(bytes: Buffer, contentType: string | undefined): string {
  let body = bytes;
  let charset: string | undefined;

  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    charset = "utf-8";
    body = body.subarray(3);
  } else if (body[0] === 0xff && body[1] === 0xfe) {
    charset = "utf-16le";
    body = body.subarray(2);
  } else if (body[0] === 0xfe && body[1] === 0xff) {
    charset = "utf-16be";
    body = body.subarray(2);
  }

  charset ??= charsetFromContentType(contentType);
  charset ??= /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(
    body.subarray(0, 1024).toString("latin1"),
  )?.[1];

  try {
    return new TextDecoder(charset ?? "utf-8", { ignoreBOM: true }).decode(
      body,
    );
  } catch {
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
  }
}

async function readCapped(stream: Readable): Promise<Buffer | "too_large"> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BYTES) {
      stream.destroy();
      return "too_large";
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * The one door for user supplied web page URLs (0001 *Ingestion boundary*, 0006
 * *safeFetch*). Expected failures come back as a reason, never a throw. Pass the
 * normalized `new URL(trimmed).href` and one signal covering the whole fetch.
 */
export async function safeFetch(
  href: string,
  signal: AbortSignal,
): Promise<SafeFetchResult> {
  let current: URL;
  try {
    current = new URL(href);
  } catch {
    return { ok: false, reason: "blocked_url", redirects: 0 };
  }

  for (let redirects = 0; ; redirects += 1) {
    if (checkHop(current) !== "ok") {
      return { ok: false, reason: "blocked_url", redirects };
    }

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(current, {
        dispatcher: agent,
        method: "GET",
        headers: REQUEST_HEADERS,
        signal,
      });
    } catch (error) {
      return { ok: false, reason: failureFromError(error, signal), redirects };
    }

    const { statusCode: status, headers, body } = response;
    // Destroying an undici body emits `error`; unheard, it would crash the function.
    body.on("error", () => {});

    if (status >= 300 && status < 400) {
      body.destroy();
      if (!FOLLOWED_REDIRECTS.has(status)) {
        return { ok: false, reason: "fetch_failed", status, redirects };
      }
      if (redirects === MAX_REDIRECTS) {
        return { ok: false, reason: "too_many_redirects", status, redirects };
      }
      const location = header(headers, "location");
      let next: URL | undefined;
      try {
        next = location ? new URL(location, current) : undefined;
      } catch {
        next = undefined;
      }
      if (!next)
        return { ok: false, reason: "fetch_failed", status, redirects };
      current = next;
      continue;
    }

    const statusFailure = statusReason(status);
    if (statusFailure) {
      body.destroy();
      return { ok: false, reason: statusFailure, status, redirects };
    }

    const contentType = header(headers, "content-type");
    const mime = contentType?.split(";")[0]?.trim().toLowerCase();
    if (!mime || !HTML_TYPES.has(mime)) {
      body.destroy();
      return { ok: false, reason: "unsupported_content", status, redirects };
    }

    const declaredLength = Number(header(headers, "content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      body.destroy();
      return { ok: false, reason: "too_large", status, redirects };
    }

    const encoding = header(headers, "content-encoding")?.trim().toLowerCase();
    let stream: Readable = body;
    if (encoding && encoding !== "identity") {
      const inflater = decompressor(encoding);
      if (!inflater) {
        body.destroy();
        return { ok: false, reason: "unsupported_content", status, redirects };
      }
      // The cap below counts decoded bytes, so a compression bomb stops at 2 MB.
      stream = pipeline(body, inflater, () => {});
    }

    try {
      const bytes = await readCapped(stream);
      if (bytes === "too_large") {
        body.destroy();
        return { ok: false, reason: "too_large", status, redirects };
      }
      return {
        ok: true,
        html: decode(bytes, contentType),
        finalUrl: current.href,
        status,
        redirects,
      };
    } catch (error) {
      body.destroy();
      return {
        ok: false,
        reason: failureFromError(error, signal),
        status,
        redirects,
      };
    }
  }
}
