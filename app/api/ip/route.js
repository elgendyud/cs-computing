import { NextResponse } from "next/server";

// The browser can't learn its own public IP (or several other request-level
// facts) without asking a server — this route reads what's visible from the
// incoming request headers. Behind a proxy/load balancer, x-forwarded-for
// carries the real client IP; req.ip / socket address is the fallback for
// direct connections.
export async function GET(req) {
  const h = req.headers;

  const forwardedFor = h.get("x-forwarded-for");
  const realIp = h.get("x-real-ip");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "unknown";

  const payload = {
    ip,
    // Raw user-agent string — DeviceInfo.jsx already parses this
    // client-side, but the server sees the exact same header.
    userAgent: h.get("user-agent"),
    // Browser's preferred language(s), sent on every request.
    acceptLanguage: h.get("accept-language"),
    // Which page/site linked here, if any.
    referer: h.get("referer"),
    // Was the request made over HTTPS? Proxies set this since Node
    // itself only sees plain HTTP behind them.
    protocol: h.get("x-forwarded-proto") || "unknown",
    // Domain the request was addressed to.
    host: h.get("host"),
    // Full chain of proxy hops, not just the first IP.
    forwardedChain: forwardedFor || null,
  };

  // On Vercel specifically, edge/serverless functions get coarse
  // geolocation derived from the IP for free — no extra API call needed.
  // Uncomment if deploying there; it's undefined everywhere else.
  // payload.geo = req.geo ?? null;

  return NextResponse.json(payload);
}
