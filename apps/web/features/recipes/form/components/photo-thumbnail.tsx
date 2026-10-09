/** Local preview of a picked file. The object URL lives exactly as long as the element, including when Activity hides the page. */
function attachPreview(node: HTMLImageElement, file: File) {
	const url = URL.createObjectURL(file)
	node.src = url
	return function release() {
		URL.revokeObjectURL(url)
	}
}

export function PhotoThumbnail({ file, className }: { file: File; className?: string }) {
	return (
		// eslint-disable-next-line @next/next/no-img-element -- a blob: preview has nothing for the image optimizer to fetch
		<img alt={`Preview of ${file.name}`} className={className} ref={(node) => (node ? attachPreview(node, file) : undefined)} />
	)
}
