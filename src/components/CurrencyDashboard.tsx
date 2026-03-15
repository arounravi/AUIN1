import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, TrendingUp, RefreshCw, Bell, BellRing, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function CurrencyDashboard() {
  const [rate, setRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alert states
  const [alertInput, setAlertInput] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertDirection, setAlertDirection] = useState<'above' | 'below'>('above');
  const [activeAlert, setActiveAlert] = useState<{ threshold: number, direction: 'above' | 'below', email: string } | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [lastTriggeredRate, setLastTriggeredRate] = useState<number | null>(null);
  const lastAlertSentAt = React.useRef<number>(0);

  const fetchRate = async () => {
    // Only set loading on first fetch
    if (rate === null) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/live-rate');
      if (!res.ok) throw new Error('Failed to fetch live rates');
      const data = await res.json();
      setRate(data.rate);
      setLastUpdated(new Date(data.timestamp * 1000).toLocaleTimeString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, 5000); // Update every 5 seconds for live feed
    return () => clearInterval(interval);
  }, []);

  const triggerAlert = async (currentRate: number, alert: { threshold: number, direction: 'above' | 'below', email: string }) => {
    setShowNotification(true);
    setLastTriggeredRate(currentRate);
    // Removed setActiveAlert(null) so it keeps alerting

    if (alert.email) {
      try {
        const res = await fetch('/api/send-alert-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: alert.email,
            rate: currentRate,
            threshold: alert.threshold,
            direction: alert.direction
          })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to send email');
        }
      } catch (err: any) {
        console.error('Failed to send alert email:', err);
        window.alert(`Email Alert Failed: ${err.message}\n\nPlease check your RESEND_API_KEY in the Secrets panel and ensure you are sending to a verified email address if using Resend's free tier.`);
      }
    }
  };

  // Check alerts when rate updates
  useEffect(() => {
    if (rate !== null && activeAlert !== null) {
      const now = Date.now();
      // Throttle alerts to once every 30 minutes (1800000 ms) to avoid spamming
      if (now - lastAlertSentAt.current > 1800000) {
        if (activeAlert.direction === 'above' && rate >= activeAlert.threshold) {
          lastAlertSentAt.current = now;
          triggerAlert(rate, activeAlert);
        } else if (activeAlert.direction === 'below' && rate <= activeAlert.threshold) {
          lastAlertSentAt.current = now;
          triggerAlert(rate, activeAlert);
        }
      }
    }
  }, [rate, activeAlert]);

  const handleSetAlert = () => {
    const val = parseFloat(alertInput);
    if (!isNaN(val) && alertEmail) {
      lastAlertSentAt.current = 0; // Reset throttle for new alert
      setActiveAlert({ threshold: val, direction: alertDirection, email: alertEmail });
      setAlertInput('');
      setAlertEmail('');
      setShowNotification(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Currency Exchange</h1>
          <p className="text-slate-500 mt-2 text-lg">Live rates for Australia to India</p>
        </div>
        <button
          onClick={fetchRate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600 rounded-xl transition-all shadow-sm disabled:opacity-50 font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-emerald-100/50"
          >
            <div className="flex items-center gap-5 text-emerald-800">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                <BellRing className="w-6 h-6 text-emerald-600 animate-bounce" />
              </div>
              <div>
                <p className="font-bold text-lg">Target Reached!</p>
                <p className="text-emerald-700 mt-0.5">
                  The AUD to INR rate has crossed your target and is now <span className="font-black text-emerald-900">{lastTriggeredRate?.toFixed(2)}</span> INR.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowNotification(false)} 
              className="p-2 hover:bg-emerald-200/50 rounded-full text-emerald-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-50 pointer-events-none"></div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-10 relative z-10">
          <div className="flex-1 text-center md:text-left">
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">From</div>
            <div className="text-6xl font-light text-slate-900 tracking-tight">
              1.00 <span className="text-3xl font-medium text-slate-400 ml-1">AUD</span>
            </div>
            <div className="text-sm font-medium text-slate-500 mt-3">Australian Dollar</div>
          </div>

          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-blue-100/50">
            <ArrowRightLeft className="w-7 h-7 text-blue-600" />
          </div>

          <div className="flex-1 text-center md:text-right">
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">To</div>
            {loading && !rate ? (
              <div className="h-16 flex items-center justify-center md:justify-end">
                <div className="w-40 h-12 bg-slate-100 animate-pulse rounded-xl"></div>
              </div>
            ) : error ? (
              <div className="text-red-500 font-medium">{error}</div>
            ) : (
              <>
                <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 tracking-tight">
                  {rate?.toFixed(2)} <span className="text-3xl font-medium text-slate-400 ml-1">INR</span>
                </div>
                <div className="text-sm font-medium text-slate-500 mt-3">Indian Rupee</div>
              </>
            )}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between text-sm font-medium text-slate-500">
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span>Live Market Feed</span>
          </div>
          <div className="flex items-center gap-2">
            Last updated: {lastUpdated || '...'}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-[2rem] p-10 shadow-xl shadow-slate-200/40 border border-slate-100">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center border border-violet-100">
            <Bell className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Price Alerts</h2>
            <p className="text-slate-500 text-sm mt-1">Get notified when the market hits your target</p>
          </div>
        </div>

        {activeAlert ? (
          <div className="flex items-center justify-between bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Active Alert</p>
              <p className="font-medium text-slate-900 text-xl">
                Notify <span className="font-bold text-blue-600">{activeAlert.email}</span> when rate goes <span className="font-bold text-violet-600">{activeAlert.direction}</span> {activeAlert.threshold.toFixed(2)} INR
              </p>
              <p className="text-sm text-slate-500 mt-2">
                * Alerts are throttled to a maximum of one email every 30 minutes.
              </p>
            </div>
            <button
              onClick={() => setActiveAlert(null)}
              className="text-sm text-red-600 hover:text-red-700 font-bold px-5 py-2.5 hover:bg-red-50 rounded-xl transition-colors"
            >
              Cancel Alert
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-6 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-slate-700 mb-2">Condition</label>
                <select
                  value={alertDirection}
                  onChange={(e) => setAlertDirection(e.target.value as 'above' | 'below')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700"
                >
                  <option value="above">Goes Above</option>
                  <option value="below">Goes Below</option>
                </select>
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-slate-700 mb-2">Target Rate (INR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={alertInput}
                  onChange={(e) => setAlertInput(e.target.value)}
                  placeholder={rate ? `e.g. ${(rate + 0.5).toFixed(2)}` : "e.g. 55.50"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                />
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-900"
                />
              </div>
              <button
                onClick={handleSetAlert}
                disabled={!alertInput || !alertEmail}
                className="w-full md:w-auto bg-blue-600 text-white px-10 py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shadow-lg shadow-blue-600/20"
              >
                Set Alert
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
