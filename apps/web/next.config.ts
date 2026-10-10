import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	cacheComponents: true,
	partialPrefetching: true,
	images: {
		// Signed recipe photos come from the storage host of the dev branch of the Neon recipe-app-v2 project.
		// The signature lives in the query string, so `search` stays open; the path starts with the bucket, which is not narrowed.
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'br-hidden-waterfall-b3dj0mm5.storage.c-4.ap-southeast-1.aws.neon.tech',
				pathname: '/**',
			},
		],
	},
}

export default nextConfig
