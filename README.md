# Saloncapp SOP Trainer

Independently deployable Training / SOP microservice for Saloncapp Staff.

SOP **content** is developer-managed TypeScript in `src/data/sops/`. APIs serve those files directly. MongoDB stores staff progress, assessment attempts, and voice-agent sessions.

There is no Trainer CMS, no sync job, and no seed-on-startup. The trainer must not invent products, procedure steps, or salon advice that is not in the SOP files.

## Database (separate from SaloncappRepo)

This service uses its **own MongoDB database**. Do not point `MONGODB_URI` at the main app DB.

| Service | Example database name |
|---|---|
| SaloncappRepo (monolith) | `preprod` / production DB |
| SaloncappSOPTrainer | `saloncapp_sop_trainer` |

## Setup

```bash
cp .env.example .env
# Set NEXTAUTH_SECRET to the SAME value as SaloncappRepo
# Set MONGODB_URI to a dedicated DB (saloncapp_sop_trainer)
# Set GEMINI_API_KEY
# PORT=4010
npm install
npm run dev
```

Default port: **4010**

## Staff App

Keep the existing staff API URL unchanged. Set a **separate** Training URL in SaloncappStaffApp `.env`:

```
EXPO_PUBLIC_TRAINING_API_URL=http://localhost:4010
```

On a physical device, `localhost` points at the phone. Use your computer's LAN IP, for example:

```
EXPO_PUBLIC_TRAINING_API_URL=http://192.168.1.10:4010
```

Production: set `EXPO_PUBLIC_TRAINING_API_URL` to the deployed trainer host. Do not hard-code localhost.

Staff reuse the existing login JWT from SaloncappRepo.

## Voice agent flow

After a staff member taps a service card in the Training tab, the agent owns the rest of the session by voice:

1. Welcome and ask to begin the current step.
2. Play that step's video. The agent does not speak or listen during playback.
3. After the video finishes, ask to rewatch or continue.
4. Repeat for every step, then offer the 5-question assessment (5 minutes, pass mark: more than 80%).
5. On fail, keep completed videos. The staff can retake immediately or ask to review a step by title or concept.

Agent APIs (staff JWT + `x-tenant-id`):

- `POST /api/trainings/:id/agent/session`
- `POST /api/trainings/:id/agent/turn`
- `POST /api/trainings/:id/agent/video-complete`
- `POST /api/trainings/:id/agent/abandon`

## Adding / changing an SOP

1. Add or edit a file under `src/data/sops/` (for example `hairSpa.ts`).
2. Register it in `src/data/sops/index.ts`.
3. If you change existing steps, titles, descriptions, or video URLs, increment `contentVersion`.
4. Deploy this service.

Staff progress for an older `contentVersion` is reset from Step 1. Assessment attempt history is kept.

HydraFacial currently uses public HTTPS sample videos so the player can be tested. Replace those URLs with approved training videos and bump `contentVersion` before production.

```bash
npm test
npm run build
```
