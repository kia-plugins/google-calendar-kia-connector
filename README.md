# Google Calendar for KIAgent

Syncs the calendars you choose, from any number of Google accounts, into your
KIAgent memory as `calendar.event` documents. Read-only
(`calendar.readonly`).

- **Connect:** Sources → Add → Google Calendar. Sign-in works exactly like
  Gmail and Google Docs (the app's Google client, or your own).
- **Choose calendars:** the source's folder settings list every calendar on
  the account; the ones you show in Google Calendar are preselected.
- **Sync:** every 5 minutes, incrementally (Google sync tokens). Events from
  one year back to 400 days ahead are kept; older events age out.

## Develop

```bash
npm install
npm test
npm run build   # dist/index.js
```
