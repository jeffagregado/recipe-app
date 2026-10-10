export type VideoLink =
	| { kind: 'youtube' | 'vimeo'; id: string; embedUrl: string }
	| { kind: 'link'; href: string }

const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com'])
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d+$/

function youtubeId(url: URL): string | null {
	const segments = url.pathname.split('/').filter(Boolean)
	if (url.hostname === 'youtu.be') return segments.length === 1 ? segments[0] : null
	if (!YOUTUBE_HOSTS.has(url.hostname)) return null
	if (url.pathname === '/watch') return url.searchParams.get('v')
	if (segments.length === 2 && (segments[0] === 'embed' || segments[0] === 'shorts')) return segments[1]
	return null
}

function vimeoId(url: URL): string | null {
	const segments = url.pathname.split('/').filter(Boolean)
	if (url.hostname === 'vimeo.com' && segments.length === 1) return segments[0]
	if (url.hostname === 'player.vimeo.com' && segments.length === 2 && segments[0] === 'video') return segments[1]
	return null
}

/** Embed URLs are rebuilt from validated IDs only; any other https URL stays a plain link. */
export function parseVideoLink(value: string): VideoLink | null {
	let url: URL
	try { url = new URL(value.trim()) } catch { return null }
	if (url.protocol !== 'https:') return null

	const youtube = youtubeId(url)
	if (youtube && YOUTUBE_ID.test(youtube)) return { kind: 'youtube', id: youtube, embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}` }
	const vimeo = vimeoId(url)
	if (vimeo && VIMEO_ID.test(vimeo)) return { kind: 'vimeo', id: vimeo, embedUrl: `https://player.vimeo.com/video/${vimeo}` }
	return { kind: 'link', href: url.href }
}
