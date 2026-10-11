import type { NextConfig } from 'next'
import { recipeStorageHost } from './lib/recipe-storage-host'

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	cacheComponents: true,
	partialPrefetching: true,
	images: {
		// Signed recipe photos come from the storage host of one Neon branch of the recipe-app-v2 project:
		// RECIPE_STORAGE_HOST, or the dev branch when it is unset. Next.js loads the env files before this file.
		// The signature lives in the query string, so `search` stays open; the path starts with the bucket, which is not narrowed.
		remotePatterns: [
			{
				protocol: 'https',
				hostname: recipeStorageHost(process.env.RECIPE_STORAGE_HOST),
				pathname: '/**',
			},
			// Video posters, fetched by the optimizer so the browser does not contact the video host before Play.
			{ protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
			{ protocol: 'https', hostname: 'i.vimeocdn.com', pathname: '/video/**' },
		],
	},
}

export default nextConfig
