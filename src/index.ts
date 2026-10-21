import type { ExtensionModule } from '@kiagent/connector-sdk';
import { createCalendarSource } from './source';
import { createCalendarWriter } from './writer';

const mod = {
  async activate(host) {
    return {
      sources: [createCalendarSource(host)],
      calendarWriters: { 'google-calendar': createCalendarWriter(host) },
    };
  },
} satisfies ExtensionModule<'net' | 'query' | 'calendar.write'>;

export default mod;
module.exports = mod; // dual export — the host child require()s CJS
