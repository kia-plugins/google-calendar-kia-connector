import type { AccountId, ExternalRef, Query } from '@kiagent/connector-sdk';
import { DOC_TYPE } from './document';

/** Every document of this account whose calendar was fully listed but whose
 *  externalId was not listed live. One paged listing per pull. */
export async function staleDeletions(
  query: Query,
  account: AccountId,
  listed: Map<string, Set<string>>,
): Promise<ExternalRef[]> {
  const out: ExternalRef[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query.search({ type: DOC_TYPE, account, limit: 500, offset });
    for (const d of page) {
      const cal = (d.metadata as { calendarId?: string }).calendarId;
      const live = cal === undefined ? undefined : listed.get(cal);
      if (live && !live.has(d.externalId)) out.push({ externalId: d.externalId, type: DOC_TYPE });
    }
    if (page.length < 500) return out;
  }
}
