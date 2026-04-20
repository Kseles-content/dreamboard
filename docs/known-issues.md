# Known issues / limitations — v1.0

This list includes non-blocking items (P2/P3) that do not stop release.

## P2

1. **No dedicated staging environment (`NO_STAGING`)**
   - Current validation relies on local demo/smoke evidence.
   - Impact: lower confidence for environment-specific issues.
   - Workaround: run `scripts/demo-check.sh` + `scripts/smoke-test.sh` before releases.

2. **Export is client-side (canvas snapshot)**
   - PNG/JPG export is generated in browser from visible editor state.
   - Impact: no server-side export API, limited for automation/batch export.
   - Workaround: export from web UI; evidence documented in `docs/export-evidence.md`.

## P3

3. **CI workflow name is legacy (`Day1 CI`)**
   - Functional but naming does not reflect current release phase.
   - Impact: cosmetic/maintenance only.

4. **Documentation drift risk in historical day/week docs**
   - Some historical docs may contain old command variants.
   - Impact: low; current handoff docs are canonical.

---

## Release policy

Items above are acceptable for v1.0 handoff and tracked as post-release improvements.
