import { NextResponse, type NextRequest } from "next/server";

// Basic-auth for the dashboard when DASHBOARD_PASSWORD is set (the tunnel makes it public).
// The Telegram webhook route is protected by its own secret token instead.
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [, pass] = Buffer.from(encoded, "base64").toString().split(":");
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="holiday-planner"' },
  });
}

export const config = { matcher: ["/((?!api/telegram|_next/static|_next/image|favicon.ico).*)"] };
