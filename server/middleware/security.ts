import type { NextFunction, Request, Response } from "express";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(firstForwarded || req.ip || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function routeLimit(req: Request): { limit: number; windowMs: number } {
  if (req.path.startsWith("/api/auth/")) {
    return {
      limit: Number.parseInt(process.env.AUTH_RATE_LIMIT_PER_MINUTE || "30", 10),
      windowMs: 60_000,
    };
  }
  if (req.path === "/api/feedback/upload") {
    return {
      limit: Number.parseInt(process.env.UPLOAD_RATE_LIMIT_PER_5_MINUTES || "10", 10),
      windowMs: 5 * 60_000,
    };
  }
  return {
    limit: Number.parseInt(process.env.API_RATE_LIMIT_PER_MINUTE || "180", 10),
    windowMs: 60_000,
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/api/health" || req.path === "/api/healthz") {
    return next();
  }

  const { limit, windowMs } = routeLimit(req);
  if (!Number.isFinite(limit) || limit <= 0) {
    return next();
  }

  const now = Date.now();
  const key = `${clientKey(req)}:${req.path}`;
  const buckets = (apiRateLimiter as any).buckets as Map<string, RateLimitBucket> | undefined;
  const store = buckets || new Map<string, RateLimitBucket>();
  (apiRateLimiter as any).buckets = store;

  const current = store.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  store.set(key, bucket);

  if (store.size > 10_000) {
    for (const [bucketKey, value] of store.entries()) {
      if (value.resetAt <= now) store.delete(bucketKey);
    }
  }

  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > limit) {
    return res.status(429).json({ error: "Too many requests" });
  }

  return next();
}
