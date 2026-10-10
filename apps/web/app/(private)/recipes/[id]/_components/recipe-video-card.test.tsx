import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity, type ImgHTMLAttributes } from 'react'
import { expect, it, vi } from 'vitest'
import { parseVideoLink } from '@/features/recipes/lib/video-link'

vi.mock('next/image', () => ({
	default: ({ src, alt, onError, unoptimized }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src} alt={alt} onError={onError} data-unoptimized={unoptimized ? '' : undefined} />
	),
}))

import { RecipeVideoCard } from './recipe-video-card'

function renderVideo(videoUrl: string, posterUrl: string | null = null, thumbnailUrl: string | null = null) {
	const video = parseVideoLink(videoUrl)
	if (!video) throw new Error('test video link must parse')
	return render(<RecipeVideoCard title="Pasta" video={video} posterUrl={posterUrl} thumbnailUrl={thumbnailUrl} />)
}

const THUMBNAIL = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
const COVER = 'https://storage.example/cover.jpg'

const THIRD_PARTY = /youtube|youtu\.be|vimeo|ytimg/i

it('requests nothing from YouTube before Play: no iframe and no third-party URL in the DOM', () => {
	const { container } = renderVideo('https://youtu.be/dQw4w9WgXcQ')
	expect(screen.getByRole('heading', { name: 'Video' })).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Play video' })).toHaveAccessibleDescription('Plays from YouTube')
	expect(container.querySelector('iframe, link, script, video')).toBeNull()
	const urls = [...container.querySelectorAll('[src], [href], [srcset], [style]')].map((node) => node.outerHTML)
	expect(urls.join('\n')).not.toMatch(THIRD_PARTY)
})

it('names Vimeo as the source in the caption', () => {
	renderVideo('https://vimeo.com/123456')
	expect(screen.getByText('Plays from Vimeo')).toBeInTheDocument()
})

it('uses the recipe cover as the poster when the video has no thumbnail', () => {
	renderVideo('https://youtu.be/dQw4w9WgXcQ', COVER)
	expect(document.querySelector('img')).toHaveAttribute('src', COVER)
})

// The optimizer fetches the thumbnail on the server; loading it directly would contact the video host before Play.
it('shows the video thumbnail as the poster, only ever through the image optimizer', () => {
	const { container } = renderVideo('https://youtu.be/dQw4w9WgXcQ', COVER, THUMBNAIL)
	const images = container.querySelectorAll('img')
	expect(images).toHaveLength(1)
	expect(images[0]).toHaveAttribute('src', THUMBNAIL)
	expect(images[0]).not.toHaveAttribute('data-unoptimized')
	expect(container.querySelector('iframe, link, script, video')).toBeNull()
})

it('falls back to the recipe cover when the thumbnail cannot be loaded', () => {
	const { container } = renderVideo('https://youtu.be/dQw4w9WgXcQ', COVER, THUMBNAIL)
	fireEvent.error(container.querySelector('img')!)
	expect(container.querySelector('img')).toHaveAttribute('src', COVER)
	expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument()
})

it('swaps the poster for the validated embed after Play and moves focus to the player', async () => {
	const user = userEvent.setup()
	const { container } = renderVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
	await user.click(screen.getByRole('button', { name: 'Play video' }))

	const frame = container.querySelector('iframe')
	expect(frame).not.toBeNull()
	const src = new URL(frame!.getAttribute('src')!)
	expect(src.origin + src.pathname).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
	expect(src.searchParams.get('autoplay')).toBe('1')
	expect(frame).toHaveAttribute('title', 'Video for Pasta')
	expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
	expect(frame!.getAttribute('allow')).toBe('autoplay; encrypted-media; picture-in-picture; fullscreen')
	expect(frame).not.toHaveAttribute('allowfullscreen')
	expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument()
	expect(frame).toHaveFocus()
})

// Next.js keeps the page it navigated away from mounted but hidden (Activity), and hiding does not stop an iframe.
it('removes the player when its page is hidden and offers Play again when it is shown', async () => {
	const user = userEvent.setup()
	const video = parseVideoLink('https://youtu.be/dQw4w9WgXcQ')!
	const page = (mode: 'visible' | 'hidden') => (
		<Activity mode={mode}>
			<RecipeVideoCard title="Pasta" video={video} posterUrl={null} thumbnailUrl={null} />
		</Activity>
	)
	const { container, rerender } = render(page('visible'))
	await user.click(screen.getByRole('button', { name: 'Play video' }))
	expect(container.querySelector('iframe')).not.toBeNull()

	rerender(page('hidden'))
	expect(container.querySelector('iframe')).toBeNull()

	rerender(page('visible'))
	expect(container.querySelector('iframe')).toBeNull()
	expect(screen.getByRole('button', { name: 'Play video' })).toBeVisible()
})

it('embeds only the Vimeo player host after Play', async () => {
	const user = userEvent.setup()
	const { container } = renderVideo('https://vimeo.com/123456')
	await user.click(screen.getByRole('button', { name: 'Play video' }))
	expect(new URL(container.querySelector('iframe')!.getAttribute('src')!).origin).toBe('https://player.vimeo.com')
})

it('links to any other host in a new tab and never embeds it', () => {
	const { container } = renderVideo('https://videos.example/cook')
	const link = screen.getByRole('link', { name: /watch video/i })
	expect(link).toHaveAttribute('href', 'https://videos.example/cook')
	expect(link).toHaveAttribute('target', '_blank')
	expect(link).toHaveAttribute('rel', 'noopener noreferrer')
	expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument()
	expect(container.querySelector('iframe')).toBeNull()
})
