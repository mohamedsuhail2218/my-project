const MAX_TRACKED_KEYS = 20_000;
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Fixed-window limiter with explicit pruning and a hard key cap. The previous
 * implementation kept every spoofed IP forever, so rotating X-Forwarded-For was
 * both a bypass and an unbounded-memory primitive.
 */
export function createRateLimiter({
  windowMs,
  max,
  message = "Too many attempts. Try again later.",
  status = 429,
  keyGenerator = (req) => req.ip || "unknown",
}) {
  const hits = new Map();
  let lastPrune = 0;

  function prune(now) {
    if (now - lastPrune < PRUNE_INTERVAL_MS && hits.size <= MAX_TRACKED_KEYS) return;
    lastPrune = now;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    if (hits.size > MAX_TRACKED_KEYS) {
      const oldest = [...hits.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      const remove = hits.size - MAX_TRACKED_KEYS;
      for (let index = 0; index < remove; index += 1) {
        hits.delete(oldest[index][0]);
      }
    }
  }

  function middleware(req, res, next) {
    const now = Date.now();
    prune(now);
    const key = String(keyGenerator(req) || "unknown");
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      res.status(status).json({ message });
      return;
    }
    next();
  }

  middleware.stats = () => ({ keys: hits.size, max });
  return middleware;
}

/**
 * Per-email failure memory. It never locks an account (which would let an
 * attacker deny access to a known user); it adds a capped delay so distributed
 * password guessing becomes expensive while responses stay generic.
 */
export function createLoginFailureGuard({ threshold = 8, maxDelayMs = 1500 } = {}) {
  const failures = new Map();
  let lastPrune = 0;

  function prune(now) {
    if (now - lastPrune < PRUNE_INTERVAL_MS && failures.size <= MAX_TRACKED_KEYS) return;
    lastPrune = now;
    for (const [key, entry] of failures) {
      if (entry.expiresAt <= now) failures.delete(key);
    }
    if (failures.size > MAX_TRACKED_KEYS) {
      const oldest = [...failures.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const remove = failures.size - MAX_TRACKED_KEYS;
      for (let index = 0; index < remove; index += 1) {
        failures.delete(oldest[index][0]);
      }
    }
  }

  return {
    delayFor(email) {
      const now = Date.now();
      prune(now);
      const entry = failures.get(email);
      if (!entry || entry.expiresAt <= now) return 0;
      const over = entry.count - threshold;
      if (over <= 0) return 0;
      return Math.min(maxDelayMs, 100 * 2 ** Math.min(over, 4));
    },
    recordFailure(email) {
      const now = Date.now();
      const entry = failures.get(email);
      if (!entry || entry.expiresAt <= now) {
        failures.set(email, { count: 1, expiresAt: now + 15 * 60 * 1000 });
      } else {
        entry.count += 1;
        entry.expiresAt = now + 15 * 60 * 1000;
      }
    },
    recordSuccess(email) {
      failures.delete(email);
    },
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
