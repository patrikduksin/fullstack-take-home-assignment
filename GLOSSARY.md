# Funnel runtime

A visitor progresses through configured screens while the system records actions and compares outcomes across versions, variants, and initial campaigns.

## Language

**Configuration version**: An immutable definition of a funnel's screens, answers, navigation rules, result, variant content, and permitted events. A published version remains available to the sessions that started with it. _Avoid_: Mutable funnel, latest configuration

**Activation**: A recorded choice of the configuration version that new sessions will use. An activation does not change existing sessions. _Avoid_: Configuration edit

**Pinned session**: A visitor's progress tied to the configuration version and variant assigned at its start. Its accepted answers, position, and visited history belong to that original definition. _Avoid_: Current-version session, user account

**Variant**: The A or B alternative within one configuration version. Its assignment belongs to the session and can change content, ordering, or which screens exist. _Avoid_: Version, campaign

**Screen (Step)**: A configured question, information page, or result identified consistently within its version. The configuration and API call a screen a step. A screen may exist without belonging to a visitor's eligible route. _Avoid_: Eligible route

**Eligible route**: The ordered screens available from start to result for a session's accepted answers. Unresolved conditions follow the configuration's explicit default. _Avoid_: All configured screens, visited history

**Route revision**: A historical identity for an eligible route after an answer changes its screens or order. Ordinary progress along the same route does not create another revision. _Avoid_: Step number, event receipt order

**Initial attribution**: The marketing source, medium, campaign, term, and content captured when a session starts. Later visits retain that original attribution. _Avoid_: Latest URL campaign

**Immutable event**: A uniquely identified observation of a session action with its original content. A replay represents that same observation; conflicting content cannot replace it. _Avoid_: Answer, mutable action record

**Declared event**: An additional event permitted by a configuration version, limited to specified screens and non-sensitive properties. Earlier pinned sessions retain their own permitted events. _Avoid_: Arbitrary custom payload

**Cohort**: Sessions grouped by configuration version, variant, and initial campaign. Each metric counts distinct participating sessions within that group. _Avoid_: All visitors, latest campaign

**Result reach**: The share of started sessions that viewed a result. This is the proposed primary measure for the A/B experiment. _Avoid_: Result views, CTA CTR

**CTA CTR**: The share of result-viewing sessions that clicked the result's call to action. This is the proposed secondary experiment measure. _Avoid_: Clicks per started session

**Eligible transition**: A recorded completion from a source screen to its resolved destination. Conversion requires that session to view the destination at or after completion in the same route revision. _Avoid_: Every potential branch, destination viewers alone

**Snapshot drop-off**: Participating sessions without the relevant completion or conversion at the captured observation time. It measures incomplete observed progress rather than permanent abandonment. _Avoid_: Abandoned visitors, lost customers

**Rollback**: An activation of the preceding activation's target. It preserves published versions and sessions, including sessions that started with the version being rolled back. _Avoid_: Version deletion, session reset
