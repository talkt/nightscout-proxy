const express = require("express");

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

let glucoseEvents = [];

/*
========================================
HELPERS
========================================
*/

function normalizeToInternalEvent(body, source) {
  const timestamp =
    body.dateString ||
    body.timestamp ||
    (body.date ? new Date(body.date).toISOString() : new Date().toISOString());

  const glucoseMgDl =
    body.glucoseMgDl ||
    body.sgv ||
    body.glucose ||
    body.value;

  return {
    timestamp,
    glucoseMgDl,
    direction: body.direction || "Flat",
    source: source || body.source || "unknown"
  };
}

function toNightscoutEntry(event) {
  return {
    type: "sgv",
    sgv: event.glucoseMgDl,
    date: new Date(event.timestamp).getTime(),
    dateString: event.timestamp,
    direction: event.direction || "Flat",
    device: event.source || "clickeat-proxy"
  };
}

/*
========================================
ROOT
========================================
*/

app.get("/", (req, res) => {
  res.send("Proxy is alive");
});

/*
========================================
ORIGINAL MOCK ENDPOINTS
========================================
*/

app.post("/glucose", async (req, res) => {
  const event = normalizeToInternalEvent(req.body, req.body.source || "mock");

  glucoseEvents.unshift(event);
  glucoseEvents = glucoseEvents.slice(0, 100);

  console.log("Received glucose:", event);

  res.json({
    ok: true,
    received: event
  });
});

app.get("/glucose", (req, res) => {
  res.json(glucoseEvents);
});

/*
========================================
NIGHTSCOUT COMPATIBILITY
========================================
*/

app.get("/api/v1/status.json", (req, res) => {
  res.json({
    status: "ok",
    name: "clickeat-mini-nightscout",
    version: "1.0.0"
  });
});

app.get("/api/v1/entries", (req, res) => {
  const formatted = glucoseEvents.map(toNightscoutEntry);
  res.json(formatted);
});

app.get("/api/v1/entries.json", (req, res) => {
  const formatted = glucoseEvents.map(toNightscoutEntry);
  res.json(formatted);
});

app.get("/api/v1/entries/sgv.json", (req, res) => {
  const formatted = glucoseEvents.map(toNightscoutEntry);
  res.json(formatted);
});

app.post("/api/v1/entries", async (req, res) => {
  try {
    const body = Array.isArray(req.body) ? req.body[0] : req.body;
    const event = normalizeToInternalEvent(body, "juggluco");

    glucoseEvents.unshift(event);
    glucoseEvents = glucoseEvents.slice(0, 100);

    const nightscoutEntry = toNightscoutEntry(event);

    console.log("Juggluco entry:", event);
    console.log("Forwarding to Nightscout:", nightscoutEntry);

    const nsUrl = process.env.NIGHTSCOUT_URL;
    const apiSecretHash = process.env.API_SECRET_HASH;

    if (!nsUrl) {
      throw new Error("Missing NIGHTSCOUT_URL env variable");
    }

    if (!apiSecretHash) {
      throw new Error("Missing API_SECRET_HASH env variable");
    }

    const response = await fetch(`${nsUrl}/api/v1/entries.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-secret": apiSecretHash
      },
      body: JSON.stringify([nightscoutEntry])
    });

    const text = await response.text();

    console.log("Nightscout response:", response.status, text);

    res.json({
      ok: response.ok,
      nightscoutStatus: response.status,
      received: event,
      forwarded: nightscoutEntry,
      response: text
    });
  } catch (err) {
    console.error("Upload error:", err);

    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/*
========================================
START SERVER
========================================
*/

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("Proxy running on port", port);
});
