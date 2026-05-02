import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db_sqlite: any;

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
let lastSource: string = "None";
let lastHeartbeat: number = Date.now();

async function fetchRate() {
  try {
    const response = await fetch('https://www.google.com/finance/quote/AUD-INR?hl=en', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const html = await response.text();
    
    // Improved regex patterns for Google Finance
    const match = 
      html.match(/data-last-price="([0-9.]+)"/) || 
      html.match(/class="YMlKec fxKbKc">([0-9.]+)</) ||
      html.match(/\["AUD",\s*"INR",\s*([0-9.]+)/) ||
      html.match(/\["INR",\s*([0-9.]+)/) || 
      html.match(/metadata[^>]+content="([0-9.]+)"[^>]+itemprop="price"/) ||
      html.match(/itemprop="price"\s+content="([0-9.]+)"/) ||
      html.match(/currency="INR"[^>]+data-last-price="([0-9.]+)"/) ||
      html.match(/["']INR["']\s*,\s*([0-9.]+)/) ||
      html.match(/INR\s*\|\s*([0-9.,]+)/) ||
      html.match(/AUD\/INR\s*\|\s*([0-9.,]+)/);
      
    if (!match || !match[1]) {
      // Last ditch effort: look for a number near INR in the text
      const fallbackMatch = 
        html.match(/INR\s*<\/div><div[^>]*>([0-9.,]+)/) || 
        html.match(/>([0-9.,]+)<\/div><div[^>]*>INR/) ||
        html.match(/data-value="([0-9.]+)"[^>]*data-currency-code="INR"/);

      if (fallbackMatch && fallbackMatch[1]) {
        const rate = parseFloat(fallbackMatch[1].replace(/,/g, ''));
        if (!isNaN(rate) && rate > 40 && rate < 100) { 
          lastRate = rate;
          lastFetchError = null;
          return rate;
        }
      }

      // Log only if it's a critical parsing issue and suppress snippet if known flakiness
      return null;
    }
    
    const rateString = match[1].replace(/,/g, '');
    const rate = parseFloat(rateString);
    
    if (isNaN(rate)) return null;
    
    lastRate = rate;
    lastFetchError = null;
    lastSource = "Google Finance";
    return rate;
  } catch (error: any) {
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

async function getRate() {
  let rate = await fetchRate();
  
  if (rate === null) {
    console.log("Primary source (Google Finance) failed, trying secondary (ExchangeRate-API)...");
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/AUD');
      if (res.ok) {
        const data = await res.json();
        rate = data.rates.INR;
        lastRate = rate;
        lastFetchError = null;
        lastSource = "ExchangeRate-API (Secondary)";
        console.log("Secondary rate obtained:", rate);
        return rate;
      }
    } catch (err) {
      console.error("Secondary API failed:", err);
    }

    console.log("Secondary failed, trying tertiary (Frankfurter)...");
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=AUD&to=INR');
      if (res.ok) {
        const data = await res.json();
        rate = data.rates.INR;
        lastRate = rate;
        lastFetchError = null;
        lastSource = "Frankfurter (Tertiary)";
        console.log("Tertiary rate obtained:", rate);
        return rate;
      }
    } catch (err) {
      console.error("Tertiary API failed:", err);
    }

    lastFetchError = "All rate sources failed";
    lastSource = "None (Error)";
  }
  
  return rate;
}

async function checkAlerts() {
  const rate = await getRate();
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

async function startServer() {
  try {
    db_sqlite = new Database("alerts.db");
    db_sqlite.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        email TEXT,
        threshold REAL,
        direction TEXT,
        lastSentAt INTEGER
      )
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize database:", err);
    // Continue anyway, but API routes will fail
  }

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
      lastSource,
      lastFetchError,
      resendConfigured: !!process.env.RESEND_API_KEY
    });
  });

  app.get("/api/live-rate", async (req, res) => {
    const rate = await getRate();
    if (rate === null) return res.status(500).json({ error: "Failed to fetch rate from all sources" });
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
  app.all("/api/*", (req, res) => {
    console.log(`[API 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: `API route not found: ${req.method} ${req.originalUrl}`,
      availableRoutes: [
        "GET /api/health",
        "GET /api/live-rate",
        "GET /api/alerts",
        "POST /api/alerts",
        "DELETE /api/alerts/:id",
        "PUT /api/alerts/:id",
        "POST /api/send-alert-email"
      ]
    });
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
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Start background checks after server is listening
    console.log("Starting background alert monitor...");
    checkAlerts();
  });
}

startServer();
