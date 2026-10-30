import 'server-only'

/** Browsers send Origin on every POST and PATCH; it must name this site, so another site cannot write with the visitor's cookie. */
export function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin')
	const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')
	if (!origin || !host) return false
	try { return new URL(origin).host === host } catch { return false }
}

type BodyProblem = 'too-large' | 'unreadable'

/** Parses the body while counting its bytes, so an oversized or undeclared-length body is never buffered whole. */
async function readCounted<T>(request: Request, limitBytes: number, parse: (counted: Response) => Promise<T>): Promise<T | BodyProblem> {
	if (!request.body) return 'unreadable'
	if (Number(request.headers.get('content-length')) > limitBytes) return 'too-large'
	let received = 0
	let exceeded = false
	const counted = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength
			if (received <= limitBytes) return controller.enqueue(chunk)
			exceeded = true
			controller.error(new Error('Body is too large.'))
		},
	}))
	try {
		return await parse(new Response(counted, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }))
	} catch {
		return exceeded ? 'too-large' : 'unreadable'
	}
}

const mediaType = (request: Request) => request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()

export function readMultipart(request: Request, limitBytes: number): Promise<FormData | BodyProblem> {
	if (mediaType(request) !== 'multipart/form-data') return Promise.resolve('unreadable')
	return readCounted(request, limitBytes, (counted) => counted.formData())
}

/** Reads a JSON body; any other media type, multipart included, is unreadable. */
export function readJson(request: Request, limitBytes: number): Promise<{ json: unknown } | BodyProblem> {
	if (mediaType(request) !== 'application/json') return Promise.resolve('unreadable')
	return readCounted(request, limitBytes, async (counted) => ({ json: await counted.json() }))
}
