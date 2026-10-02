"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-50 flex flex-col items-center selection:bg-zinc-800 relative overflow-hidden">
      
      {/* Dynamic Backgrounds */}
      <div className="absolute inset-0 z-0 bg-grid-pattern pointer-events-none"></div>
      
      {/* Floating Glowing Orbs */}
      <div className="absolute top-[10%] left-[20%] w-[400px] h-[400px] bg-emerald-900/30 rounded-full blur-[120px] pointer-events-none" style={{ animation: 'floatOrb 15s ease-in-out infinite' }}></div>
      <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[150px] pointer-events-none" style={{ animation: 'floatOrb 20s ease-in-out infinite reverse' }}></div>
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[800px] h-[400px] bg-white/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Glassmorphic Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="w-full px-8 sm:px-12 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white to-zinc-400 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400 select-none">SentinelAI</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="px-5 py-2 rounded-full bg-white/10 border border-white/10 text-white text-sm font-medium hover:bg-white hover:text-black transition-all duration-300">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl px-6 text-center z-10 pt-20">
        
        <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 backdrop-blur-md text-xs font-semibold text-zinc-300 mb-8 shadow-2xl">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Powered by Sentinel-2 & CLIP Vision Transformers
        </div>
        
        <h1 className="animate-fade-in-up delay-100 text-6xl sm:text-8xl font-extrabold tracking-tighter mb-8 leading-[1.1]">
          <span className="bg-gradient-to-br from-white via-white to-zinc-500 bg-clip-text text-transparent">Search the planet</span>
          <br />
          <span className="bg-gradient-to-r from-zinc-400 to-zinc-600 bg-clip-text text-transparent">with natural language.</span>
        </h1>
        
        <p className="animate-fade-in-up delay-200 text-lg sm:text-2xl text-zinc-400 mb-12 max-w-3xl font-light leading-relaxed">
          A military-grade geospatial intelligence platform. Query high-resolution satellite imagery, detect structural changes, and track global infrastructure—instantly.
        </p>
        
        <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-center gap-6">
          <Link 
            href="/login" 
            className="group relative px-8 py-4 rounded-full bg-white text-black text-lg font-bold hover:scale-105 transition-all duration-300 flex items-center gap-3 overflow-hidden shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.4)]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            Launch Platform
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noreferrer"
            className="px-8 py-4 rounded-full bg-transparent border border-zinc-700 text-white text-lg font-medium hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            View Documentation
          </a>
        </div>

      </main>
      
      {/* Subtle UI Footer */}
      <footer className="w-full py-8 text-center text-zinc-600 text-sm z-10 animate-fade-in-up delay-300">
        © {new Date().getFullYear()} SentinelAI Corporation. Built for planetary scale.
      </footer>

    </div>
  );
}
