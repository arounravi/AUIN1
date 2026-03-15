import React, { useState } from 'react';
import { CurrencyDashboard } from './components/CurrencyDashboard';
import { Chatbot } from './components/Chatbot';
import { ImageGenerator } from './components/ImageGenerator';
import { ApiKeyGuard } from './components/ApiKeyGuard';
import { LayoutDashboard, MessageSquare, Image as ImageIcon, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import './types';

type Tab = 'currency' | 'chat' | 'image';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('currency');

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden selection:bg-blue-200 selection:text-blue-900">
      {/* Sidebar */}
      <div className="w-72 bg-slate-950 text-slate-300 flex flex-col shadow-2xl z-20 relative">
        <div className="p-8">
          <div className="flex items-center gap-3 text-white font-bold text-2xl tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            AUIN
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-widest">Workspace</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<LayoutDashboard />} label="Currency Rates" isActive={activeTab === 'currency'} onClick={() => setActiveTab('currency')} />
          <NavItem icon={<MessageSquare />} label="AI Assistant" isActive={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
          <NavItem icon={<ImageIcon />} label="Image Studio" isActive={activeTab === 'image'} onClick={() => setActiveTab('image')} />
        </nav>
        
        <div className="p-6 border-t border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-medium text-white border border-slate-700">
              U
            </div>
            <div className="text-sm">
              <p className="text-white font-medium">User</p>
              <p className="text-slate-400 text-xs">Pro Plan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative bg-[#F8FAFC]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="min-h-full p-8 lg:p-12"
          >
            {activeTab === 'currency' && <CurrencyDashboard />}
            {activeTab === 'chat' && <Chatbot />}
            {activeTab === 'image' && (
              <ApiKeyGuard>
                <ImageGenerator />
              </ApiKeyGuard>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
        isActive 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 translate-x-1' 
          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement<any>, { className: `w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500'}` })}
      {label}
    </button>
  );
}
