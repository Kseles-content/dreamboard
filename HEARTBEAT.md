# Heartbeat checklist

- Check latest DreamBoard commit and open PR.
- If no new commit since the current work block started, report BLOCKED.
- Check latest CI result for the active PR.
- Check staging/API reachability if staging exists.
- If only placeholder endpoint exists (e.g. api.example.com), treat as NO_STAGING and use local demo evidence (`bash scripts/demo-check.sh`) instead.
- Never use the phrases "almost done", "in progress", "nearly ready".
- Only report DONE when commit, PR, checks and demo exist.
