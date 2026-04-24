# Smart Spatial Mapper

Smart Spatial Mapper is a campus-scale image-to-location mapper. It lets a team upload a campus image, bind multiple real-world anchor points, and then project a live GPS position back onto that image in realtime.

## What changed in this version

- Replaced the old inverse-distance anchor averaging with a fitted map calibration model.
- Two anchors use a similarity transform, three or more anchors use an affine least-squares fit.
- Live position is no longer trapped inside the triangle formed by three anchors.
- Anchor binding now uses recent high-quality GPS samples instead of a single reading.
- Added calibration quality feedback, residual error display, and clearer permission guidance.
- Reworked the interface for both desktop and mobile usage.
- Added a basic installable web-app manifest.

## Key product notes

- A normal web page cannot silently force permanent GPS permission for every user. Browsers keep that decision at the site-permission level.
- This app now keeps high-accuracy tracking active and clearly tells users to set the site to `Allow` in the browser if they want persistent location access.
- For best results, use 4 to 6 anchors spread across the campus image instead of stopping at 3.

## Local development

The project uses Vite + React.

```bash
/Users/fengbowen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/npm install
/Users/fengbowen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/npm run build
```

## Deployment variants

The app supports two repo-ready variants through environment variables:

- `VITE_APP_VARIANT=desktop`
- `VITE_APP_VARIANT=mobile`

And a configurable base path for GitHub Pages:

- `VITE_BASE_PATH=/smp_v2/`
- `VITE_BASE_PATH=/smp_v2_mobile/`

## Suggested calibration workflow

1. Upload the campus image.
2. Add 4 or more anchors at visually distinct locations.
3. For each anchor, place the image point first and then stand at the real-world location.
4. Wait a few seconds so the app collects several accurate GPS samples.
5. Bind the averaged GPS result.
6. Check residual error and rebind any obviously weak anchor.
