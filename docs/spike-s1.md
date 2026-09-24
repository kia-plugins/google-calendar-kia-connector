# Spike S1 — what incremental sync returns

Status: **not yet run** — needs an access token with `calendar.readonly`
(OAuth playground), run by the user:

```bash
TOKEN=… CAL=primary node scripts/spike-s1.mjs full
TOKEN=… CAL=primary SYNC=<nextSyncToken> node scripts/spike-s1.mjs inc
```

Sequence: create a weekly series with no end date and one one-off event → `full`
→ (a) delete the whole series, `inc`; (b) recreate a series, delete one
instance, `inc`; (c) move one instance, `inc`.

Until it runs, the sync code and its fixtures assume what Google documents for
`singleEvents=true&showDeleted=true`: a deleted instance or series comes back
as items with `status: 'cancelled'` (instances carry `recurringEventId` and
`originalStartTime`), possibly with only `id` set (sparse cancellation); a
moved instance comes back confirmed with its new `start` and unchanged
`originalStartTime`. The design needs no branch on the answer: cancelled →
deletion by `${calendarId}:${id}`, anything else → upsert.

Record here, per case: the cancelled/changed items' `id`, `status`,
`recurringEventId`, `originalStartTime`, `recurrence`; and page/item counts for
the endless series under the 400-day horizon.
