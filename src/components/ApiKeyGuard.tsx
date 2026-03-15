import React, { useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';

export function ApiKeyGuard({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (hasKey === null) {
    return <div className="flex items-center justify-center h-full text-slate-400 font-medium">Checking permissions...</div>;
  }

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)]">
        <div className="bg-white p-10 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-100">
            <KeyRound className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-3">API Key Required</h2>
          <p className="text-slate-500 mb-8 font-medium leading-relaxed">
            To use the advanced image generation features, you need to provide your own Gemini API key from a paid Google Cloud project.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-slate-900 text-white py-4 px-6 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20"
          >
            Select API Key
          </button>
          <p className="mt-6 text-sm font-medium">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline">
              Learn more about billing
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
