import type {
  Account, AuthChannel, FolderNode, FolderScopeUpdate, FolderSelectionChannel, HostFor, Session, Source,
} from '@kiagent/connector-sdk';
import { CalendarAuthError, CalendarClient } from './client';
import { prune, type Cursor } from './cursor';
import { toDocument, type CalItem } from './document';
import { listCalendars, rootsOf } from './calendars';
import type { GCalendarListEntry } from './google-types';
import { pullCalendars } from './pull';

export const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export interface CalendarSeams { now?(): number; sleep?(ms: number): Promise<void>; random?(): number }

const nodeOf = (c: GCalendarListEntry): FolderNode =>
  ({ id: c.id, name: c.summaryOverride ?? c.summary ?? c.id, hasChildren: false });

const primaryId = (cals: GCalendarListEntry[]): string => {
  const p = cals.find((c) => c.primary)?.id;
  if (!p) throw new Error('google-calendar: no primary calendar in calendarList');
  return p;
};

async function requireToken(session: Session): Promise<string> {
  const creds = await session.credentials();
  if (!creds?.accessToken) throw new CalendarAuthError('google-calendar: no credentials available — reconnect the account');
  return creds.accessToken;
}

export function createCalendarSource(host: HostFor<'net' | 'query'>, seams: CalendarSeams = {}): Source<Cursor, CalItem> {
  const now = seams.now ?? Date.now;
  const clientFor = (session: Session) =>
    new CalendarClient({
      fetch: host.net.fetch,
      getToken: () => requireToken(session),
      sleep: seams.sleep,
      signal: session.signal,
    });
  const tokenClient = (token: string) =>
    new CalendarClient({ fetch: host.net.fetch, getToken: async () => token, sleep: seams.sleep });

  const pickerSpec = (cals: GCalendarListEntry[], purpose: 'connect' | 'manage', selected: FolderNode[]) => ({
    modes: [{ key: 'calendars', label: 'Calendars' }],
    multiSelect: true,
    purpose,
    selected,
    roots: async () => cals.map(nodeOf),
    children: async () => [],
  });

  return {
    descriptor: {
      id: 'google-calendar',
      name: 'Google Calendar',
      documentTypes: ['calendar.event'],
      auth: 'oauth',
      multiAccount: true,
      folderScope: true,
      cadence: { every: '5m' },
    },

    async connect(auth: AuthChannel) {
      auth.status('Waiting for Google sign-in…');
      const creds = await auth.oauth([SCOPE]);
      if (!creds.accessToken) throw new Error('google-calendar: Google sign-in returned no access token');
      auth.status('Loading your calendars…');
      const cals = await listCalendars(tokenClient(creds.accessToken));
      const picked = await auth.pickFolders(pickerSpec(cals, 'connect', cals.filter((c) => c.selected).map(nodeOf)));
      if (picked.length === 0) throw new Error('google-calendar: no calendars selected');
      return { identifier: primaryId(cals), config: { folderRoots: picked.map((n) => ({ id: n.id, name: n.name })) } };
    },

    async reauthenticate(account: Account, auth: AuthChannel) {
      auth.status('Waiting for Google sign-in…');
      const creds = await auth.oauth([SCOPE]);
      if (!creds.accessToken) throw new Error('google-calendar: Google sign-in returned no access token');
      auth.status('Verifying the Google account…');
      const email = primaryId(await listCalendars(tokenClient(creds.accessToken)));
      const fold = (s: string) => s.trim().toLowerCase();
      if (fold(email) !== fold(account.identifier)) {
        throw new Error(`google-calendar: signed in as ${email}, but this account is ${account.identifier} — sign in with the original Google account`);
      }
    },

    async manageFolders(session: Session, channel: FolderSelectionChannel): Promise<FolderScopeUpdate<Cursor>> {
      channel.status('Loading your calendars…');
      const cals = await listCalendars(clientFor(session));
      const current = rootsOf(session);
      const picked = await channel.pickFolders(
        pickerSpec(cals, 'manage', current.map((r) => ({ id: r.id, name: r.name, hasChildren: false }))),
      );
      if (picked.length === 0) throw new Error('google-calendar: no calendars selected');
      const folderRoots = picked.map((n) => ({ id: n.id, name: n.name }));
      const keep = new Set(folderRoots.map((r) => r.id));
      const prior = (session.account.cursor ?? null) as Cursor | null;
      return {
        config: { folderRoots },
        cursor: prior ? prune(prior, [...keep]) : null,
        archiveScopeRootIds: current.map((r) => r.id).filter((id) => !keep.has(id)),
      };
    },

    pull: (session, cursor) => pullCalendars({ host, session, cursor, client: clientFor(session), now }),

    toDocument: (item) => toDocument(item),
  };
}
