import { generateEmbedding } from './embeddings';

const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';

async function getChromaClient() {
  try {
    const { ChromaClient } = await import('chromadb');
    return new ChromaClient({ path: chromaUrl });
  } catch (error) {
    console.warn('ChromaDB not available:', error);
    return null;
  }
}

const COLLECTION_NAME = 'coach_knowledge';

export async function initializeVectorStore() {
  const client = await getChromaClient();
  if (!client) return null;

  try {
    return await client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
  } catch (error) {
    console.error('Error initializing vector store:', error);
    return null;
  }
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
  try {
    const collection = await initializeVectorStore();
    if (!collection) {
      console.warn('ChromaDB not available, skipping vector storage');
      return id;
    }

    const embedding = await generateEmbedding(text);

    await collection.add({
      ids: [id],
      embeddings: [embedding],
      documents: [text],
      metadatas: [metadata],
    });

    return id;
  } catch (error) {
    console.warn('ChromaDB not available, skipping vector storage:', error);
    return id;
  }
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
  try {
    const collection = await initializeVectorStore();
    if (!collection) {
      console.warn('ChromaDB not available, returning empty results');
      return [];
    }

    const queryEmbedding = await generateEmbedding(query);

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });

    if (!results.ids[0] || !results.documents[0] || !results.metadatas[0] || !results.distances[0]) {
      return [];
    }

    return results.ids[0].map((id, i) => ({
      id,
      content: results.documents[0]![i] as string,
      metadata: results.metadatas[0]![i],
      similarity: 1 - (results.distances[0]![i] || 0), // Convert distance to similarity
    }));
  } catch (error) {
    console.warn('ChromaDB not available, returning empty results:', error);
    return [];
  }
}

export async function deleteDocumentFromVectorStore(id: string) {
  try {
    const collection = await initializeVectorStore();
    if (!collection) {
      console.warn('ChromaDB not available, skipping vector deletion');
      return;
    }
    await collection.delete({ ids: [id] });
  } catch (error) {
    console.warn('ChromaDB not available, skipping vector deletion:', error);
  }
}
