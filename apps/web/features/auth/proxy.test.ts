import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

afterEach(() => vi.unstubAllEnvs())

it('leaves bundled recipe artwork public for Next image optimization', () => {
	const response = proxy(new NextRequest('http://localhost:3000/recipes/creamy-garlic-pasta.png'))
	expect(response.status).toBe(200)
	expect(response.headers.get('location')).toBeNull()
})

it('rewrites only allowed reads at runtime and refuses arbitrary backend paths/methods', () => {
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	const response = proxy(new NextRequest('http://localhost:3000/backend/recipes?page=2'))
	expect(response.headers.get('x-middleware-rewrite')).toBe('http://api.example/recipes?page=2')
	expect(proxy(new NextRequest('http://localhost:3000/backend/auth/login')).status).toBe(404)
	expect(proxy(new NextRequest('http://localhost:3000/backend/recipes', { method: 'POST' })).status).toBe(405)
	expect(proxy(new NextRequest('http://localhost:3000/recipes')).headers.get('location')).toBe('http://localhost:3000/auth/login')
})

it('adds the web proxy secret to a rewritten read on its way to the API', () => {
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubEnv('RECIPE_WEB_PROXY_SECRET', 'w'.repeat(40))
	const response = proxy(new NextRequest('http://localhost:3000/backend/auth/session'))
	expect(response.headers.get('x-middleware-request-x-recipe-web-secret')).toBe('w'.repeat(40))
})

it('redirects cookie-less page navigations but lets other methods (Server Actions) through', () => {
	for (const method of ['GET', 'HEAD']) {
		expect(proxy(new NextRequest('http://localhost:3000/recipes/abc', { method })).headers.get('location')).toBe('http://localhost:3000/auth/login')
	}
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
		const response = proxy(new NextRequest('http://localhost:3000/recipes', { method }))
		expect(response.status).toBe(200)
		expect(response.headers.get('location')).toBeNull()
	}
})
