import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db_sqlite = new Database("alerts.db");
db_sqlite.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    email TEXT,
    threshold REAL,
    direction TEXT,
    lastSentAt INTEGER
  )
`);

interface Alert {
  id: string;
  email: string;
  threshold: number;
  direction: 'above' | 'below';
  lastSentAt: number;
}

const THROTTLE_MS = 1800000; // 30 minutes
let lastCheckedAt: number | null = null;
let lastRate: number | null = null;
let lastFetchError: string | null = null;
let lastHeartbeat: number = Date.now();

async function fetchRate() {
  try {
    const response = await fetch('https://www.google.com/finance/quote/AUD-INR', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const html = await response.text();
    
    // Try multiple selectors as Google Finance changes often
    const match = 
      html.match(/data-last-price="([0-9.]+)"/) || 
      html.match(/class="YMlKec fxKbKc">([0-9.]+)</) ||
      html.match(/\["AUD",\s*"INR",\s*([0-9.]+)/);
      
    if (!match || !match[1]) {
      // Log a snippet of HTML for debugging if parsing fails
      console.error("Parsing failed. HTML snippet:", html.substring(0, 500));
      throw new Error('Could not parse rate from HTML');
    }
    
    const rate = parseFloat(match[1]);
    lastRate = rate;
    lastFetchError = null;
    return rate;
  } catch (error: any) {
    lastFetchError = error.message;
    console.error("Background fetch error:", error);
    return null;
  }
}

async function sendEmail(alert: Alert, currentRate: number) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured for background alert");
    return;
  }
  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from: "Aussie-India Hub <onboarding@resend.dev>",
      to: [alert.email],
      subject: "Currency Alert Triggered!",
      html: `
        <h2>Currency Alert Triggered!</h2>
        <p>The AUD to INR rate has crossed your target.</p>
        <p><strong>Condition:</strong> Goes ${alert.direction} ${alert.threshold} INR</p>
        <p><strong>Current Rate:</strong> ${currentRate} INR</p>
        <br/>
        <p>Sent from Aussie-India Hub (Background Monitor)</p>
      `,
    });
    console.log(`Alert sent to ${alert.email} for rate ${currentRate}`);
  } catch (err) {
    console.error("Error sending background email:", err);
  }
}

async function checkAlerts() {
  const rate = await fetchRate();
  lastCheckedAt = Date.now();
  if (rate === null) return;

  const now = Date.now();
  const alerts = db_sqlite.prepare("SELECT * FROM alerts").all() as Alert[];

  for (const alert of alerts) {
    if (now - alert.lastSentAt < THROTTLE_MS) continue;

    let triggered = false;
    if (alert.direction === 'above' && rate >= alert.threshold) triggered = true;
    if (alert.direction === 'below' && rate <= alert.threshold) triggered = true;

    if (triggered) {
      db_sqlite.prepare("UPDATE alerts SET lastSentAt = ? WHERE id = ?").run(now, alert.id);
      await sendEmail(alert, rate);
    }
  }
}

// Check every 1 minute in background
setInterval(checkAlerts, 60000);

// Heartbeat every 30 seconds to show server is alive
setInterval(() => {
  lastHeartbeat = Date.now();
  console.log(`[Heartbeat] Server is active: ${new Date(lastHeartbeat).toISOString()}`);
}, 30000);

// Run initial check immediately
checkAlerts();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.get("/api/health", (req, res) => {
    const count = db_sqlite.prepare("SELECT COUNT(*) as count FROM alerts").get() as { count: number };
    res.json({ 
      status: "ok", 
      activeAlerts: count.count,
      lastCheckedAt: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null,
      lastHeartbeat: new Date(lastHeartbeat).toISOString(),
      lastRate,
      lastFetchError,
      resendConfigured: !!process.env.RESEND_API_KEY
    });
  });

  app.get("/api/live-rate", async (req, res) => {
    const rate = await fetchRate();
    if (rate === null) return res.status(500).json({ error: "Failed to fetch rate" });
    res.json({ rate, timestamp: Math.floor(Date.now() / 1000) });
  });

  app.get("/api/alerts", (req, res) => {
    const alerts = db_sqlite.prepare("SELECT * FROM alerts").all();
    res.json(alerts);
  });

  app.post("/api/alerts", (req, res) => {
    const { email, threshold, direction } = req.body;
    if (!email || !threshold || !direction) return res.status(400).json({ error: "Missing fields" });
    
    const id = Math.random().toString(36).substr(2, 9);
    const thresholdVal = parseFloat(threshold);
    db_sqlite.prepare("INSERT INTO alerts (id, email, threshold, direction, lastSentAt) VALUES (?, ?, ?, ?, ?)")
      .run(id, email, thresholdVal, direction, 0);
    
    res.json({ id, email, threshold: thresholdVal, direction, lastSentAt: 0 });
  });

  app.delete("/api/alerts/:id", (req, res) => {
    db_sqlite.prepare("DELETE FROM alerts WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.put("/api/alerts/:id", (req, res) => {
    const { email, threshold, direction } = req.body;
    if (!email || !threshold || !direction) return res.status(400).json({ error: "Missing fields" });
    
    const thresholdVal = parseFloat(threshold);
    db_sqlite.prepare("UPDATE alerts SET email = ?, threshold = ?, direction = ? WHERE id = ?")
      .run(email, thresholdVal, direction, req.params.id);
    
    res.json({ id: req.params.id, email, threshold: thresholdVal, direction });
  });

  app.post("/api/send-alert-email", async (req, res) => {
    // Keep this for manual testing/immediate triggers if needed
    const { email, rate, threshold, direction } = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });
    const resend = new Resend(apiKey);
    try {
      const { data, error } = await resend.emails.send({
        from: "Aussie-India Hub <onboarding@resend.dev>",
        to: [email],
        subject: "Currency Alert Triggered!",
        html: `<h2>Currency Alert Triggered!</h2><p>Rate: ${rate}</p>`,
      });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 404 handler - must be before Vite middleware
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
