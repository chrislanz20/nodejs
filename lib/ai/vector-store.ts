// ChromaDB is disabled for now - will be added back later
// This file provides no-op implementations to keep the app working

export async function initializeVectorStore() {
  console.warn('ChromaDB is not configured - vector search disabled');
  return null;
}

export async function addDocumentToVectorStore(
  id: string,
  text: string,
  metadata: {
    title: string;
    type: string;
    [key: string]: any;
  }
) {
  console.warn('ChromaDB not configured - document not indexed in vector store');
  return id;
}

export async function searchSimilarDocuments(
  query: string,
  limit: number = 5
): Promise<Array<{
  id: string;
  content: string;
  metadata: any;
  similarity: number;
}>> {
  console.warn('ChromaDB not configured - returning empty search results');
  return [];
}

export async function deleteDocumentFromVectorStore(id: string) {
  console.warn('ChromaDB not configured - nothing to delete from vector store');
  return;
}
