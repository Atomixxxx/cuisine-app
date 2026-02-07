# i18n Evaluation

## Current State
- UI strings are mostly French but spread directly across components.
- A few labels remain mixed (French/English and encoding artifacts).
- No translation extraction pipeline is in place.

## Recommendation
- Keep French-only for now (single-user app) and avoid i18n framework overhead immediately.
- Prepare migration path by centralizing visible strings in feature-level constants first.
- Re-evaluate `react-i18next` only if you need:
  - multi-language support,
  - date/number locale switching,
  - translations managed outside code.

## Trigger To Adopt i18n
- If you add a second language or share the app with other users, switch to `react-i18next`.
