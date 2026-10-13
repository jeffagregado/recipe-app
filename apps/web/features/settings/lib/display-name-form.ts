import { DISPLAY_NAME_MAX_LENGTH } from '@recipe-app/contracts/types'

export const MAX_DISPLAY_NAME_LENGTH = DISPLAY_NAME_MAX_LENGTH

/** Counted the way the shared schema counts: after trimming. */
export const displayNameLength = (value: string) => value.trim().length

/** A name that differs only by surrounding spaces would save the stored one again. */
export const isDisplayNameChanged = (value: string, saved: string) => value.trim() !== saved
