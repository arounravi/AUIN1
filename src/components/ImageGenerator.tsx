import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Image as ImageIcon, Loader2, Download, Sparkles, Wand2 } from 'lucide-react';
import { motion } from 'motion/react';

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

      const response = await aiInstance.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: prompt,
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: size,
          }
        }
      });

      let foundImage = false;
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            setImageUrl(`data:${part.inlineData.mimeType || 'image/png'};base64,${base64EncodeString}`);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) {
        throw new Error('No image returned in the response.');
      }

    } catch (err: any) {
      console.error('Image generation error:', err);
      setError(err.message || 'Failed to generate image.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Image Studio</h1>
        <p className="text-slate-500 mt-2 text-lg">Generate stunning images with Nano Banana Pro</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center border border-violet-100">
                <Wand2 className="w-5 h-5 text-violet-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Creation Tools</h2>
            </div>

            <form onSubmit={handleGenerate} className="space-y-8">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to create in detail..."
                  rows={5}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all resize-none font-medium text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Resolution</label>
                <div className="grid grid-cols-3 gap-3">
                  {['1K', '2K', '4K'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s as any)}
                      className={`py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                        size === s 
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-600/20' 
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!prompt.trim() || isLoading}
                className="w-full bg-slate-900 text-white py-4 px-6 rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:hover:bg-slate-900 flex items-center justify-center gap-3 shadow-xl shadow-slate-900/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Image
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-3 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden aspect-square lg:aspect-auto lg:h-full">
            {isLoading ? (
              <div className="flex flex-col items-center text-slate-400 gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-violet-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                  <Loader2 className="w-12 h-12 animate-spin text-violet-600 relative z-10" />
                </div>
                <p className="text-sm font-bold tracking-widest uppercase text-violet-600 animate-pulse">Crafting your vision...</p>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center p-8 bg-red-50 rounded-3xl border border-red-100 max-w-md">
                <p className="font-bold text-lg mb-2">Generation Failed</p>
                <p className="text-sm opacity-80">{error}</p>
              </div>
            ) : imageUrl ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full relative group rounded-3xl overflow-hidden shadow-inner"
              >
                <img src={imageUrl} alt="Generated" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                  <a
                    href={imageUrl}
                    download="generated-image.png"
                    className="bg-white text-slate-900 px-6 py-3 rounded-full font-bold transition-transform hover:scale-105 flex items-center gap-2 shadow-xl"
                  >
                    <Download className="w-5 h-5" />
                    Download Image
                  </a>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center text-slate-300 gap-5">
                <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center border-2 border-dashed border-slate-200">
                  <ImageIcon className="w-10 h-10 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Canvas is empty</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
