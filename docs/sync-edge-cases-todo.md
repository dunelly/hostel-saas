# Sync Edge Cases To Fix Later

Context: during migration, Excel/Google Sheet sync is the source of truth only when the user manually runs that sync. After that, Gmail/Booking/Hostaway-style syncs can still add or update new bookings. Next Excel sync may replace the same date window again.

## Source Sheet Links

- April sheet: `https://docs.google.com/spreadsheets/d/1m1OgIVRRgZvzvd-WzOeRLVrB1EpjllN0adsc4pmNXPU/edit?gid=923324031#gid=923324031`
- May sheet: `https://docs.google.com/spreadsheets/d/1m1OgIVRRgZvzvd-WzOeRLVrB1EpjllN0adsc4pmNXPU/edit?gid=1888445989#gid=1888445989`
- CSV export pattern used by app: `https://docs.google.com/spreadsheets/d/1m1OgIVRRgZvzvd-WzOeRLVrB1EpjllN0adsc4pmNXPU/export?format=csv&gid={gid}`
- Important parser fact: `4B` can start guest rows immediately after `ROOM 4B`; other rooms often have a spacer row.

## Highest Probability Glitches

1. Same OTA booking changes after first import
- Scenario: same `source + externalId`, but dates, room, price, guest count, or guest name changed.
- Risk: duplicate path skips update, app keeps stale booking.
- Fix: make OTA import an upsert. Update changed fields. If dates, room, or guest count changed, clear old automatic assignments and re-run assignment.
- Tests: import booking, import same external ID with changed dates/room/guest count, assert one reservation updated and assignments match new stay.

2. Excel sync overwrites bookings added after last sheet sync
- Scenario: staff sync Excel, then Gmail/Booking/Hostaway adds bookings, then staff syncs Excel again before adding those bookings to Excel.
- Risk: Excel sync replaces date window and removes those app-only bookings.
- Fix: keep behavior because Excel is truth at sync time, but show warning and post-sync report with removed booking count/names.
- Tests: seed OTA row inside Excel date window, run Excel sync fixture without that guest, assert row removed and report includes removed item.

3. Same guest name overlaps dates
- Scenario: one guest books twice, or two people share same name.
- Risk: same name appears in multiple beds same night; could be valid or duplicate.
- Fix: warning only. Do not block import. Report overlapping same-name reservations with booking IDs, dates, beds.
- Tests: import overlapping same-name reservations with different external IDs, assert both remain and warning is returned.

4. Same name, different people merged into one guest profile
- Scenario: two different people have same name.
- Risk: guest profile, bill, tours, laundry history can mix.
- Fix: later identity model improvement. Prefer OTA booking identity (`source + externalId`) over name-only merge when details differ.
- Tests: two same-name bookings with different external IDs/details should not combine balances unexpectedly.

5. Partial assignment
- Scenario: stay has beds for some nights but not all nights.
- Risk: code may insert partial bed rows and report error, leaving half-truth on grid.
- Fix: wrap assignment per reservation/guest in transaction. Either assign all nights, or insert nothing and return unassigned warning.
- Tests: create capacity gap mid-stay, run auto-assign, assert no partial assignment rows.

6. Concurrent double sync
- Scenario: auto sync and manual sync run together, or user double-clicks sync.
- Risk: duplicate rows if both pass duplicate check before insert.
- Fix: add sync lock plus DB unique guard on `source + externalId`.
- Tests: simulate same import twice/concurrently, assert one reservation only.

## Lower Probability / Later

- Google Sheet CSV stale/cache: add cache-bust param and show fetched timestamp.
- Sheet edited mid-sync: add preview count and sync transaction.
- Bad date headers: validate parsed date range before delete.
- Room capacity mismatch: assert parsed bed IDs exist before insert.
- Real guest name with `ROOM`: structural filter should match room labels only, not names.
- Hostelworld parser odd email: include parser confidence/raw source link in warning report.
- Back-to-back bookings: keep checkout day free for next check-in; add regression test.
- OTA cancellation miss: cancel by exact `source + externalId`, delete future auto assignments.
- Manual app move vs OTA update: preserve `isManual = 1`, only rebuild auto rows.

## Minimal Fix Bundle

1. OTA changed-booking upsert.
2. Post-sync sanity/warning report.
3. Per-reservation assignment transaction.
4. Sync lock and unique `source + externalId` guard.
5. Excel sync warning/report before upload/deploy.

## Verification Before Upload

- Add unit/API tests for each high-probability glitch above.
- Run targeted sync tests.
- Run full test suite if browser test environment is stable; otherwise document unrelated existing failures.
- Manually test Excel sync fixture, then OTA import after Excel sync, then next Excel sync behavior.
