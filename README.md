Clemson Lightning Dashboard
A static dashboard for Clemson Memorial Stadium that checks WeatherStem Cloud lightning data and simulates a weather-controlled stadium light system.
What it shows
Closest lightning strike to the stadium in the selected time window.
Whether nearby lightning appears to be approaching, based on strike history when available.
A simulated stadium-light status shown in the circular indicator and the fading page border.
A color legend: green means good to go, yellow means watch, orange means warning, and red means stop/clear.
WBGT with a trend label: rapidly upward, slowly upward, remaining steady, slowly downward, or rapidly downward.
A simulation mode for demos, rehearsals, or when the API cannot be reached from the browser.
Run locally
Open index.html in a browser. No build step is required.
For quick local testing, paste the WeatherStem token into the settings panel. It is saved only in that browser's local storage and is not stored in the source files.
Publish with GitHub Pages
Create a new GitHub repository.
Upload these files to the repository root, or put them in a docs folder.
In the repository settings, enable GitHub Pages for that branch and folder.
Open the published page.
The WeatherStem endpoint currently allows browser requests, so GitHub Pages can call it directly.
Keeping the token hidden
GitHub Pages is a static host, so it cannot truly hide a private API token. Anything placed in the dashboard files or entered directly into the browser can be inspected.
For a public event dashboard, use the proxy files in:
outputs/lightning-dashboard-proxy
The safer deployment is:
Keep this dashboard on GitHub Pages.
Add the provided Cloudflare Worker proxy.
Store the WeatherStem token as a server-side secret in that proxy.
Paste the Worker URL into Private proxy URL in the dashboard.
Leave WeatherStem token for local testing blank.
In proxy mode, the public dashboard calls the Worker URL and never sees the WeatherStem token.
Stadium location
The dashboard is centered on Clemson Memorial Stadium:
Latitude: 34.678585
Longitude: -82.843857
Safety bands
These can be adjusted in app.js.
Danger: closest strike is 8 miles or less.
Warning: closest strike is 15 miles or less, or lightning is rapidly approaching.
Watch: closest strike is 30 miles or less.
Clear: outside those bands.
WBGT trend
The dashboard reads the Clemson WeatherStem 60-second latest-observation feed and uses the Wet Bulb Globe Temperature record. Trend is calculated from recent readings saved in the browser, so the label becomes more useful after the page has been open through multiple refreshes.
