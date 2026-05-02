const express = require("express");

const app = express();
app.use(express.json());

const NIGHTSCOUT_URL = process.env.NIGHTSCOUT_URL;
const API_SECRET_HASH = process.env.API_SECRET_HASH;

app.get("/", (req, res) => {
  res.send("Proxy is alive");
});

app.post("/api/v1/entries", async (req, res) => {
  try {
    const response = await fetch(`${NIGHTSCOUT_URL}/api/v1/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-SECRET": API_SECRET_HASH,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy error");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Proxy running"));
