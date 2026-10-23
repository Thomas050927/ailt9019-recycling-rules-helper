# Campus Waste Guide PWA

An installable, mobile-friendly web app for searching official campus waste-disposal PDFs and showing source-file plus PDF-page citations.

## Run locally

Because service workers and PWA installation require HTTPS or localhost, serve this folder with any static web server. For example, with Python installed:

```bash
cd app
python -m http.server 8000
```

Then open http://localhost:8000.

## Use

1. Download the current policies from your university's official EHS, facilities, or sustainability website.
2. Open the app and add one or more PDF files.
3. Enter a waste item or policy term, such as `battery`, `electronic waste`, or `chemical waste`.
4. Open the cited policy PDF yourself and verify the complete instructions, date, and context.

PDF text extraction and search happen in the browser. This app does not upload selected files to a server. The PDF.js library is loaded from a CDN, so first-time PDF processing needs an internet connection.

## Important current limitations

- No university has been named yet, so no university-specific policy corpus is included.
- Search is keyword matching over selectable PDF text, not semantic/AI search.
- Scanned PDFs that contain only page images may return little or no text; OCR is not implemented.
- Citations identify the uploaded filename and PDF page number. The app does not independently verify the publisher or policy effective date.
- Campus collection locations, opening hours, and emergency contacts are not configured.
- Do not use this prototype as the sole authority for hazardous-waste or emergency decisions.

## Deploy as a PWA

Publish the contents of this `app/` folder on a static host with HTTPS (for example, GitHub Pages, Netlify, or Cloudflare Pages). The manifest and service worker are included. Confirm the deployed URL and test installation on the target browsers before public launch.
