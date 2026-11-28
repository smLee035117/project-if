
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import { ApiError, request } from './http'

const fetchMock = vi.fn<typeof fetch>()

describe('http client', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('정상 응답의 JSON 데이터를 반환한다', async () => {
        const data = {
            scenarioId: 'office_fire_01',
            title: '퇴근하겠습니다',
        }

        fetchMock.mockResolvedValue(
            Response.json(data),
        )

        expect(
            await request('/v2/scenarios'),
        ).toEqual(data)
    })

    it('동일 출처 쿠키 전송 정책을 유지한다', async () => {
        fetchMock.mockResolvedValue(
            Response.json({}),
        )

        await request('/v2/scenarios')

        expect(fetchMock).toHaveBeenCalledWith(
            '/v2/scenarios',
            expect.objectContaining({
                credentials: 'same-origin',
            }),
        )
    })

    it('요청 본문이 있으면 JSON Content-Type을 설정한다', async () => {
        fetchMock.mockResolvedValue(
            Response.json({}),
        )

        const body = JSON.stringify({
            scenarioId: 'office_fire_01',
        })

        await request('/v2/plays', {
            method: 'POST',
            body,
        })

        const options = fetchMock.mock.calls[0][1]
        const headers = new Headers(options?.headers)

        expect(options?.method).toBe('POST')
        expect(options?.body).toBe(body)

        expect(headers.get('Content-Type')).toBe(
            'application/json',
        )
    })

    it('기존 요청 헤더를 유지한다', async () => {
        fetchMock.mockResolvedValue(
            Response.json({}),
        )

        await request('/v2/plays', {
            headers: {
                'X-Test-Header': 'test-value',
            },
        })

        const options = fetchMock.mock.calls[0][1]
        const headers = new Headers(options?.headers)

        expect(headers.get('X-Test-Header')).toBe(
            'test-value',
        )

        expect(headers.has('Content-Type')).toBe(false)
    })

    it.each([400, 401, 404, 409, 500])(
        '%i 오류 응답을 ApiError로 변환한다',
        async (status) => {
            const body = {
                message: 'API error',
                statusCode: status,
            }

            fetchMock.mockResolvedValue(
                Response.json(body, { status }),
            )

            const result = request('/v2/plays')

            await expect(result).rejects.toBeInstanceOf(
                ApiError,
            )

            await expect(result).rejects.toMatchObject({
                status,
                body,
            })
        },
    )

    it('JSON이 아닌 오류 응답도 처리한다', async () => {
        fetchMock.mockResolvedValue(
            new Response('Bad Gateway', {
                status: 502,
            }),
        )

        await expect(
            request('/v2/plays'),
        ).rejects.toMatchObject({
            status: 502,
            body: null,
        })
    })

    it('네트워크 연결 실패를 호출자에게 전달한다', async () => {
        const error = new TypeError('Failed to fetch')

        fetchMock.mockRejectedValue(error)

        await expect(
            request('/v2/plays'),
        ).rejects.toBe(error)
    })
})
