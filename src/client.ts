import { requestWithRetry, type NetFetch } from '@kiagent/connector-sdk/http';

export type { NetFetch };
export const CAL_API = 'https://www.googleapis.com/calendar/v3';

export class CalendarApiError extends Error {
  constructor(public readonly status: number, public readonly url: string, body: string) {
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
}
