import { requestWithRetry, type HostResponse, type NetFetch } from '@kiagent/connector-sdk/http';

export type { NetFetch };
const WRITE_MAX_RETRIES = 4;
export const CAL_API = 'https://www.googleapis.com/calendar/v3';

export class CalendarApiError extends Error {
  constructor(public readonly status: number, public readonly url: string, public readonly body: string) {
    super(`calendar ${status} ${url} ${body.slice(0, 500)}`);
    this.name = 'CalendarApiError';
  }
}

/** 401 or missing credentials. `code: 'auth'` is what core's engine reads to
 *  move the account to needsReauth (engine.ts:1076); the forked host keeps it. */
export class CalendarAuthError extends Error {
  readonly code = 'auth';
  constructor(message: string) {
    super(message);
    this.name = 'CalendarAuthError';
  }
}

export const isAuthError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'auth';
export const isStatus = (e: unknown, status: number): boolean =>
  e instanceof CalendarApiError && e.status === status;

export interface CalendarClientDeps {
  fetch: NetFetch;
  getToken(): Promise<string>;
  sleep?(ms: number): Promise<void>;
  /** The session's signal: quit/remove cancels instead of sleeping out a backoff. */
  signal?: AbortSignal;
  now?(): number;
}

export class CalendarClient {
  constructor(private readonly deps: CalendarClientDeps) {}

  async get<T>(url: string): Promise<T> {
    const res = await requestWithRetry(
      async () => this.deps.fetch(url, { headers: { authorization: `Bearer ${await this.deps.getToken()}` } }),
      {
        label: `calendar ${new URL(url).pathname}`,
        sleep: this.deps.sleep,
        signal: this.deps.signal,
      },
    );
    const text = new TextDecoder().decode(res.body);
    if (res.status >= 200 && res.status < 300) return JSON.parse(text) as T;
    if (res.status === 401) throw new CalendarAuthError(`calendar 401 ${url} — reconnect the account`);
    throw new CalendarApiError(res.status, url, text);
  }

  /** Write call (events insert / read-back). One overall `deadline` (epoch ms).
   *  429 is always retried (Retry-After honoured); 5xx and network errors only
   *  when `idempotent`. Retries that cannot fit before the deadline are
   *  surfaced as the status they are. 401 -> CalendarAuthError. */
  async write<T = unknown>(
    method: 'POST' | 'PATCH' | 'GET',
    url: string,
    body: unknown,
    o: { deadline: number; idempotent: boolean },
  ): Promise<{ status: number; json: T }> {
    const now = this.deps.now ?? Date.now;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const backoff = (attempt: number) => Math.min(60_000, 1000 * 2 ** attempt);
    for (let attempt = 0; ; attempt++) {
      const token = await this.deps.getToken();
      const remaining = o.deadline - now();
      if (remaining <= 0) throw new Error(`calendar ${method} timed out ${url}`);
      let res: HostResponse;
      try {
        res = await this.deps.fetch(url, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          timeoutMs: Math.max(1, Math.floor(remaining)),
        });
      } catch (e) {
        if (this.deps.signal?.aborted) throw e;
        if (o.idempotent && attempt < WRITE_MAX_RETRIES) {
          const delay = backoff(attempt);
          if (now() + delay + 5_000 < o.deadline) {
            await sleep(delay);
            continue;
          }
        }
        throw e;
      }
      const text = new TextDecoder().decode(res.body);
      if (res.status >= 200 && res.status < 300) return { status: res.status, json: (text ? JSON.parse(text) : undefined) as T };
      if (res.status === 401) throw new CalendarAuthError(`calendar 401 ${url} — reconnect the account`);
      const retryable = res.status === 429 || (o.idempotent && res.status >= 500);
      if (retryable && attempt < WRITE_MAX_RETRIES && !this.deps.signal?.aborted) {
        const ra = Number(res.headers['retry-after']);
        const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt);
        if (now() + delay + 5_000 < o.deadline) {
          await sleep(delay);
          continue;
        }
      }
      throw new CalendarApiError(res.status, url, text);
    }
  }
}
