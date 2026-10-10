import 'server-only'

import { cacheLife } from 'next/cache'
import { parseVideoLink } from '../lib/video-link'

const REQUEST_TIMEOUT_MS = 3_000
const VIMEO_THUMBNAIL_HOST = 'i.vimeocdn.com'

/**
 * Vimeo thumbnails cannot be derived from the id, so its public oEmbed endpoint is asked. A private or unknown video
 * has none (cached as null); any other failure throws so that it is not cached.
 */
async function fetchVimeoThumbnailUrl(id: string): Promise<string | null> {
	'use cache'
	cacheLife('days')
	const video = encodeURIComponent(`https://vimeo.com/${id}`)
	const response = await fetch(`https://vimeo.com/api/oembed.json?url=${video}&width=640`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
	if (response.status === 403 || response.status === 404) return null
	if (!response.ok) throw new Error(`Vimeo oEmbed failed (${response.status}).`)
	const payload: unknown = await response.json()
	const value = typeof payload === 'object' && payload !== null && 'thumbnail_url' in payload ? payload.thumbnail_url : null
	if (typeof value !== 'string' || !URL.canParse(value)) return null
	const url = new URL(value)
	return url.protocol === 'https:' && url.hostname === VIMEO_THUMBNAIL_HOST ? url.href : null
}

/**
 * The poster for an embeddable video link, or null. The page hands it to the image optimizer, which fetches it on the
 * server, so the browser still contacts YouTube or Vimeo only after Play. A missing thumbnail is never an error.
 */
export async function getVideoThumbnailUrl(videoUrl: string | null): Promise<string | null> {
	const video = videoUrl ? parseVideoLink(videoUrl) : null
	if (!video || video.kind === 'link') return null
	if (video.kind === 'youtube') return `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
	try { return await fetchVimeoThumbnailUrl(video.id) } catch { return null }
}
