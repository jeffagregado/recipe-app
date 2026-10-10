import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }))

import { getVideoThumbnailUrl } from './video-thumbnail'

const fetchMock = vi.fn<typeof fetch>()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const VIMEO = 'https://vimeo.com/76979871'

beforeEach(() => {
	vi.unstubAllGlobals()
	fetchMock.mockReset()
	vi.stubGlobal('fetch', fetchMock)
})

it('builds the YouTube thumbnail from the validated id without asking YouTube', async () => {
	await expect(getVideoThumbnailUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4s')).resolves.toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
	expect(fetchMock).not.toHaveBeenCalled()
})

it('asks Vimeo oEmbed for the thumbnail of the validated id', async () => {
	fetchMock.mockResolvedValue(json({ thumbnail_url: 'https://i.vimeocdn.com/video/452001751-abc-d_640?region=us' }))
	await expect(getVideoThumbnailUrl(VIMEO)).resolves.toBe('https://i.vimeocdn.com/video/452001751-abc-d_640?region=us')
	const url = new URL(String(fetchMock.mock.calls[0][0]))
	expect(url.origin + url.pathname).toBe('https://vimeo.com/api/oembed.json')
	expect(url.searchParams.get('url')).toBe('https://vimeo.com/76979871')
})

it.each([
	['a thumbnail on another host', () => json({ thumbnail_url: 'https://evil.example/video/1.jpg' })],
	['a thumbnail that is not https', () => json({ thumbnail_url: 'http://i.vimeocdn.com/video/1.jpg' })],
	['no thumbnail', () => json({ title: 'Private' })],
	['a private or unknown video', () => json({}, 404)],
	['a server error', () => json({}, 500)],
	['invalid JSON', () => new Response('<html>', { status: 200 })],
])('has no Vimeo thumbnail for %s', async (_case, response) => {
	fetchMock.mockResolvedValue(response())
	await expect(getVideoThumbnailUrl(VIMEO)).resolves.toBeNull()
})

it('has no Vimeo thumbnail when Vimeo cannot be reached', async () => {
	fetchMock.mockRejectedValue(new TypeError('fetch failed'))
	await expect(getVideoThumbnailUrl(VIMEO)).resolves.toBeNull()
})

it.each([null, 'https://videos.example/cook', 'javascript:alert(1)'])('has no thumbnail for %j', async (videoUrl) => {
	await expect(getVideoThumbnailUrl(videoUrl)).resolves.toBeNull()
	expect(fetchMock).not.toHaveBeenCalled()
})
