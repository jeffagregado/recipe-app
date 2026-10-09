export class AuthServiceError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'AuthServiceError'
	}
}

export class SessionExpiredError extends Error {
	constructor() {
		super('Your session has expired. Please log in again.')
		this.name = 'SessionExpiredError'
	}
}
