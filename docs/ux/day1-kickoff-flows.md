# UX Sprint — Day 1 Flows (v1)

Date: 2026-04-15 (UTC)
Owner: Product/UX

## 1) Onboarding flow (3 scenarios)

Scenarios:
- Goal board (`goal`)
- Moodboard (`moodboard`)
- Sprint board (`sprint`)

### Entry points
- First login (no boards)
- Manual action: `Create board` → `Start with template`

### Flow
1. Welcome step: "What do you want to create today?"
2. Scenario selection (3 cards).
3. Template picker filtered by selected scenario.
4. Optional rename board.
5. Create board from template and redirect to board canvas.

### Wireframe (low-fidelity)

```text
+--------------------------------------------------------------+
| DreamBoard                                                   |
|--------------------------------------------------------------|
| Welcome 👋                                                   |
| What do you want to create today?                            |
|                                                              |
| [ Goal board ]  [ Moodboard ]  [ Sprint board ]             |
|                                                              |
|                         [ Continue ]                         |
+--------------------------------------------------------------+
```

```text
+--------------------------------------------------------------+
| Pick a template (Scenario: Sprint board)                     |
|--------------------------------------------------------------|
| [Template A] [Template B] [Template C]                       |
|  tags...      tags...      tags...                           |
|                                                              |
| Board name: [ Sprint Planning Week 1                     ]   |
|                                          [ Create board ]    |
+--------------------------------------------------------------+
```

---

## 2) Home Dashboard flow (Recent / Pinned / Search)

### Content blocks
- Search bar (title search)
- Pinned boards section
- Recent boards section
- Empty state block (if both lists empty)

### Behavioral rules
- Pin toggle updates card instantly (optimistic UI).
- Pinned items always listed above recent.
- Search filters both sections by title.

### Wireframe (low-fidelity)

```text
+----------------------------------------------------------------+
| DreamBoard Home                                  [New board +] |
|----------------------------------------------------------------|
| Search boards: [ _____________________________ ]               |
|                                                                |
| Pinned                                                         |
| [📌 Product Roadmap] [📌 Q2 Goals]                             |
|                                                                |
| Recent                                                         |
| [Sprint Week 1] [Research Backlog] [Ideas]                    |
+----------------------------------------------------------------+
```

---

## 3) Board empty state flow

### Context
Shown when board has no cards/objects yet.

### Goals
- Remove blank-canvas anxiety.
- Encourage first meaningful action in <= 30 seconds.

### Primary actions
- Add first text card
- Open template assistant
- Show quick tips (keyboard + drag/resize basics)

### Wireframe (low-fidelity)

```text
+--------------------------------------------------------------+
| Board: Sprint Week 1                                         |
|--------------------------------------------------------------|
|                    Your board is empty                       |
|         Start with one of these quick actions:               |
|                                                              |
| [ Add text card ]   [ Use template blocks ]   [ Quick tips ] |
|                                                              |
| Tip: Press '/' to open quick insert                          |
+--------------------------------------------------------------+
```

---

## Acceptance notes (UX)
- Flows are compatible with endpoints:
  - `GET /v1/boards/recent`
  - `POST /v1/boards/{id}/pin`
  - `GET /v1/templates`
  - `POST /v1/boards/from-template`
- Wireframes are intentionally low-fidelity for Day 1 kickoff alignment.
