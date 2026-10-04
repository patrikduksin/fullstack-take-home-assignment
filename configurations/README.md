# Fictional configurations

The assignment's original JSON files were not supplied. `linear-v1.json` is an authored replacement for the first incremental delivery. Its trail-planning content, options, constraints, ordering, and result CTA are fictional sample data.

The generated D1 migration seeds the same immutable configuration and makes it active. Sessions retain that version's identifier and restore its JSON alongside their answers, current step, and visited history.

`variants-v1.json` is an additive fictional version. Its B overrides change welcome wording, put available time before pace and interests, and change result wording and CTA text. The new migration activates it while retaining `trail-linear-v1` for existing sessions. Variant content is resolved by the backend; the frontend uses the returned steps.

`iteration-one/trail.json` and `iteration-one/camp.json` are the two authored first-iteration replacements. Each has seven screens and an explicit conditional branch with a default. Trail's active pace asks about supplies; camp's waterside interest adds an informational stop. Both include A/B content. New immutable versions retain the incremental linear and variant versions for pinned sessions.

`iteration-two/trail.json` is an authored fictional second iteration. It adds a rest screen for outings of at least four hours and declares the safe `information_acknowledged` event on completion of that screen. A retains preparation; B explicitly removes it and supplies its own navigation around it. The fixture is validated locally before publication; first-iteration acceptance must finish before its first publication.
