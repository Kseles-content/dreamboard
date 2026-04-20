# Export evidence (manual check)

Date: 2026-04-20 07:30:25 UTC

## Scope
Manual confirmation of export flow in DreamBoard web app:
- Export PNG
- Export JPG

## Environment
- API: `npm run start:dev` on `http://127.0.0.1:3000`
- Web: `npm run dev` (Next.js) on `http://127.0.0.1:3100`
- Board opened in web editor, then export actions triggered from toolbar buttons.

## Steps performed
1. Opened web app login page (`/`).
2. Logged in with default form values.
3. Ensured an active board is open (created/opened board if needed).
4. Clicked **Export PNG**.
5. Clicked **Export JPG**.

## Result
Both exports completed successfully and produced downloadable files:
- `docs/evidence/manual-export-1776670219605.png` (suggested filename: `dreamboard-1161.png`)
- `docs/evidence/manual-export-1776670219694.jpg` (suggested filename: `dreamboard-1161.jpg`)

Additional UI screenshot captured:
- `docs/evidence/manual-export-ui.png`

## Conclusion
Manual export verification for PNG and JPG is **passed**.
