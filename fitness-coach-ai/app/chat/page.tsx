'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
}

interface Source {
  title: string;
  type: string;
}

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      if (!conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [...prev, data.message]);
      setSources(data.sources || []);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-brand-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-red to-brand-red-highlight rounded-lg flex items-center justify-center font-display text-xl font-bold">
              GP
            </div>
            <span className="font-display text-lg tracking-wide">
              <span className="text-brand-white">GERARDI</span>
              <span className="text-brand-red"> AI</span>
            </span>
          </Link>
          <div className="text-sm text-brand-gray-muted">
            {session?.user?.email}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <div className="font-display text-5xl mb-4">
                <span className="text-brand-white">READY TO </span>
                <span className="text-brand-red">TRAIN?</span>
              </div>
              <p className="text-brand-gray-muted text-lg">
                Ask me anything about building your fitness coaching business
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl px-6 py-4 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-brand-red text-white'
                      : 'bg-gray-900 border border-gray-800 text-brand-white'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-3xl px-6 py-4 rounded-lg bg-gray-900 border border-gray-800">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-brand-red rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-brand-red rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-brand-red rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="border-t border-gray-800 px-6 py-3 bg-gray-900/50">
          <div className="max-w-4xl mx-auto">
            <div className="text-xs text-brand-gray-muted">
              Sources: {sources.map((s) => s.title).join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-800 px-6 py-4 bg-gray-900/30">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="flex-1 px-6 py-4 bg-brand-black border border-gray-700 rounded-lg focus:outline-none focus:border-brand-red transition text-brand-white placeholder-gray-600"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-8 py-4 bg-brand-red hover:bg-brand-red-highlight disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition font-semibold uppercase tracking-wide"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
