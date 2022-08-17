import { NextRequest, NextResponse } from "next/server"
import { IS_PROD } from "~/lib/constants"
import { DISCORD_LINK, OUR_DOMAIN } from "~/lib/env"
import { FLY_REGION, IS_PRIMARY_REGION, PRIMARY_REGION } from "~/lib/env.server"
import { getTenant } from "~/lib/tenant.server"

const METHODS_TO_NOT_REPLAY = ["GET", "HEAD", "OPTIONS"]

const ALWAYS_REPLAY_ROUTES = [
  "/api/login",
  "/api/login-complete",
  "/api/logout",
]

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === "/favicon.ico") {
    return new Response(null, { status: 404 })
  }

  console.log(`${req.method} ${req.nextUrl.pathname}${req.nextUrl.search}`)

  if (
    IS_PROD &&
    !IS_PRIMARY_REGION &&
    (!METHODS_TO_NOT_REPLAY.includes(req.method) ||
      ALWAYS_REPLAY_ROUTES.includes(pathname))
  ) {
    console.log("replayed", {
      PRIMARY_REGION,
      FLY_REGION,
      url: req.url,
    })
    return new Response("replayed", {
      headers: {
        "fly-replay": `region=${PRIMARY_REGION}`,
      },
    })
  }

  let tenant

  if (req.nextUrl.hostname !== OUR_DOMAIN) {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=_xlog-challenge.${req.nextUrl.hostname}&type=TXT`,
      {
        headers: {
          accept: "application/dns-json",
        },
      },
    )
    const txt = await res.json()
    tenant = txt?.Answer?.[0]?.data.replace(/^"|"$/g, "")
  } else {
    tenant = getTenant(req, req.nextUrl.searchParams)
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/dashboard")) {
    return NextResponse.next()
  }

  if (tenant) {
    const url = req.nextUrl.clone()
    url.pathname = `/_site/${tenant}${url.pathname}`
    return NextResponse.rewrite(url)
  }

  if (DISCORD_LINK && pathname === "/discord") {
    return NextResponse.redirect(DISCORD_LINK)
  }

  return NextResponse.next()
}
