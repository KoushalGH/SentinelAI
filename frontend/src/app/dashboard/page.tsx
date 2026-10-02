"use client";

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
      <div className="spinner"></div>
      <p className="text-zinc-400 text-sm mt-4 font-medium">Initializing Map Engine...</p>
    </div>
  ),
});

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [resultLimit, setResultLimit] = useState(15);
  const [changeResults, setChangeResults] = useState<any[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [expandedChangeId, setExpandedChangeId] = useState<number | null>(null);
  const [activeResultIndex, setActiveResultIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'changes' | 'data' | 'history'>('search');
  
  const [cityName, setCityName] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  const [session, setSession] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setSession(session);
        setIsAuthChecking(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login');
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const fetchHistory = async () => {
    if (!session) return;
    setIsLoadingHistory(true);
    const { data, error } = await supabase
      .from('search_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) setHistory(data);
    setIsLoadingHistory(false);
  };

  useEffect(() => {
    if (activeTab === 'history' && session) {
      fetchHistory();
    }
  }, [activeTab, session]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setActiveResultIndex(null);
    
    // Save to history if logged in
    if (session) {
      supabase.from('search_history').insert([{ 
        user_id: session.user.id, 
        query: searchQuery 
      }]).then(({ error }) => {
        if (error) {
          console.error("Supabase Insert Error:", error.message);
          alert("Failed to save history: " + error.message);
        }
      });
    }

    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(searchQuery)}&limit=${resultLimit}`);
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.results && data.results.length > 0 && data.results[0]?.error) {
        alert(data.results[0].error);
      } else if (data.results) {
        setSearchResults(data.results);
      }
    } catch {
      alert("Cannot reach the backend. Is uvicorn running?");
    } finally {
      setIsSearching(false);
    }
  };

  const handleDetectChange = async () => {
    setIsDetecting(true);
    setChangeResults([]);
    try {
      const cleanCity = cityName ? cityName.toLowerCase().replace(/ /g, "_") : "nyc";
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${BACKEND_URL}/detect-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: cityName || "nyc"
        })
      });
      const data = await res.json();
      if (data.changes) {
        setChangeResults(data.changes);
      } else {
        alert(data.error || "Detection failed.");
      }
    } catch {
      alert("Cannot reach the backend.");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName.trim()) return;
    setIsIngesting(true);
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${BACKEND_URL}/add-city`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: cityName })
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(data.message);
      }
    } catch {
      alert("Cannot reach the backend. Is uvicorn running?");
    } finally {
      setIsIngesting(false);
      setCityName('');
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-black text-zinc-50">
      
      {/* Sidebar - Clean, structured Vercel/Linear aesthetic using native Tailwind classes */}
      <aside className="w-[360px] flex-shrink-0 h-full bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">
        
        {/* Header / Brand */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-[4px] bg-white flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">SentinelAI</span>
          </div>
          <button 
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-50 px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 bg-zinc-900 hover:bg-zinc-800 transition-all shadow-sm"
          >
            Sign Out
          </button>
        </div>

        {/* Search Input (Global) */}
        <div className="p-4">
          <form onSubmit={handleSearch}>
            <div className="relative flex items-center">
              <svg className="absolute left-3 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search semantics..."
                className="w-full h-9 pl-9 pr-3 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all"
              />
            </div>
          </form>
        </div>

        {/* Clean Segmented Tabs */}
        <div className="px-2 pb-2">
          <div className="flex justify-between border-b border-zinc-800">
            {['search', 'changes', 'data', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`relative px-3 py-2 text-sm font-medium transition-colors capitalize flex-1 text-center ${activeTab === tab ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-400'}`}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white rounded-t-full"></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">

          {/* TAB: SEARCH */}
          {activeTab === 'search' && (
            <div className="flex flex-col gap-5">
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-400">Result Limit: {resultLimit}</label>
                </div>
                <input 
                  type="range" min="1" max="50" value={resultLimit}
                  onChange={(e) => setResultLimit(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-white" 
                />
              </div>

              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="w-full h-9 rounded-md bg-white text-black text-sm font-medium hover:bg-zinc-200 active:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSearching ? <><span className="spinner border-black border-top-transparent"></span> Searching</> : 'Search Database'}
              </button>

              {searchResults.length > 0 && (
                <div className="pt-2 flex flex-col gap-2">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1 px-1">
                    {searchResults.length} Results Found
                  </div>
                  {searchResults.map((r, i) => (
                    <button 
                      key={i} 
                      onClick={() => setActiveResultIndex(i)}
                      className={`w-full text-left group flex items-center justify-between p-2.5 rounded-md border transition-all ${
                        activeResultIndex === i 
                          ? 'border-amber-500 bg-zinc-800' 
                          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-6 h-6 flex-shrink-0 text-xs font-bold rounded-full transition-colors ${
                          activeResultIndex === i ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-50">{r.filename || `Region ${i + 1}`}</span>
                          <span className="text-xs text-zinc-500 mt-0.5">Semantic match</span>
                        </div>
                      </div>
                      <div className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-xs font-mono">
                        {Math.min((r.score * 100 * 3.8), 99.8).toFixed(1)}%
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {isSearching && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                  <div className="spinner"></div>
                  <p className="text-sm mt-3">Scanning vectors...</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: CHANGES */}
          {activeTab === 'changes' && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Run structural similarity diffing to isolate physical land-use changes.
              </p>
              
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-md p-1.5">
                <div className="flex-1 text-center py-1 bg-zinc-800 rounded-[4px] text-xs text-zinc-50 font-medium">2022</div>
                <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                <div className="flex-1 text-center py-1 bg-zinc-800 rounded-[4px] text-xs text-zinc-50 font-medium">2026</div>
              </div>
              
              <button
                onClick={handleDetectChange}
                disabled={isDetecting}
                className="w-full h-9 rounded-md bg-white text-black text-sm font-medium hover:bg-zinc-200 active:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDetecting ? <><span className="spinner border-black border-top-transparent"></span> Processing</> : 'Compute Changes'}
              </button>

              {changeResults.length > 0 && (
                <div className="pt-2 flex flex-col gap-2">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1 px-1">
                    {changeResults.length} Features Detected
                  </div>
                  {changeResults.slice(0, 40).map((c, i) => (
                    <div key={i} className="flex flex-col rounded-md border border-zinc-800 bg-zinc-900 overflow-hidden transition-all shadow-sm">
                      <button 
                        onClick={() => setExpandedChangeId(expandedChangeId === i ? null : i)}
                        className="group flex items-center justify-between p-2.5 hover:bg-zinc-800 transition-colors w-full text-left"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-50 capitalize">{c.classification}</span>
                          <span className="text-xs text-zinc-500 mt-0.5">CLIP class</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs font-mono">
                            {(c.confidence * 100).toFixed(1)}%
                          </div>
                          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expandedChangeId === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>
                      
                      {expandedChangeId === i && c.image_before && c.image_after && (
                        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex gap-2">
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-semibold">2022 (Before)</span>
                            <img src={c.image_before} alt="Before" className="w-full aspect-square object-cover rounded border border-zinc-800" />
                          </div>
                          <div className="flex-1 flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-semibold">2026 (After)</span>
                            <img src={c.image_after} alt="After" className="w-full aspect-square object-cover rounded border border-zinc-800" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {changeResults.length > 40 && (
                    <div className="text-center pt-2">
                      <span className="text-xs text-zinc-500">+ {changeResults.length - 40} additional regions</span>
                    </div>
                  )}
                </div>
              )}

              {isDetecting && changeResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                  <div className="spinner"></div>
                  <p className="text-sm mt-3 text-center">
                    Running SSIM algorithm...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: DATA */}
          {activeTab === 'data' && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-medium text-zinc-50">Target Region</h3>
                <p className="text-xs text-zinc-400 mt-1">Download AWS Earth Search Sentinel-2 data to expand coverage.</p>
              </div>

              <form onSubmit={handleAddCity} className="flex flex-col gap-3">
                <input
                  type="text"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder="e.g. Tokyo, Japan"
                  className="w-full h-9 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-50 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all"
                  disabled={isIngesting}
                />
                
                <button
                  type="submit"
                  disabled={isIngesting || !cityName.trim()}
                  className="w-full h-9 rounded-md bg-white text-black text-sm font-medium hover:bg-zinc-200 active:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isIngesting ? <><span className="spinner border-black border-top-transparent"></span> Fetching Data</> : 'Ingest City'}
                </button>
              </form>
              
              {isIngesting && (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                  <div className="spinner"></div>
                  <p className="text-sm mt-3 text-center">
                    Pipeline active. Processing tensors...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-medium text-zinc-50">Search History</h3>
                  <p className="text-xs text-zinc-400 mt-1">Logged in as {session?.user?.email}</p>
                </div>
                
                {isLoadingHistory ? (
                   <div className="flex justify-center py-5"><div className="spinner"></div></div>
                ) : history.length === 0 ? (
                  <div className="text-center py-10 text-zinc-500 text-sm">No recent searches.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {history.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSearchQuery(h.query);
                          setActiveTab('search');
                        }}
                        className="text-left group flex items-center justify-between p-2.5 rounded-md border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
                      >
                        <span className="text-sm font-medium text-zinc-200 truncate">{h.query}</span>
                        <span className="text-[10px] text-zinc-500">
                          {new Date(h.created_at).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
        
        {/* Footer info (Status) */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2 text-zinc-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              Engine Online
            </div>
            <div className="text-zinc-500">CLIP ViT-B/32</div>
          </div>
        </div>

      </aside>

      {/* Main Content / Map Area */}
      <main className="flex-1 relative bg-black">
        <Map searchResults={searchResults} changeResults={changeResults} activeResultIndex={activeResultIndex} />
      </main>

    </div>
  );
}
