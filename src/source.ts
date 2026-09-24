// Stub — replaced in Task 5.
import type { HostFor, Source } from '@kiagent/connector-sdk';

export function createCalendarSource(host: HostFor<'net' | 'query'>): Source {
  void host;
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
    async connect() {
      throw new Error('not implemented');
    },
    async *pull() {},
    toDocument: () => null,
  };
}
