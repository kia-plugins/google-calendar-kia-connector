// src/__tests__/client.test.ts
import { CalendarApiError, CalendarClient, isAuthError, isStatus } from '../client';
import { jsonRes, instantClock } from '../testing/harness';

const mk = (responses: Array<ReturnType<typeof jsonRes> | Error>) => {
  let i = 0;
  const fetch = jest.fn(async (_url: string, _init?: unknown) => {
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  });
  return { client: new CalendarClient({ fetch, getToken: async () => 'tok', sleep: instantClock.sleep }), fetch };
};

it('returns JSON on 200 with a bearer token', async () => {
  const { client, fetch } = mk([jsonRes(200, { a: 1 })]);
  await expect(client.get('https://x/y')).resolves.toEqual({ a: 1 });
  expect(fetch.mock.calls[0][1]).toEqual({ headers: { authorization: 'Bearer tok' } });
});

it('401 throws an error whose code is auth (core classifies by code)', async () => {
  const { client } = mk([jsonRes(401, { error: 'x' })]);
  const err = await client.get('https://x/y').catch((e: { code?: string }) => e);
  expect(err.code).toBe('auth');
  expect(isAuthError(err)).toBe(true);
});

it('retries 5xx then succeeds', async () => {
  const { client, fetch } = mk([jsonRes(503, {}), jsonRes(200, { ok: true })]);
  await expect(client.get('https://x/y')).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('404 / 410 / 403 surface as CalendarApiError with the status, no retry', async () => {
  for (const s of [404, 410, 403]) {
    const { client, fetch } = mk([jsonRes(s, {})]);
    const err = await client.get('https://x/y').catch((e) => e);
    expect(err).toBeInstanceOf(CalendarApiError);
    expect(isStatus(err, s)).toBe(true);
    expect(isAuthError(err)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});
