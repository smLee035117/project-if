
export class ApiError extends Error {
    readonly status: number
    readonly body: unknown

    constructor(status: number, body: unknown) {
        super(`API request failed: ${status}`)
        this.name = 'ApiError'
        this.status = status
        this.body = body
    }
}

export async function request<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = new Headers(options.headers)

    if (options.body !== undefined && options.body !== null) {
        headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'same-origin',
    })

    if (!response.ok) {
        const body: unknown = await response
            .json()
            .catch(() => null)

        throw new ApiError(response.status, body)
    }

    return (await response.json()) as T
}
