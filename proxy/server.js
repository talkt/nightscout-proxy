const express = require("express");

const app = express();
app.use(express.json());

let glucoseEvents = [];

app.get("/", (req, res) => {
  res.send("Proxy is alive");
});

app.post("/glucose", (req, res) => {
  const event = {
    timestamp: req.body.timestamp || new Date().toISOString(),
    glucoseMgDl: req.body.glucoseMgDl,
    source: req.body.source || "mock"
  };

  glucoseEvents.unshift(event);
  glucoseEvents = glucoseEvents.slice(0, 100);

  console.log("Received glucose:", event);

  res.json({ ok: true, received: event });
});

app.get("/glucose", (req, res) => {
  res.json(glucoseEvents);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Proxy running"));
