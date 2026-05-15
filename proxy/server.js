console.log("BOOT TEST CLICKEAT 123");
const express = require("express");

const app = express();

const PROXY_VERSION = "juggluco-forwarding-v2";

app.use(express.json({ limit: "2mb" }));

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
    sgv: Number(event.glucoseMgDl),
    date: new Date(event.timestamp).getTime(),
    dateString: event.timestamp,
    direction: event.direction || "Flat",
    device: event.source || "juggluco"
  };
}

async function forwardToNightscout(entries) {
  const nsUrl = process.env.NIGHTSCOUT_URL;
  const apiSecretHash = process.env.API_SECRET_HASH;

  if (!nsUrl) {
    throw new Error("Missing NIGHTSCOUT_URL");
  }

  if (!apiSecretHash) {
    throw new Error("Missing API_SECRET_HASH");
  }

  const cleanNsUrl = nsUrl.replace(/\/+$/, "");
  const targetUrl = `${cleanNsUrl}/api/v1/entries.json`;

  console.log("FORWARD TARGET:", targetUrl);
  console.log("FORWARD BODY:", JSON.stringify(entries));

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-secret": apiSecretHash
    },
    body: JSON.stringify(entries)
  });

  const text = await response.text();

  console.log("NIGHTSCOUT RESPONSE STATUS:", response.status);
  console.log("NIGHTSCOUT RESPONSE BODY:", text);

  return {
    ok: response.ok,
    status: response.status,
    body: text
  };
}

/*
========================================
ROOT / STATUS
========================================
*/

app.get("/", (req, res) => {
  res.send(`Proxy is alive - ${PROXY_VERSION}`);
});

app.get("/debug/version", (req, res) => {
  res.json({
    ok: true,
    version: PROXY_VERSION
  });
});

app.get("/api/v1/status.json", (req, res) => {
  res.json({
    status: "ok",
    name: "clickeat-mini-nightscout",
    version: PROXY_VERSION
  });
});

/*
========================================
LOCAL READ
========================================
*/

app.get("/glucose", (req, res) => {
  res.json(glucoseEvents);
});

app.get(/^\/+api\/v1\/entries(?:\.json)?\/?$/, (req, res) => {
  res.json(glucoseEvents.map(toNightscoutEntry));
});

app.get(/^\/+api\/v1\/entries\/sgv\.json\/?$/, (req, res) => {
  res.json(glucoseEvents.map(toNightscoutEntry));
});

/*
========================================
UPLOAD HANDLER
========================================
*/

async function handleUpload(req, res) {
  try {
    console.log("UPLOAD HIT:", req.method, req.url);
    console.log("UPLOAD BODY:", JSON.stringify(req.body));

    const rawItems = Array.isArray(req.body) ? req.body : [req.body];

    const events = rawItems
      .map((item) => normalizeToInternalEvent(item, "juggluco"))
      .filter((event) => event.glucoseMgDl !== undefined && event.glucoseMgDl !== null);

    glucoseEvents.unshift(...events);
    glucoseEvents = glucoseEvents.slice(0, 100);

    const entries = events.map(toNightscoutEntry);

    const forwardResult = await forwardToNightscout(entries);

    res.status(forwardResult.ok ? 200 : 502).json({
      ok: forwardResult.ok,
      version: PROXY_VERSION,
      received: events,
      forwarded: entries,
      nightscout: forwardResult
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    res.status(500).json({
      ok: false,
      version: PROXY_VERSION,
      error: err.message
    });
  }
}

/*
========================================
UPLOAD ROUTES
========================================
*/

app.post(/^\/+api\/v1\/entries(?:\.json)?\/?$/, handleUpload);
app.post(/^\/+api\/v1\/entries\/sgv\.json\/?$/, handleUpload);
app.post(/^\/+api\/v3\/entries\/?$/, handleUpload);

app.post("/glucose", handleUpload);

/*
========================================
UNMATCHED
========================================
*/

app.use((req, res) => {
  console.log("UNMATCHED:", req.method, req.url);

  res.status(404).json({
    ok: false,
    version: PROXY_VERSION,
    error: "Route not found",
    method: req.method,
    url: req.url
  });
});

/*
========================================
START
========================================
*/

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Proxy running on port ${port} - ${PROXY_VERSION}`);
});
