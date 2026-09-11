# SDK maintenance cadence — PM C.13

Stay on the approved SDK 57 major. Refresh the SDK-pinned package set in one
maintenance PR weekly, and again before each physical-device or TestFlight build.
Use `npx expo install --fix`; review the resulting package and lockfile diff.
Do not refresh unrelated dependencies or use `npm audit fix --force` for this task.

Both `npx expo install --check` and `npm run doctor` are blocking Mobile CI steps.
Doctor is pinned as a dev dependency (1.20.4 at this review) so CI does not execute
an unreviewed latest doctor release. Its remote SDK compatibility data can change:
when a newly published patch fails a PR, refresh the pinned set in a maintenance
PR, merge that first, then update the affected branch. Re-run transient network
failures; do not quietly waive the check. Review doctor updates in the same weekly
maintenance cadence.

Use npm 10 (matching Node 22 CI) when refreshing the lockfile; earlier npm 11
output omitted optional WASM peer entries and failed clean CI installs. Validation
for a refresh is clean `npm ci`, compatibility/Doctor, mobile typecheck/lint/tests,
and a fresh native prebuild/build before any device acceptance. Native artifacts
built against the preceding patch set are not proof of the refreshed binary.
