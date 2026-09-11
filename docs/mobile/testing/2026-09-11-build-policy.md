# Sentry build policy — PM C.12

Preview is a store/TestFlight build. It must not succeed silently without crash
reporting or source maps. Consequently **missing release configuration is an
explicit failure**, not a successful preview build. Development and the simulator
`smoke` profile remain available without Sentry credentials.

| Configuration | Expected result |
|---|---|
| Preview/production, DSN/org/project/token present | Preflight passes; native build and real upload must still pass. |
| Preview/production, DSN/org/project absent | Expo config resolution fails, naming missing variables only. |
| Preview/production, token absent | EAS `eas-build-post-install` fails on the worker where secret variables are available. |
| Preview/production, upload disabled or failure ignored | Preflight rejects the bypass. |
| Development/smoke, credentials absent | Allowed; smoke explicitly disables upload and is not a distributable release. |

The Expo plugin receives org/project from the build environment. The token is
never an Expo public variable or plugin argument and is not logged. The normal
Sentry Xcode/Gradle upload hooks fail the build on upload errors.

Verified by unit tests for both release profiles, each missing setting, both
bypass flags, local config resolution, and credential-free development/smoke.
These tests use synthetic values and do not establish authenticated upload success.
A real `eas build --profile preview` and symbolication proof remain account/device
steps after the PM's A.1/A.3 merge gates. The Fable handoff records actual build
and account evidence. No successful signed preview is claimed here.
