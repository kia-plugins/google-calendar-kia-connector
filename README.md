# Google Calendar for KIAgent

Syncs the calendars you choose, from any number of Google accounts, into your
KIAgent memory as `calendar.event` documents. Read-only
(`calendar.readonly`).

- **Connect:** Sources → Add → Google Calendar. Sign-in goes through
  KIAgent's Google gate, exactly like Gmail and Google Docs: a founding seat on
  the app's Google client, or your own OAuth client. With your own client,
  also enable the **Google Calendar API** in that Google Cloud project.
- **Choose calendars:** the source's folder settings list every calendar on
  the account; the ones you show in Google Calendar are preselected.
- **Sync:** every 5 minutes, incrementally (Google sync tokens). Events from
  one year before the account was connected up to about 13 months ahead
  (past events stay in memory). Declined events are kept (marked);
  working-location entries are skipped. Several accounts can be connected —
  the same invite on two accounts is one occurrence (`metadata.occurrenceKey`).
- **Calendar page:** the app's own Calendar shows these events, beside any
  other calendar source (Microsoft 365). Settings → Calendar shows or hides
  it. This connector only syncs data; it needs KIAgent platform 2.6.0 or
  later.

## Develop

```bash
npm install
npm test
npm run build   # dist/index.js
```
