# Submission assets

- Live app: https://skin-ai-daily-edit.vercel.app
- Code: https://github.com/haleeozz/skin-ai-daily-edit
- Devpost draft: https://devpost.com/software/skin-ai-your-daily-edit
- Project has not been finally entered into the hackathon yet.

## Video

The locally rendered `video/skin-ai-demo.mp4` is approximately 129 seconds, 1920×1080, with English narration and captions. Binary video files are excluded from Git. The final revised video is public at https://www.youtube.com/watch?v=K7wqBQ6sKkY.

The footage records one actual YouCam task using a fictional AI-generated adult portrait. Processing wait is shortened and labelled. Third-party product names are hidden in the recording; actual label records and filters are unchanged. Source provenance remains visible. This is an integration demonstration, not clinical validation.

Narration uses the installed Microsoft Zira English voice, without paid voice services or music. `demo-script.json` contains the exact script. The recording and rendering helpers are optional Windows authoring tools, not runtime dependencies.

Suggested upload title: **Skin AI — Your Daily Edit | YouCam Hackathon Demo**

Suggested upload description:

> Skin AI combines YouCam cosmetic photo observations with user answers and traceable manufacturer-label filters for an explained basic routine. One actual task, six observations and visual maps. Fictional AI-generated adult portrait; no clinical accuracy or efficacy claim. Product names are omitted in the video. Processing wait is shortened.
>
> Try: https://skin-ai-daily-edit.vercel.app
>
> Code and sources: https://github.com/haleeozz/skin-ai-daily-edit

## Screenshots

1. `screenshots/01-home.png`: Home and fictional portrait.
2. `screenshots/02-live-routine.png`: Real task observations and routine.
3. `screenshots/03-label-evidence.png`: Captured label, ingredients and guidance sources.
4. `screenshots/04-filtered-evening.png`: Ingredient-filtered two-step evening routine.

These screenshot captures inherit the recording-only product-name redaction. Full names remain available in the running application and released catalogue.

## Verification

`live-verification.json` contains sanitized integration evidence without provider task identifiers, session cookies, credentials or signed image URLs. Unit and scenario checks validate software behavior, not clinical outcomes.

## Revised narration and subtitles

The latest local revision is `video/skin-ai-demo-megan.mp4`: approximately 1 minute 49 seconds, 1920×1080, with one ElevenLabs Megan narration. The earlier `skin-ai-demo.mp4` remains preserved.

The revision uses short spoken subtitles instead of the earlier static caption band, a restrained frame, chapter labels and a closing card. Word times were extracted locally and matched to the exact approved script; no paid transcription or new YouCam task was used. The generated voice cost 1,719 ElevenLabs credits.

The owner published this revised video: https://www.youtube.com/watch?v=K7wqBQ6sKkY. Hackathon submission is being finalized. Windows editing helpers: `align-demo-audio.py`, `prepare-megan-edit.py`, and `render-megan-demo.mjs`. Their binary audio, model cache and fonts stay in ignored local folders.
