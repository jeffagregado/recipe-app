import { unstable_rethrow } from 'next/navigation'
import { useRef, useTransition } from 'react'

/**
 * Runs a Settings card's action one at a time: a second call while one is in flight is dropped, and an action that
 * throws settles with `thrown` instead. An action that redirects rejects its promise: that is the framework's control
 * flow and is passed on. `pending` is true until the result has been shown.
 */
export function useSingleFlight<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>, thrown: (...args: Args) => Result, settle: (result: Result, ...args: Args) => void) {
	const [pending, startTransition] = useTransition()
	const inFlight = useRef(false)

	function run(...args: Args) {
		if (inFlight.current) return
		inFlight.current = true
		startTransition(async () => {
			let result: Result
			try { result = await action(...args) } catch (error) {
				unstable_rethrow(error)
				result = thrown(...args)
			}
			inFlight.current = false
			settle(result, ...args)
		})
	}

	return { pending, run }
}
