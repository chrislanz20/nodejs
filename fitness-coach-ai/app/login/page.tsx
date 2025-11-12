'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push('/chat');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center space-x-2 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-brand-red to-brand-red-highlight rounded-lg flex items-center justify-center font-display text-3xl font-bold">
              GP
            </div>
          </Link>
          <h1 className="font-display text-4xl tracking-wide mt-4">
            <span className="text-brand-white">GERARDI</span>
            <span className="text-brand-red"> PERFORMANCE</span>
          </h1>
          <p className="text-brand-gray-muted mt-2">Login to access your AI coach</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-brand-black border border-gray-700 rounded-md focus:outline-none focus:border-brand-red transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-brand-black border border-gray-700 rounded-md focus:outline-none focus:border-brand-red transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-brand-red hover:bg-brand-red-highlight disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-md transition font-semibold uppercase tracking-wide"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-brand-gray-muted">
            <p>
              Don't have an account?{' '}
              <Link href="/#plans" className="text-brand-red hover:text-brand-red-highlight">
                View Plans
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-brand-gray-muted hover:text-brand-white text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
