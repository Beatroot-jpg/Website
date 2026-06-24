# Los Santos Fight Club Leaderboard Reference

## Purpose
Use this file as the carry-forward reference when rebuilding other panels so we keep the same level of clarity, hierarchy, and control that the leaderboard now has.

## Visual Reference

### Overall structure
- One primary public-facing hero section first.
- Public information above the fold.
- Admin tooling pushed lower on the page.
- Each major admin area split into its own clearly separated container.

### Card hierarchy
- `leaderboard-stage-card`: big public centerpiece with glow and stronger contrast.
- `panel-card`: secondary content containers.
- `admin-action-group`: grouped admin lanes with their own tone and border rail.
- `form-preview-card`: compact preview blocks that show consequences before submit.

### Admin tone system
- `Routine`: green-toned, safest path, normal workflow.
- `Corrections`: amber-toned, deliberate human adjustment lane.
- `Security`: red-toned, high-risk control lane.

### Interaction style
- Buttons open focused modals instead of exposing permanent forms.
- Numbers that matter are larger and closer to the top of the relevant container.
- Riskier actions are visually louder before they are functionally louder.

## Functional Reference

### Public vs admin split
- Public viewers can load the main leaderboard data with no login.
- Admin-only data loads separately and stays hidden unless the session is valid.

### Safe-edit pattern
- Normal actions should not directly overwrite stored totals.
- Direct overrides should be hidden behind an explicit toggle.
- If a destructive or high-impact action exists, it should have:
  - a warning state
  - a preview state when possible
  - an audit trail

### Audit pattern
- The audit log should be searchable.
- The audit log should be filterable by action type.
- The audit log should be paginated in 25-row chunks.
- New admin pages should prefer immutable audit logging over silent mutation.

### Preview pattern
- If a form changes points, money, rank, or permissions, show a preview before save.
- Preview blocks should answer:
  - current value
  - delta
  - projected result

### Scoring-pattern note
- Rules belong in a single scoring config source.
- Repeated preview math should reuse shared logic so frontend and backend do not drift.
- Special penalties like `No Show` should live in the scoring config, not as hard-coded magic numbers.

## Reusable UI Pieces To Copy Forward
- grouped admin lanes
- top-level lock/status banner
- paginated admin tables
- modal-first CRUD flow
- search + filter + pagination footer pattern
- preview cards with larger key numbers
- visible distinction between normal actions and dangerous actions

## Reuse Checklist For The Next Panel
When we port this style into the next area, keep these rules:

1. Put the main public function first.
2. Push admin controls down and separate them by risk level.
3. Avoid long exposed forms on the page.
4. Prefer modals plus previews.
5. Make important numbers easier to read than helper copy.
6. Add pagination before a table becomes visually noisy.
7. Keep one clean source of truth for scoring, money, or stock rules.

## Current Leaderboard-Specific Notes
- Champion owns the reserved `#1` slot.
- Top contender begins at `#2`.
- Archived fighters are restorable from a separate table.
- Belt holder cannot be set inactive until the belt is vacated or moved.
- Manual scoring supports correction flow, including quick-filling the configured no-show penalty.
