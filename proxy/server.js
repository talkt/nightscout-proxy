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

  const event = {
    timestamp: req.body.timestamp || new Date().toISOString(),
    glucoseMgDl: req.body.glucoseMgDl,
    source: req.body.source || "mock"
  };

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
    status: "ok"
  });

});

app.get("/api/v1/entries.json", (req, res) => {

  const formatted = glucoseEvents.map(event => ({
    sgv: event.glucoseMgDl,
    dateString: event.timestamp,
    direction: event.direction || "Flat"
  }));

  res.json(formatted);

});

app.post("/api/v1/entries", (req, res) => {

  const body = req.body;

  const event = {
    timestamp: body.dateString || new Date().toISOString(),
    glucoseMgDl: body.sgv,
    direction: body.direction || "Flat",
    source: "nightscout"
  };

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
