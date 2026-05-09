# Day 10 — Release Notes (Sprint Days 1–10)

Date: 2026-04-15 (UTC)
Release type: Sprint integration release

## Highlights

- Introduced onboarding-first board creation (Goal / Moodboard / Sprint).
- Added template-driven board creation and Home Dashboard template picker.
- Added empty board creation flow and improved board empty state UX.
- Added resume experience: "Continue where you left off".
- Added board search v1 with filters and debounce.
- Added analytics instrumentation for key UX funnel events.

## Backend/API changes

- `GET /v1/boards/recent`
- `POST /v1/boards/:boardId/pin`
- `DELETE /v1/boards/:boardId/pin`
- `GET /v1/templates`
- `POST /v1/boards/from-template`
- `GET /v1/boards` now supports:
  - `query` (title search)
  - `updatedSince`
  - `pinned`
  - `limit` + `cursor`

Data model additions:
- `boards.lastOpenedAt`
- `boards.isPinned`
- `boards.templateId`
- `templates` table + seed templates
- `users.onboardedAt`

## Frontend UX changes

- Onboarding modal for first-time users.
- Home Dashboard blocks:
  - Start with template
  - Create empty board
  - Continue where you left off
- Board list search/filter controls.
- Empty-state CTA: "Добавить первую карточку".

## Observability/analytics

Tracked events:
- `onboarding_started`
- `onboarding_completed`
- `template_selected`
- `board_created`
- `first_card_added`
- `share_link_created`
- `export_clicked`
- `resume_clicked`
- `upload_image`

## Validation summary

- e2e suite: **14/14 passed**
- CI baseline on integration PR: **all checks green**
- Critical user flow smoke: passed
