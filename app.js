const STADIUM = {
  name: "Memorial Stadium",
  lat: 34.678585,
  lng: -82.843857,
};

const API_URL = "https://cloud.weatherstem.com/rpc";
const WEATHER_URL =
  "https://cdn.weatherstem.com/dashboard/data/dynamic/model/pickens/clemson/latest.json";
const WBGT_HISTORY_KEY = "clemsonLightningWbgtHistory";
const REFRESH_MS = 60_000;
const PRIVATE_PROXY_URL = "https://cu-thunder-proxy.jennifp.workers.dev";
const TIME_WINDOW_SECONDS = "1800";
const STUDY_RADIUS_MILES = "60";
const SIMULATION_MODE = false;

const els = {
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  signal: document.querySelector("#stadiumSignal"),
  signalLabel: document.querySelector("#signalLabel"),
  closestDistance: document.querySelector("#closestDistance"),
  closestWindow: document.querySelector("#closestWindow"),
  trendValue: document.querySelector("#trendValue"),
  trendDetail: document.querySelector("#trendDetail"),
  alertLevel: document.querySelector("#alertLevel"),
  alertDetail: document.querySelector("#alertDetail"),
  wbgtValue: document.querySelector("#wbgtValue"),
  wbgtDetail: document.querySelector("#wbgtDetail"),
  wbgtTrend: document.querySelector("#wbgtTrend"),
  wbgtTrendDetail: document.querySelector("#wbgtTrendDetail"),
  lastUpdate: document.querySelector("#lastUpdate"),
  dataMode: document.querySelector("#dataMode"),
  strikeCount: document.querySelector("#strikeCount"),
  strikeList: document.querySelector("#strikeList"),
};

let refreshTimer;
let simulationTick = 0;

refresh();
refreshTimer = window.setInterval(refresh, REFRESH_MS);

async function refresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refresh, REFRESH_MS);

  try {
    const reading = SIMULATION_MODE ? makeSimulation() : await fetchWeatherStemReading();
    render(reading);
  } catch (error) {
    const wbgt = SIMULATION_MODE ? makeSimulation().wbgt : await fetchWbgt().catch(() => null);
    render({
      mode: "Offline",
      closestDistance: null,
      strikes: [],
      trend: null,
      wbgt,
      message:
        error.message || "WeatherStem did not return a reading. Try simulation mode.",
      updatedAt: new Date(),
    });
  }
}

async function fetchWeatherStemReading() {
  const proxyUrl = normalizeProxyUrl(PRIVATE_PROXY_URL);
  if (!proxyUrl) {
    throw new Error(
      "Private proxy URL is not configured yet. Add your Cloudflare Worker URL in app.js.",
    );
  }

  const time = TIME_WINDOW_SECONDS;
  const radius = STUDY_RADIUS_MILES;
  const [closest, study, wbgt] = await Promise.all([
    callWeatherStem({
      _method: "lightning.closest",
      time,
      distance_only: "true",
      lat: STADIUM.lat,
      lng: STADIUM.lng,
    }),
    callWeatherStem({
      _method: "lightning.study",
      time,
      radius,
      lat: STADIUM.lat,
      lng: STADIUM.lng,
    }).catch(() => null),
    fetchWbgt().catch(() => null),
  ]);

  const strikes = normalizeStrikes(study);
  return {
    mode: "Live",
    closestDistance: numberOrNull(closest?.distance),
    strikes,
    trend: calculateTrend(strikes),
    wbgt,
    updatedAt: new Date(),
  };
}

async function fetchWbgt() {
  const response = await fetch(WEATHER_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`WeatherStem WBGT returned ${response.status}`);
  }

  const payload = await response.json();
  const value = extractWbgt(payload);

  if (value === null) {
    return {
      value: null,
      trend: null,
      label: "WBGT unavailable",
      detail: "Latest feed did not include a WBGT field",
    };
  }

  const history = saveWbgtHistory(value);
  return {
    value,
    trend: calculateWbgtTrend(history),
    label: classifyWbgt(value),
    detail: "Clemson WeatherStem 60-second observation",
  };
}

function extractWbgt(payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const wbgtRecord = records.find((record) => {
    const label = `${record.sensor_name || ""} ${record.property || ""}`.toLowerCase();
    return label.includes("wbgt") || label.includes("wet bulb globe");
  });

  if (wbgtRecord) {
    const value = numberOrNull(wbgtRecord.value);
    if (value !== null) return value;
  }

  return extractFirstNumber(payload, [
    "wbgt",
    "wbgt_f",
    "wbgtF",
    "WBGT",
    "WBGT_F",
    "wet_bulb_globe_temperature",
    "wet_bulb_globe_temperature_f",
    "wet_bulb_globe_f",
    "wetBulbGlobeTemperature",
    "wetBulbGlobeTemperatureF",
    "heat_stress_wbgt",
    "athletic_wbgt",
  ]);
}

