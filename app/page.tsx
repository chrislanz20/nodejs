import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-brand-black text-brand-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-red to-brand-red-highlight rounded-lg flex items-center justify-center font-display text-2xl font-bold">
                GP
              </div>
              <span className="font-display text-xl tracking-wide">
                <span className="text-brand-white">GERARDI</span>
                <span className="text-brand-red"> PERFORMANCE</span>
              </span>
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-8 text-sm uppercase">
              <Link href="#plans" className="text-brand-gray-muted hover:text-brand-white transition">
                Plans & Packages
              </Link>
              <span className="text-gray-700">|</span>
              <Link href="#about" className="text-brand-gray-muted hover:text-brand-white transition">
                About
              </Link>
              <span className="text-gray-700">|</span>
              <Link href="#testimonials" className="text-brand-gray-muted hover:text-brand-white transition">
                Testimonials
              </Link>
              <span className="text-gray-700">|</span>
              {session ? (
                <Link
                  href="/chat"
                  className="px-6 py-2 bg-brand-red hover:bg-brand-red-highlight text-white rounded-md transition font-semibold"
                >
                  Chat Now
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="px-6 py-2 bg-brand-red hover:bg-brand-red-highlight text-white rounded-md transition font-semibold"
                >
                  Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-brand-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32">
        <div className="max-w-5xl mx-auto px-6 text-center">
          {/* Main Headline */}
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl tracking-wider mb-4">
            <span className="text-brand-white">GERARDI</span>
            <br />
            <span className="text-brand-red">PERFORMANCE</span>
          </h1>

          {/* Subtitle */}
          <div className="text-xl md:text-2xl mb-6">
            <span className="text-brand-white">Sculpted by </span>
            <span className="text-brand-red">Michaelangelo</span>
          </div>

          {/* Pitch Line */}
          <p className="text-lg md:text-xl text-brand-gray-muted italic max-w-3xl mx-auto mb-12 leading-relaxed">
            For fitness coaches who want to scale their business, acquire more clients, and master the art of coaching the coaches
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {session ? (
              <Link
                href="/chat"
                className="px-10 py-4 bg-brand-red hover:bg-brand-red-highlight text-white rounded-lg transition font-bold text-lg uppercase tracking-wide"
              >
                Start Chatting
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-10 py-4 bg-brand-red hover:bg-brand-red-highlight text-white rounded-lg transition font-bold text-lg uppercase tracking-wide"
                >
                  Get Started
                </Link>
                <Link
                  href="#about"
                  className="px-10 py-4 border-2 border-brand-red text-brand-red hover:bg-brand-red hover:text-white rounded-lg transition font-bold text-lg uppercase tracking-wide"
                >
                  Learn More
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="about" className="py-20 bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-5xl md:text-6xl text-center mb-16">
            <span className="text-brand-white">WHAT YOU </span>
            <span className="text-brand-red">GET</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 bg-brand-black border border-brand-red rounded-lg">
              <div className="text-brand-red text-4xl mb-4">🎯</div>
              <h3 className="font-bold text-xl mb-3 uppercase tracking-wide">Proven Methods</h3>
              <p className="text-brand-gray-muted">
                Access to years of experience training fitness coaches. Get real strategies that actually work in the business.
              </p>
            </div>

            <div className="p-8 bg-brand-black border border-brand-red rounded-lg">
              <div className="text-brand-red text-4xl mb-4">💡</div>
              <h3 className="font-bold text-xl mb-3 uppercase tracking-wide">24/7 Guidance</h3>
              <p className="text-brand-gray-muted">
                Get instant answers to your coaching and business questions, anytime you need them. No more waiting for callbacks.
              </p>
            </div>

            <div className="p-8 bg-brand-black border border-brand-red rounded-lg">
              <div className="text-brand-red text-4xl mb-4">🚀</div>
              <h3 className="font-bold text-xl mb-3 uppercase tracking-wide">Scale Your Business</h3>
              <p className="text-brand-gray-muted">
                Learn the exact frameworks for client acquisition, retention, and building a sustainable fitness coaching business.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-display text-5xl md:text-6xl mb-8">
            <span className="text-brand-white">READY TO </span>
            <span className="text-brand-red">LEVEL UP?</span>
          </h2>
          <p className="text-xl text-brand-gray-muted mb-8">
            Stop spinning your wheels. Get the guidance you need to build a thriving coaching business.
          </p>
          {!session && (
            <Link
              href="/login"
              className="inline-block px-12 py-5 bg-brand-red hover:bg-brand-red-highlight text-white rounded-lg transition font-bold text-xl uppercase tracking-wide"
            >
              Get Access Now
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-brand-gray-muted text-sm">
          <p>&copy; 2025 Gerardi Performance. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
