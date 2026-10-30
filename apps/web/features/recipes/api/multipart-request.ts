import 'server-only'

/** Browsers send Origin on every POST and PATCH; it must name this site, so another site cannot write with the visitor's cookie. */
export function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin')
	const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')
	if (!origin || !host) return false
	try { return new URL(origin).host === host } catch { return false }
}

/** Reads a multipart body while counting bytes, so an oversized or undeclared-length upload is never buffered whole. */
export async function readMultipart(request: Request, limitBytes: number): Promise<FormData | 'too-large' | 'unreadable'> {
	const type = request.headers.get('content-type') ?? ''
	if (!request.body || !type.toLowerCase().startsWith('multipart/form-data')) return 'unreadable'
	if (Number(request.headers.get('content-length')) > limitBytes) return 'too-large'
	let received = 0
	let exceeded = false
	const counted = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength
			if (received <= limitBytes) return controller.enqueue(chunk)
			exceeded = true
			controller.error(new Error('Upload is too large.'))
		},
	}))
	try {
		return await new Response(counted, { headers: { 'Content-Type': type } }).formData()
	} catch {
		return exceeded ? 'too-large' : 'unreadable'
	}
}
