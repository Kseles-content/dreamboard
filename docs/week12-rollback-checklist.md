# Week 12 Rollback Checklist

## Trigger conditions
- P0 production bug
- Data corruption risk
- Public share leakage risk
- RC smoke scenario failing after deploy

## Rollback steps
1. Identify last known good commit SHA (LKG).
2. Redeploy API + web using LKG artifacts.
3. Verify `/health` returns `{ "status": "ok" }`.
4. Run quick smoke:
   - login
   - list boards
   - open shared token
5. Disable newly issued share links if security-related incident.
6. Announce rollback status with timestamp and cause.

## Post-rollback
- Capture incident notes and affected scope.
- Open follow-up fix PR.
- Re-run release checklist before next RC attempt.
