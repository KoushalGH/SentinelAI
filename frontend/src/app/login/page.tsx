"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // If already logged in, redirect straight to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/dashboard");
      } else {
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push("/dashboard");
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      
      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        <span className="text-sm font-medium">Back to home</span>
      </Link>

      <div className="w-full max-w-[400px] flex flex-col items-center">
        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center mb-6">
          <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Welcome back</h2>
        <p className="text-zinc-400 text-sm mb-8 text-center">Enter your details to access the SentinelAI platform.</p>

        <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-6 shadow-2xl">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              style: {
                button: { color: 'black' },
                anchor: { color: '#a1a1aa', textDecoration: 'none' },
              },
              variables: {
                default: {
                  colors: {
                    brand: '#ffffff',
                    brandAccent: '#e4e4e7',
                    brandButtonText: '#000000',
                    defaultButtonBackground: '#18181b',
                    defaultButtonBackgroundHover: '#27272a',
                    inputBackground: '#18181b',
                    inputText: '#fafafa',
                    inputBorder: '#27272a',
                    inputBorderHover: '#3f3f46',
                    inputBorderFocus: '#52525b',
                  }
                }
              }
            }}
            theme="dark"
            providers={[]}
          />
        </div>
      </div>
    </div>
  );
}
