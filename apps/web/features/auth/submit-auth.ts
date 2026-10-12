'use client'

import { unstable_rethrow } from 'next/navigation'
import { publicFailure, serviceFailure, type AuthFailure } from './action-result'

/** A Next action redirect rejects its promise; preserve that framework control flow. */
export async function submitAuth(action: () => Promise<AuthFailure>, mode: 'login' | 'signup', complete: () => void): Promise<AuthFailure> {
	try { return await action() }
	catch (error) {
		try { unstable_rethrow(error) }
		catch (controlFlow) { complete(); throw controlFlow }
		return publicFailure(mode, serviceFailure(mode))
	}
}