async function callWeatherStem(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => body.set(key, String(value)));
  const proxyUrl = normalizeProxyUrl(PRIVATE_PROXY_URL);

  if (proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Private proxy returned ${response.status}`);
    }

    return response.json();
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`WeatherStem returned ${response.status}`);
  }

  return response.json();
}

function normalizeProxyUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeStrikes(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.lightning)
        ? payload.lightning
        : Array.isArray(payload?.strikes)
          ? payload.strikes
          : [];

  return list
    .map((item, index) => {
      const lat = numberOrNull(
        item.lat ?? item.latitude ?? item.y ?? item.strike_latitude,
      );
      const lng = numberOrNull(
        item.lng ?? item.lon ?? item.longitude ?? item.x ?? item.strike_longitude,
      );
      const distance =
        numberOrNull(item.distance ?? item.distance_miles ?? item.miles) ??
        (lat !== null && lng !== null
          ? milesBetween(STADIUM.lat, STADIUM.lng, lat, lng)
          : null);
      const timestamp = parseStrikeTime(
        item.ts ?? item.time ?? item.timestamp ?? item.created_at ?? item.datetime,
        index,
      );

      return {
        distance,
        timestamp,
        bearing: lat !== null && lng !== null ? bearingTo(lat, lng) : null,
      };
    })
    .filter((strike) => strike.distance !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function calculateTrend(strikes) {
  if (strikes.length < 3) return null;

  const newest = strikes.at(-1).timestamp;
  const points = strikes.map((strike) => ({
    minutesAgo: (newest - strike.timestamp) / 60000,
    distance: strike.distance,
  }));

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.minutesAgo, 0);
  const sumY = points.reduce((sum, point) => sum + point.distance, 0);
  const sumXY = points.reduce(
    (sum, point) => sum + point.minutesAgo * point.distance,
    0,
  );
  const sumXX = points.reduce(
    (sum, point) => sum + point.minutesAgo * point.minutesAgo,
    0,
  );
  const denominator = n * sumXX - sumX * sumX;
  if (!denominator) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const milesPerMinuteTowardStadium = slope;
  return {
    speed: milesPerMinuteTowardStadium,
    label:
      milesPerMinuteTowardStadium > 0.4
        ? "Rapidly approaching"
        : milesPerMinuteTowardStadium > 0.12
          ? "Approaching"
          : milesPerMinuteTowardStadium < -0.15
            ? "Moving away"
            : "Mostly steady",
  };
}

function render(reading) {
  const closest = reading.closestDistance;
  const trend = reading.trend;
  const alert =
    reading.mode === "Offline" && closest === null
      ? {
          label: "Setup needed",
          signal: "Standby",
          className: "standby",
          title: "Live lightning data is not connected yet.",
          detail: "Paste a token or use simulation mode",
          message: reading.message,
        }
      : classifyAlert(closest, trend);

  els.closestDistance.textContent =
    closest === null ? "--" : `${closest.toFixed(1)} mi`;
  els.closestWindow.textContent = `within ${Number(TIME_WINDOW_SECONDS) / 60} minutes`;
  els.trendValue.textContent = trend?.label || "Unknown";
  els.trendDetail.textContent = trend
    ? `${Math.abs(trend.speed).toFixed(2)} mi/min ${trend.speed >= 0 ? "toward" : "away"}`
    : "Needs strike locations and times";
  els.alertLevel.textContent = alert.label;
  els.alertDetail.textContent = alert.detail;
  els.wbgtValue.textContent =
    reading.wbgt?.value === null || reading.wbgt?.value === undefined
      ? "--"
      : `${reading.wbgt.value.toFixed(1)} F`;
  els.wbgtDetail.textContent = reading.wbgt?.label || "WBGT unavailable";
  els.wbgtTrend.textContent = reading.wbgt?.trend?.label || "Unknown";
  els.wbgtTrendDetail.textContent =
    reading.wbgt?.trend?.detail || "Needs two or more readings";
  els.lastUpdate.textContent = reading.updatedAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  els.dataMode.textContent = `${reading.mode} mode`;
  els.statusTitle.textContent = alert.title;
  els.statusText.textContent = reading.message || alert.message;
  els.signalLabel.textContent = alert.signal;
  els.signal.className = `stadium-signal ${alert.className}`;
  document.body.className = `state-${alert.className || "clear"}`;

  renderStrikes(reading.strikes || []);
}

function classifyAlert(distance, trend) {
  const approachingFast = trend?.label === "Rapidly approaching";

  if (distance !== null && distance <= 8) {
    return {
      label: "Danger",
      signal: "Stop",
      className: "danger",
      title: "Lightning is inside the stadium danger band.",
      detail: "Closest strike is 8 miles or less",
      message:
        "Simulated lights are in evacuation mode. Follow the venue lightning plan immediately.",
    };
  }

  if ((distance !== null && distance <= 15) || approachingFast) {
    return {
      label: "Warning",
      signal: "Warn",
      className: "warning",
      title: approachingFast
        ? "Lightning appears to be rapidly approaching Clemson."
        : "Lightning is close enough to prepare.",
      detail: "15 mile watch band or rapid approach",
      message:
        "Simulated lights are pulsing amber. Prepare staff notifications and watch for the next update.",
    };
  }

  if (distance !== null && distance <= 30) {
    return {
      label: "Watch",
      signal: "Watch",
      className: "watch",
      title: "Lightning is in the regional watch area.",
      detail: "Closest strike is within 30 miles",
      message:
        "Simulated lights are in watch mode. Conditions are worth monitoring closely.",
    };
  }

  return {
    label: "All clear",
    signal: "Clear",
    className: "clear",
    title: "No nearby lightning threat detected.",
    detail: "Outside local watch bands",
    message:
      "Simulated lights remain green. The dashboard will refresh every minute.",
  };
}

function renderStrikes(strikes) {
  els.strikeCount.textContent = strikes.length
    ? `${strikes.length} strikes in study radius`
    : "No strike list available";
  els.strikeList.innerHTML = "";

  if (!strikes.length) {
    const empty = document.createElement("div");
    empty.className = "strike-item";
    empty.innerHTML =
      "<strong>--</strong><span>WeatherStem did not provide strike history for this refresh.</span><span>--</span>";
    els.strikeList.append(empty);
    return;
  }

  strikes
    .slice(-6)
    .reverse()
    .forEach((strike) => {
      const item = document.createElement("div");
      item.className = "strike-item";
      item.innerHTML = `
        <strong>${strike.distance.toFixed(1)} mi</strong>
        <span>${strike.bearing || "bearing unknown"}</span>
        <span>${timeAgo(strike.timestamp)}</span>
      `;
      els.strikeList.append(item);
    });
}

function makeSimulation() {
  simulationTick += 1;
  const minutes = simulationTick % 18;
  const base = 42 - minutes * 2.4;
  const wobble = Math.sin(simulationTick * 1.7) * 4;
  const closestDistance = Math.max(4.5, base + wobble);
  const wbgtValue =
    82 + Math.min(simulationTick, 16) * 0.35 + Math.sin(simulationTick / 2) * 0.8;
  const wbgtHistory = saveWbgtHistory(wbgtValue);
  const now = Date.now();
  const strikes = Array.from({ length: 10 }, (_, index) => {
    const ageMinutes = 27 - index * 3;
    return {
      distance: closestDistance + ageMinutes * 0.55 + Math.sin(index) * 2,
      timestamp: now - ageMinutes * 60000,
      bearing: ["west", "southwest", "south", "southeast"][index % 4],
    };
  });

  return {
    mode: "Simulation",
    closestDistance,
    strikes,
    trend: calculateTrend(strikes),
    wbgt: {
      value: wbgtValue,
      trend: calculateWbgtTrend(wbgtHistory),
      label: classifyWbgt(wbgtValue),
      detail: "Simulated event heat stress",
    },
    updatedAt: new Date(),
  };
}

function saveWbgtHistory(value) {
  const now = Date.now();
  const savedHistory = JSON.parse(localStorage.getItem(WBGT_HISTORY_KEY) || "[]");
  const history = [...savedHistory, { value, timestamp: now }]
    .filter((point) => now - point.timestamp <= 90 * 60_000)
    .slice(-90);
  localStorage.setItem(WBGT_HISTORY_KEY, JSON.stringify(history));
  return history;
}

function calculateWbgtTrend(history) {
  if (!Array.isArray(history) || history.length < 2) return null;

  const first = history[0];
  const last = history.at(-1);
  const minutes = Math.max(1, (last.timestamp - first.timestamp) / 60000);
  const degreesPerHour = ((last.value - first.value) / minutes) * 60;
  const abs = Math.abs(degreesPerHour);

  if (abs < 0.75) {
    return {
      label: "Remaining steady",
      detail: `${degreesPerHour.toFixed(1)} F/hr`,
    };
  }

  const direction = degreesPerHour > 0 ? "upward" : "downward";
  const pace = abs >= 3 ? "rapidly" : "slowly";
  return {
    label: `${pace[0].toUpperCase()}${pace.slice(1)} ${direction}`,
    detail: `${degreesPerHour > 0 ? "+" : ""}${degreesPerHour.toFixed(1)} F/hr`,
  };
}

function classifyWbgt(value) {
  if (value >= 90) return "Extreme heat stress";
  if (value >= 87) return "High heat stress";
  if (value >= 82) return "Moderate heat stress";
  return "Lower heat stress";
}

function extractFirstNumber(value, keys) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstNumber(item, keys);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = numberOrNull(value[key]);
        if (found !== null) return found;
      }
    }

    for (const child of Object.values(value)) {
      if (child && typeof child === "object") {
        const found = extractFirstNumber(child, keys);
        if (found !== null) return found;
      }
    }
  }

  return null;
}

function numberOrNull(value) {
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseStrikeTime(value, fallbackIndex) {
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.now() - fallbackIndex * 60_000;
}

function milesBetween(lat1, lng1, lat2, lng2) {
  const radiusMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * radiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingTo(lat, lng) {
  const y = Math.sin(toRad(lng - STADIUM.lng)) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(STADIUM.lat)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(STADIUM.lat)) *
      Math.cos(toRad(lat)) *
      Math.cos(toRad(lng - STADIUM.lng));
  const degrees = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const labels = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  return labels[Math.round(degrees / 45) % 8];
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

function timeAgo(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}
