'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface KnowledgeDocument {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'philosophy',
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && (session?.user as any)?.role !== 'admin') {
      router.push('/chat');
    } else if (status === 'authenticated') {
      loadDocuments();
    }
  }, [status, session, router]);

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/knowledge');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({ title: '', content: '', type: 'philosophy' });
        setShowForm(false);
        loadDocuments();
      } else {
        alert('Failed to upload document');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const response = await fetch(`/api/knowledge?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadDocuments();
      } else {
        alert('Failed to delete document');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete document');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-brand-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-red to-brand-red-highlight rounded-lg flex items-center justify-center font-display text-xl font-bold">
              GP
            </div>
            <span className="font-display text-lg tracking-wide">
              <span className="text-brand-white">ADMIN</span>
              <span className="text-brand-red"> PANEL</span>
            </span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link
              href="/chat"
              className="text-brand-gray-muted hover:text-brand-white text-sm"
            >
              Chat
            </Link>
            <div className="text-sm text-brand-gray-muted">
              {session?.user?.email}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl mb-2">
              <span className="text-brand-white">KNOWLEDGE</span>
              <span className="text-brand-red"> BASE</span>
            </h1>
            <p className="text-brand-gray-muted">
              Manage the AI coach's training materials
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-brand-red hover:bg-brand-red-highlight text-white rounded-lg transition font-semibold uppercase tracking-wide"
          >
            {showForm ? 'Cancel' : 'Add Document'}
          </button>
        </div>

        {/* Upload Form */}
        {showForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                  className="w-full px-4 py-2 bg-brand-black border border-gray-700 rounded-md focus:outline-none focus:border-brand-red transition"
                  placeholder="Document title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-brand-black border border-gray-700 rounded-md focus:outline-none focus:border-brand-red transition"
                >
                  <option value="philosophy">Philosophy</option>
                  <option value="meeting">Meeting Notes</option>
                  <option value="training">Training Material</option>
                  <option value="resource">Resource</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  required
                  rows={10}
                  className="w-full px-4 py-2 bg-brand-black border border-gray-700 rounded-md focus:outline-none focus:border-brand-red transition font-mono text-sm"
                  placeholder="Document content..."
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="px-6 py-2 bg-brand-red hover:bg-brand-red-highlight disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition font-semibold uppercase tracking-wide"
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </form>
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-brand-gray-muted">
              No documents yet. Add your first training material to get started.
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-6 flex items-center justify-between"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{doc.title}</h3>
                  <div className="flex items-center space-x-3 text-sm text-brand-gray-muted">
                    <span className="px-2 py-1 bg-brand-red/20 text-brand-red rounded text-xs uppercase">
                      {doc.type}
                    </span>
                    <span>
                      Added {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
