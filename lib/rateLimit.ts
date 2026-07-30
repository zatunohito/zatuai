// In-memory, best-effort rate limiting. Serverless instances are ephemeral and
// may run multiple concurrent copies, so this does not provide a hard guarantee,
// but it meaningfully raises the cost of casual abuse until a shared store
// (e.g. Upstash Redis) is wired up. See docs/SECURITY.md P0-3.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function checkLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}

// Periodically drop stale buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 24 * 60 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}, 60 * 60 * 1000).unref?.();

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

const PER_IP_LIMIT = 20;
const PER_IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const GLOBAL_LIMIT = 300;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day

export function checkChatRateLimit(request: Request): boolean {
  const ip = getClientIp(request);
  // Check the per-IP limit first and bail out before touching the global
  // counter: checkLimit has a side effect (it increments the bucket), so
  // evaluating both unconditionally would let a client stuck on its own
  // per-IP limit keep draining the shared global budget for everyone else.
  if (!checkLimit(`chat:ip:${ip}`, PER_IP_LIMIT, PER_IP_WINDOW_MS)) {
    return false;
  }
  return checkLimit("chat:global", GLOBAL_LIMIT, GLOBAL_WINDOW_MS);
}

const NOTIFY_PER_IP_LIMIT = 5;
const NOTIFY_PER_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function checkNotifyRateLimit(request: Request): boolean {
  const ip = getClientIp(request);
  return checkLimit(`notify:ip:${ip}`, NOTIFY_PER_IP_LIMIT, NOTIFY_PER_IP_WINDOW_MS);
}
