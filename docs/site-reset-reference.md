# Los Santos Fight Club Workspace Reset Reference

## Purpose
Rebuild the site away from the old gang-business operations model and into a cleaner personal/group workspace for GTA5 FiveM RP tracking.

The new direction is:
- personal and group use
- quick money tracking
- simple stock tracking
- daily task/checklist support
- shared page access for trusted members
- a more document-like workspace with focused tools instead of business-heavy systems

## Core Design Rules
- Keep it simple stupid.
- Desktop-first, with clean support for `1920x1080` and `2560x1440`.
- No horizontal overflow.
- Dark mode and light mode must both feel intentional.
- The homepage should feel like a launcher, not an admin dashboard.
- The brand should feel premium, glowing, cinematic, and unmistakably "Los Santos Fight Club".
- Every page should do one job clearly instead of mixing unrelated workflows.

## Current Reset Plan
Start with the homepage first, then work through the rest of the system in focused passes.

### New Homepage Direction
- Los Santos Fight Club logo near the top
- strong hero copy
- large launcher buttons/cards for each page
- light/dark mode toggle
- clean high-level summary cards underneath
- less "ops overview", more "choose where to work"

### Planned Page Map
- Home
- Sales
- Inventory
- Money / Analytics
- Tasks
- Price List
- Notes / Docs
- Users

## Existing Modules To Treat Carefully
These were part of the prior business model and should not drive the redesign:
- Factory
- Tax
- Distribution
- Secretary
- old banking-specific business flows

Useful parts that can be reused:
- login/auth
- users
- shared styling system
- modal editing flow
- price list logic
- inventory logic
- charting/summary patterns

## Homepage Build Goals
- convert current `Dashboard` into `Home`
- keep the page permission key as `DASHBOARD` for now
- use large, readable launcher cards driven by accessible pages
- keep current summary data where it still helps, but present it as a calm overview
- remove the feeling of an old industrial operations board

## Visual Direction
- glowing logo
- green-led brand accent
- roomy spacing
- fewer stacked admin-feeling feeds
- strong typography
- clear card hierarchy
- subtle motion only where it adds clarity

## Future Follow-Up
Once the homepage is stable:
1. lock the final page list
2. retire or hide old modules no longer needed
3. rebuild remaining pages one by one under the new structure
4. introduce document-style tracking where helpful
