import type { AccountId, ExternalRef, Query } from '@kiagent/connector-sdk';
import { DOC_TYPE } from './document';

/** Every document of this account whose calendar was fully listed but whose
 *  externalId was not listed live. One paged listing per pull, read until an
 *  empty page (independent of how the store clamps `limit`). */
export async function staleDeletions(
  query: Query,
  account: AccountId,
  listed: Map<string, Set<string>>,
): Promise<ExternalRef[]> {
  const out: ExternalRef[] = [];
  let offset = 0;
  for (;;) {
    const page = await query.search({ type: DOC_TYPE, account, limit: 500, offset });
    if (page.length === 0) return out;
    offset += page.length;
    for (const d of page) {
      const cal = (d.metadata as { calendarId?: string }).calendarId;
      const live = cal === undefined ? undefined : listed.get(cal);
      if (live && !live.has(d.externalId)) out.push({ externalId: d.externalId, type: DOC_TYPE });
    }
  }
}
