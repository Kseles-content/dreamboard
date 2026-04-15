# Day 10 — Rollout & Monitoring Checklist

## Rollout plan

### Phase 1 — 10%
- [ ] Enable feature set for 10% traffic/users
- [ ] Verify API error rate does not regress
- [ ] Verify onboarding completion rate is stable
- [ ] Verify no spike in client console errors

### Phase 2 — 50%
- [ ] Confirm Phase 1 metrics are healthy for at least 1 hour
- [ ] Expand to 50%
- [ ] Re-check key journey:
  - onboarding
  - template board creation
  - empty board creation
  - first card creation
  - share link + public page
  - export actions

### Phase 3 — 100%
- [ ] Confirm Phase 2 metrics are healthy for at least 2 hours
- [ ] Expand to 100%
- [ ] Run final smoke command:
  - `bash scripts/demo-check.sh`

## Post-release monitoring (first 24h)

### API / backend
- [ ] 5xx rate baseline maintained
- [ ] Latency for boards list and board open endpoints stable
- [ ] No DB migration regressions observed

### Product analytics events
- [ ] `onboarding_started` received
- [ ] `onboarding_completed` received
- [ ] `template_selected` received
- [ ] `board_created` (template and empty) received
- [ ] `first_card_added` received
- [ ] `share_link_created` received
- [ ] `export_clicked` received
- [ ] `resume_clicked` received

### UX sanity checks
- [ ] Home Dashboard search and filters usable
- [ ] Resume block appears only when expected
- [ ] Empty state transitions correctly after first card
- [ ] Template picker confirmation flow works

## Rollback trigger criteria

Rollback / halt rollout if any of these occur:
- [ ] Sustained 5xx increase > 2x baseline for 15+ min
- [ ] Onboarding completion drops > 30% from baseline
- [ ] Share/public view fails for > 5% of attempts
- [ ] Severe frontend breakage in core dashboard flow

## Owners
- Engineering owner: backend + web checks
- QA owner: critical flow verification
- Product owner: event funnel sanity + go/no-go
