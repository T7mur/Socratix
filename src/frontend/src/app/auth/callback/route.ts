import { NextResponse } from "next/server";
import { createClient } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.SITE_URL ?? url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeNext(url.searchParams.get("next")), origin),
      );
  }
  return NextResponse.redirect(new URL("/login?notice=expired-link", origin));
}
