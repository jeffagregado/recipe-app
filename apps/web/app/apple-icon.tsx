import { ImageResponse } from 'next/og'
import { RecipeCardMark } from '@/components/layout/logo'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** The Apple touch icon: the recipe-card mark, square, because iOS rounds the corners itself. */
export default function AppleIcon() {
	return new ImageResponse(<RecipeCardMark size={180} radius={0} />, size)
}
