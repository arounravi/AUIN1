import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/live-rate", async (req, res) => {
    try {
      const response = await fetch('https://www.google.com/finance/quote/AUD-INR');
      if (!response.ok) {
        throw new Error('Failed to fetch from Google Finance');
      }
      const html = await response.text();
      
      // Google Finance typically stores the price in a div with class "YMlKec fxKbKc" or data-last-price attribute
      const match = html.match(/data-last-price="([0-9.]+)"/) || html.match(/class="YMlKec fxKbKc">([0-9.]+)</);
      
      if (!match || !match[1]) {
        throw new Error('Could not parse rate from Google Finance');
      }
      
      const rate = parseFloat(match[1]);
      const timestamp = Math.floor(Date.now() / 1000);
      res.json({ rate, timestamp });
    } catch (error: any) {
      console.error("Error fetching live rate from Google Finance:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-alert-email", async (req, res) => {
    const { email, rate, threshold, direction } = req.body;

    if (!email || !rate || !threshold || !direction) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "RESEND_API_KEY is not configured on the server." });
    }

    const resend = new Resend(apiKey);

    try {
      const { data, error } = await resend.emails.send({
        from: "Aussie-India Hub <onboarding@resend.dev>", // Resend testing domain
        to: [email],
        subject: "Currency Alert Triggered!",
        html: `
          <h2>Currency Alert Triggered!</h2>
          <p>The AUD to INR rate has crossed your target.</p>
          <p><strong>Condition:</strong> Goes ${direction} ${threshold} INR</p>
          <p><strong>Current Rate:</strong> ${rate} INR</p>
          <br/>
          <p>Sent from Aussie-India Hub</p>
        `,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(400).json({ error: error.message || "Failed to send email via Resend" });
      }

      res.json({ success: true, data });
    } catch (err: any) {
      console.error("Server error sending email:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
