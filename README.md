# Clemson Lightning Dashboard

A static dashboard for Clemson Memorial Stadium that checks WeatherStem Cloud lightning data and simulates a weather-controlled stadium light system.

## What it shows

- Closest lightning strike to the stadium in the selected time window.
- Whether nearby lightning appears to be approaching, based on strike history when available.
- A simulated stadium-light status: green, watch, warning, or danger.
- A simulation mode for demos, rehearsals, or when the API cannot be reached from the browser.

## Run locally

Open `index.html` in a browser. No build step is required.

Paste the WeatherStem token into the settings panel. It is saved only in that browser's local storage and is not stored in the source files.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload these files to the repository root, or put them in a `docs` folder.
3. In the repository settings, enable GitHub Pages for that branch and folder.
4. Open the published page and paste the WeatherStem token in the dashboard settings.

The WeatherStem endpoint currently allows browser requests, so GitHub Pages can call it directly.

## Important token note

GitHub Pages is a static host, so it cannot truly hide a private API token. This dashboard avoids committing the token, but anyone using the page will still send the token from their browser if they use live mode.

For a public event dashboard, the safer deployment is:

- Keep this dashboard on GitHub Pages.
- Add a small serverless proxy on Cloudflare Workers, Netlify Functions, Vercel, or another backend.
- Store the WeatherStem token as a server-side secret in that proxy.
- Have the dashboard call the proxy instead of `https://cloud.weatherstem.com/rpc`.

## Stadium location

The dashboard is centered on Clemson Memorial Stadium:

- Latitude: `34.678585`
- Longitude: `-82.843857`

## Safety bands

These can be adjusted in `app.js`.

- Danger: closest strike is 8 miles or less.
- Warning: closest strike is 15 miles or less, or lightning is rapidly approaching.
- Watch: closest strike is 30 miles or less.
- Clear: outside those bands.
