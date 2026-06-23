
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
