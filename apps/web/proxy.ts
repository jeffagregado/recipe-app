import { NextResponse, type NextRequest } from 'next/server'
import { getApiOrigin } from '@/features/auth/api'
import { SESSION_COOKIE_NAMES, sessionCookieHeader } from '@/features/auth/session-cookie'

// Next's image optimizer fetches bundled public artwork without a user cookie.
const PUBLIC_ARTWORK = new Set(['/recipes/recipe-placeholder.png', '/recipes/creamy-garlic-pasta.png'])
const BACKEND_READS = new Map([['/backend/recipes', '/recipes'], ['/backend/auth/session', '/auth/session']])

function rewriteBackendRead(request: NextRequest, path: string) {
	const target = BACKEND_READS.get(path)
	if (!target) return new NextResponse(null, { status: 404 })
	if (request.method !== 'GET') return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
	const url = new URL(target, getApiOrigin())
	url.search = request.nextUrl.search
	const forwarded = new Headers({ Accept: 'application/json' })
	const cookie = sessionCookieHeader(request.cookies)
	if (cookie) forwarded.set('Cookie', cookie)
	return NextResponse.rewrite(url, { request: { headers: forwarded }, headers: { 'Cache-Control': 'private, no-store' } })
}

// Server Functions POST to the page they are used on; only navigations get the UX redirect.
const isPrivatePage = (request: NextRequest, path: string) => (request.method === 'GET' || request.method === 'HEAD') && (path === '/recipes' || path.startsWith('/recipes/'))
const hasSessionCookie = (request: NextRequest) => SESSION_COOKIE_NAMES.some((name) => request.cookies.get(name)?.value)

export function proxy(request: NextRequest) {
	const path = request.nextUrl.pathname
	if (PUBLIC_ARTWORK.has(path)) return NextResponse.next()
	if (path === '/backend' || path.startsWith('/backend/')) return rewriteBackendRead(request, path)
	if (isPrivatePage(request, path) && !hasSessionCookie(request)) return NextResponse.redirect(new URL('/', request.url))
	return NextResponse.next({ headers: { 'Cache-Control': 'private, no-store' } })
}

export const config = { matcher: ['/recipes/:path*', '/backend/:path*'] }
