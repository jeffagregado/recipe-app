import { describe, expect, it } from 'vitest'
import { parseVideoLink } from './video-link'

const ID = 'dQw4w9WgXcQ'
const youtube = { kind: 'youtube', id: ID, embedUrl: `https://www.youtube-nocookie.com/embed/${ID}` }

describe('parseVideoLink', () => {
	it.each([
		`https://www.youtube.com/watch?v=${ID}`,
		`https://youtube.com/watch?v=${ID}&t=42s`,
		`https://m.youtube.com/watch?v=${ID}`,
		`https://www.youtube.com/embed/${ID}`,
		`https://www.youtube.com/shorts/${ID}`,
		`https://youtu.be/${ID}`,
		`https://youtu.be/${ID}?si=abc`,
	])('embeds YouTube link %s', (url) => {
		expect(parseVideoLink(url)).toEqual(youtube)
	})

	it.each([
		['https://vimeo.com/123456789', '123456789'],
		['https://player.vimeo.com/video/987', '987'],
	])('embeds Vimeo link %s', (url, id) => {
		expect(parseVideoLink(url)).toEqual({ kind: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}` })
	})

	it.each([
		'https://www.youtube.com/watch?v=short',
		'https://www.youtube.com/watch?v=dQw4w9WgXcQextra',
		`https://www.youtube.com/watch?v="><script>x</script>`,
		'https://www.youtube.com/watch',
		`https://www.youtube.com/playlist?list=${ID}`,
		`https://youtu.be/${ID}/extra`,
		`https://youtube.com.evil.example/watch?v=${ID}`,
		`https://evilyoutube.com/watch?v=${ID}`,
		`https://www.youtube.com.evil.example/embed/${ID}`,
		`https://user@youtube.com.evil.example/watch?v=${ID}`,
		'https://vimeo.com/abc',
		'https://vimeo.com/123/extra',
		'https://vimeo.com.evil.example/123',
		'https://player.vimeo.com/video/12x',
		'https://example.com/video.mp4',
	])('falls back to a plain link for %s', (url) => {
		expect(parseVideoLink(url)).toEqual({ kind: 'link', href: new URL(url).href })
	})

	it.each([
		`http://www.youtube.com/watch?v=${ID}`,
		'http://example.com/video',
		'javascript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'ftp://example.com/a',
		'not a url',
		'',
		'   ',
	])('renders nothing for %j', (url) => {
		expect(parseVideoLink(url)).toBeNull()
	})
})
