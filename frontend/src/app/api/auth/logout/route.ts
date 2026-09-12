import { NextResponse } from "next/server";

const SESSION_COOKIE = "excel_archive_session";

function backendUrl(): string {
  return process.env.BACKEND_URL ?? "http://localhost:5000";
}

/**
 * ينادي الـ backend لمسح كوكي الجلسة.
 * - تنقل المتصفح / form عادي (Accept: text-html) يعيد 303 الى login
 *   (يصلح عرض JSON الخام عند فتح مسار logout مباشرة).
 * - fetch/API يعيد JSON مع مسح الكوكي، والـ client يتكفل بالتوجيه الى login.
 * هذا الـ route المحلي له اولوية على rewrite الخاص بالـ api في next.config.
 */
async function handleLogout(request: Request): Promise<NextResponse> {
  let setCookies: string[] = [];
  try {
    const backendRes = await fetch(`${backendUrl()}/api/auth/logout`, {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    // Node 18.14+ / Next توفر getSetCookie للمصفوفة الكاملة.
    const getter = (backendRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    if (typeof getter === "function") {
      setCookies = getter.call(backendRes.headers);
    } else {
      const single = backendRes.headers.get("set-cookie");
      if (single) setCookies = [single];
    }
  } catch {
    // حتى لو الـ backend غير متاح، نكمل ونمسح الكوكي محلياً.
  }

  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  if (wantsHtml) {
    // Location نسبي حتى لا نرجع host داخلي مثل 0.0.0.0:3000 داخل docker.
    const redirect = new NextResponse(null, {
      status: 303,
      headers: { Location: "/login" },
    });
    applyCookies(redirect, setCookies);
    return redirect;
  }

  const json = NextResponse.json({ ok: true, message: "تم تسجيل الخروج.", data: null });
  applyCookies(json, setCookies);
  return json;
}

function applyCookies(response: NextResponse, setCookies: string[]): void {
  if (setCookies.length > 0) {
    for (const value of setCookies) response.headers.append("set-cookie", value);
  } else {
    // Fallback: مسح الكوكي على دومين الـ frontend مباشرة.
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleLogout(request);
}
