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

app.get("/api/v1/entries.json", (req, res) => {
  const formatted = glucoseEvents.map(toNightscoutEntry);
  res.json(formatted);
});

app.get("/api/v1/entries/sgv.json", (req, res) => {
  const formatted = glucoseEvents.map(toNightscoutEntry);
  res.json(formatted);
});

app.post("/api/v1/entries", (req, res) => {
  const body = Array.isArray(req.body) ? req.body[0] : req.body;
  const event = normalizeToInternalEvent(body, "nightscout");

  glucoseEvents.unshift(event);
  glucoseEvents = glucoseEvents.slice(0, 100);

  console.log("Nightscout entry:", event);

  res.json({
    status: "ok",
    received: event
  });
});

/*
========================================
START SERVER
========================================
*/

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("Proxy running");
});
