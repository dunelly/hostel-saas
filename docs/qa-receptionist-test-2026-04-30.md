# Receptionist QA Test - 2026-04-30

Local target: `http://localhost:3000`

## Scope

- Room/bed loading
- Walk-in add
- Custom nights greater than 7
- Guest notes
- Extend stay
- Remove nights by shrinking checkout
- Move stay to another bed
- Swap overlapping stays
- Payment update
- Check in
- Check out
- No-show
- Cancel
- Bill panel smoke test

## Result

Passed after fixes: 15 / 15

Browser smoke passed:

- Grid guest cell opens detail panel.
- Panel shows `Check In`, `Extend`, `Edit`, `Note`, `Bill`, `Price`, `No Show`, `Cancel`.
- Bill totals visible for test guest.

## Bugs Found And Fixed

1. Swap failed with a `500`.
   - Cause: swap route used a fake temporary `bedId`, but `bed_id` has a foreign key to real beds.
   - Fix: temporarily move the assignment date instead, then swap real bed IDs.

2. Grid detail panel did not show `Edit` or `Note`.
   - Cause: `BedGrid` did not pass `guestId` into `GuestDetailPanel`.
   - Fix: pass `guestId` from the live assignment.

## Remaining Notes

- Test data was created locally with names starting `QA Recep` and `QA Bill`.
- Cancel/no-show test records had their bed assignments removed as expected.
- No current failing receptionist flow found after fixes.
