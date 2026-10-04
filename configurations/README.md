# Fictional configurations

The assignment's original JSON files were not supplied. `linear-v1.json` is an authored replacement for the first incremental delivery. Its trail-planning content, options, constraints, ordering, and result CTA are fictional sample data.

The generated D1 migration seeds the same immutable configuration and makes it active. Sessions retain that version's identifier and restore its JSON alongside their answers, current step, and visited history.

`variants-v1.json` is an additive fictional version. Its B overrides change welcome wording, put available time before pace and interests, and change result wording and CTA text. The new migration activates it while retaining `trail-linear-v1` for existing sessions. Variant content is resolved by the backend; the frontend uses the returned steps.
