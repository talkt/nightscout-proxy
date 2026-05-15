const express = require("express");

const app = express();

app.use(express.json({ limit: "2mb" }));

/*
========================================
NORMALIZE DOUBLE SLASHES
========================================
*/

app.use((req, res, next) => {
  req.url = req.url.replace(/^\/+/, "/");
  next();
});

/*
========================================
LOG REQUESTS
========================================
*/

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
MOCK ENDPOINTS
========================================
*/

app.post("/glucose", (req, res) => {
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
NIGHTSCOUT GET ENDPOINTS
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

/*
========================================
UPLOAD HANDLER
========================================
*/

async function handleNightscoutUpload(req, res) {
  try {
    console.log("UPLOAD HIT:", req.method, req.url);
    console.log("UPLOAD BODY:", JSON.stringify(req.body));

    const rawItems = Array.isArray(req.body) ? req.body : [req.body];

    const events = rawItems.map((item) =>
      normalizeToInternalEvent(item, "juggluco")
    );

    glucoseEvents.unshift(...events);
    glucoseEvents = glucoseEvents.slice(0, 100);

    const nightscoutEntries = events.map(toNightscoutEntry);

    console.log("NORMALIZED EVENTS:", JSON.stringify(events));
    console.log("FORWARDING TO NIGHTSCOUT:", JSON.stringify(nightscoutEntries));

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
      body: JSON.stringify(nightscoutEntries)
    });

    const text = await response.text();

    console.log("NIGHTSCOUT RESPONSE:", response.status, text);

    res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      nightscoutStatus: response.status,
      received: events,
      forwarded: nightscoutEntries,
      nightscoutResponse: text
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

/*
========================================
POST ROUTES
========================================
*/

app.post("/api/v1/entries", handleNightscoutUpload);
app.post("/api/v1/entries/", handleNightscoutUpload);
app.post("/api/v1/entries.json", handleNightscoutUpload);
app.post("/api/v1/entries.json/", handleNightscoutUpload);
app.post("/api/v1/entries/sgv.json", handleNightscoutUpload);
app.post("/api/v3/entries", handleNightscoutUpload);
app.post("/api/v3/entries/", handleNightscoutUpload);

/*
========================================
UNMATCHED ROUTES
========================================
*/

app.use((req, res) => {
  console.log("UNMATCHED:", req.method, req.url);

  res.status(404).json({
    ok: false,
    error: "Route not found",
    method: req.method,
    url: req.url
  });
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
