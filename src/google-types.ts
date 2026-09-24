// src/google-types.ts — the fields this connector reads, nothing more.
export interface GDateTime { dateTime?: string; date?: string; timeZone?: string }
export interface GAttendee {
  email?: string; displayName?: string; responseStatus?: string;
  self?: boolean; resource?: boolean; organizer?: boolean;
}
export interface GEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GDateTime;
  end?: GDateTime;
  recurringEventId?: string;
  originalStartTime?: GDateTime;
  iCalUID?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: GAttendee[];
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  eventType?: string;
  transparency?: 'opaque' | 'transparent';
}
export interface GEventsPage {
  items?: GEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  timeZone?: string;
}
export interface GCalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
  timeZone?: string;
}
