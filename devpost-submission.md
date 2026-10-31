# Skin AI — Your Daily Edit

Status: Submitted to the YouCam hackathon. Submission ID: 1275923. Confirmed by project read-back.

Tagline: Understand the photo. Check the label. Keep the essentials.

Project: https://devpost.com/software/skin-ai-your-daily-edit

## Inspiration
A skin score is easy to display. Explaining what a person can reasonably do with it is harder. Skin AI is for adults who want a manageable basic routine and clear reasons, without an endless shelf of products or a shopping funnel.

## What it does
Skin AI combines six YouCam cosmetic observations with self-reported skin type, goals, sensitivity, ingredient restrictions and prescribed-treatment status. It displays raw scores and available visual maps, then offers an explained three-step morning routine and two-step evening routine.

Photo observations provide context. They do not diagnose skin type, establish disease severity or select a treatment. Product options are filtered using the user's answers and captured manufacturer labels. Unknown skin type, unresolved ingredients or an unspecified prescription withhold named options rather than guessing.

Each option exposes its source date, skin-type label and captured ingredients, with general skincare guidance linked separately. Users can change their answers without submitting another photo, compare an alternative, copy the routine and clear the finished session.

## Data before recommendations
A scripted pipeline extracted 80 US manufacturer records across five brands. Fifty-one passed initial extraction checks; 30 pass the narrower release rules. The pipeline keeps exact source URLs, timestamps, hashes, ingredient sections and exclusion reasons.

The limited release excludes known reformulation, unsupported categories, missing skin-type evidence, conflicting fragrance claims and PM-only products in shared AM/PM steps. Named sunscreens require captured SPF 30+, broad-spectrum and 40- or 80-minute water-resistance labels. Recognized ingredient restrictions are screened against the captured US list, not assumed safe worldwide.

These are technical source checks, not independent clinical validation, allergy certification or a full-market ranking. AAD/FDA references support basic routine principles; they do not endorse the named brands. There are no paid placements or purchase buttons.

## How it is built
Next.js, React, TypeScript and Zod support the profile and consent flow. Server-side Sharp normalizes the image and removes metadata. The app uploads the file to YouCam, creates one V2.1 asynchronous Skin Analysis task for six SD observations, polls that task and proxies session-owned visual maps.

The hosted app uses private Vercel Blob storage with AES-GCM encrypted task state and conditional ETag writes. A durable shared allowance and per-session cap prevent concurrent requests or redeployments from resetting the demo budget. The authored example works without a provider call.

## Challenges
An early fictional portrait was rejected because the face occupied too little of the frame; a tighter crop succeeded. Valid visual maps arrived with a generic binary content type, so the proxy validates decoded image bytes instead of trusting the MIME label. Raw and presentation-adjusted scores also needed distinct handling.

The larger product challenge was resisting unsupported precision: a lower photo score is not evidence that a particular ingredient, concentration or brand will help. We replaced a small highlight-only catalogue with complete captured ingredient sections, explicit release decisions and deterministic label filters.

## Verification and limits
The domain suite covers 240 profile/restriction combinations, missing or malformed measurements, source invariants and concurrent allowance reservations. Browser checks cover desktop and mobile, AM/PM switching, answer editing, consent, invalid uploads and terminal-error recovery. These checks verify software behavior, not clinical effectiveness.

The portrait is an AI-generated fictional adult. The free example's scores are authored fixtures and explicitly labelled. Live analysis is separate. Formulations can change and differ by country; the current local package and individual tolerance still need checking.

## What's next
Curate additional market-specific formulations, seek independent review of the guidance boundaries and run consent-based usability studies. Keep uncertainty visible rather than adding unsupported treatments.

Live app: https://skin-ai-daily-edit.vercel.app
Code and setup instructions: https://github.com/haleeozz/skin-ai-daily-edit

## Final delivery checks

- Public video URL: https://www.youtube.com/watch?v=K7wqBQ6sKkY
- Final rule and eligibility agreement: confirmed by owner.
- Video: submission/video/skin-ai-demo.mp4, 109 seconds, ElevenLabs Megan narration and speech-synchronized captions.
- Four screenshot files: submission/screenshots/.
- Hosted real-task verification: one submission, six observations, six decoded maps; ingredient editing used no additional task.
- Official custom answers completed and submitted.

