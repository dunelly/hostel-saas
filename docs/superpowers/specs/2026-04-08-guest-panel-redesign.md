# Guest Detail Panel Redesign — Spec

## Goal

Redesign the GuestDetailPanel from a card-based layout with scattered styling to an Opera PMS-inspired dense form-grid layout. Prioritize information density, straight-down scanning, and action speed.

## Design Direction

Opera PMS style — dark title bar, 2-column form grid (label | value | label | value), compact toolbar with all actions visible, payment strip inline.

## Layout Structure

```
┌──────────────────────────────────────┐
│ [dark bg] Name              STATUS   │  ← title bar
├──────────┬───────┬──────────┬────────┤
│ BED      │ 3A-07 │ SOURCE   │ HWorld │  ← 2-col form grid
│ CHECK-IN │ 9 Apr │ CHECKOUT │ 12 Apr │
│ NIGHTS   │ 3     │ GUESTS   │ 1      │
│ TOTAL    │ ₫2.8M │ BALANCE  │ ₫2.8M  │  ← balance in red
├──────────┴───────┴──────────┴────────┤
│ [₫ Amount input] [Add] [Paid all]    │  ← payment strip
├──────────────────────────────────────┤
│ [Check In] [Extend] [Edit] [Bill]    │  ← toolbar (all actions)
│                    [No Show] [Cancel] │
└──────────────────────────────────────┘
```

## Visual Details

### Title Bar
- Background: `#1e3a5f` (dark navy)
- Guest name: white, bold, 13px
- Status badge: semi-transparent white bg, uppercase, 10px
- Status text changes by state:
  - `confirmed` → "ARRIVING"
  - `checked_in` → "CHECKED IN"
  - `checked_out` → "CHECKED OUT"
  - `no_show` → "NO SHOW"
  - `cancelled` → "CANCELLED"

### Form Grid
- CSS Grid: `grid-template-columns: 80px 1fr 80px 1fr`
- Labels: `#f1f5f9` background, `#64748b` text, 10px, uppercase, bold
- Values: white background, `#0f172a` text, 12px, medium weight
- Cell borders: `1px solid #e2e8f0` between cells
- Balance/Owed row: value in `#dc2626` (red), bold
- Paid row: value in `#10b981` (green) when > 0

### Form Grid Fields (by state)

**Arriving (confirmed):**
| BED | value | SOURCE | value |
| CHECK-IN | date | CHECKOUT | date |
| NIGHTS | n | TOTAL | amount |
| OWED | red amount | PAID | amount |

**Checked In:**
Same as arriving.

**Checked Out:**
Same but OWED row replaced with PAID showing green checkmark if fully paid.

### Payment Strip
- Only visible when guest has a balance (owed > 0) AND status is confirmed or checked_in
- Layout: `[input] [Add button] [Paid all button]`
- Input: border `#cbd5e1`, 11px, placeholder "Payment amount"
- Add button: `#1e3a5f` bg, white text
- Paid all button: `#10b981` bg, white text
- No cash/card/transfer selector

### Toolbar
- Background: `#f8fafc`
- Border top: `1px solid #e2e8f0`
- All buttons in one row, wrapping allowed
- Button styles:
  - Primary (Check In / Check Out): `#1e3a5f` bg, white text
  - Secondary (Extend, Edit, Bill): white bg, `#cbd5e1` border, `#475569` text
  - Danger (Cancel): white bg, `#fca5a5` border, `#dc2626` text
- Buttons: 4px 10px padding, 10px font, 600 weight, 3px radius

**Toolbar buttons by state:**

- **Arriving**: Check In, Extend, Edit, Bill, No Show, Cancel
- **Checked In**: Check Out, Extend, Edit, Bill, Cancel
- **Checked Out**: Undo Checkout, Bill (only)
- **No Show**: Bill (only)
- **Cancelled**: Bill (only)

### Overall
- Border radius: 4px (sharp, enterprise feel)
- Border: `1px solid #cbd5e1`
- No avatar/initials
- No colored left accent
- No large CTA buttons
- Font: system-ui

## What Gets Removed

- Avatar with initials circle
- Large full-width Check In / Check Out buttons
- Cash / Card / Transfer payment method selector
- Color legend
- Gradient backgrounds on status header
- Serif font on guest name
- Separate "Today's Summary" pill section in header (already removed)

## What Stays (logic unchanged)

- All mutations (updateMutation, extendMutation, guestUpdateMutation)
- Check-in form (passport/ID, nationality, phone) — triggered by Check In button click
- Checkout confirmation when balance due
- Extend stay functionality (triggered by Extend button)
- Bill view and print (triggered by Bill button)
- Guest edit form (triggered by Edit button)
- SummaryPill dropdown behavior
- Slide-in/out animation
- Command palette integration
- All API endpoints and data fetching

## Scope

Single file change: `apps/web/src/components/GuestDetailPanel.tsx`

The component is 1,088 lines. This redesign changes the JSX/styling only — no logic, state, mutations, or prop changes. The internal sub-flows (check-in form, extend form, bill view, guest edit) keep their existing behavior but should adopt the same dense styling (form-grid for inputs, compact buttons).
