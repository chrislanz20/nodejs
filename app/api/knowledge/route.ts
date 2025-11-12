import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/prisma';
import { addDocumentToVectorStore, deleteDocumentFromVectorStore } from '@/lib/ai/vector-store';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const documents = await prisma.knowledgeDocument.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error('Knowledge GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, content, type, metadata } = await req.json();

    if (!title || !content || !type) {
      return NextResponse.json(
        { error: 'Title, content, and type are required' },
        { status: 400 }
      );
    }

    // Create document in database
    const document = await prisma.knowledgeDocument.create({
      data: {
        title,
        content,
        type,
        metadata: metadata || {},
      },
    });

    // Add to vector store
    try {
      const vectorId = await addDocumentToVectorStore(
        document.id,
        `${title}\n\n${content}`,
        {
          title,
          type,
          ...metadata,
        }
      );

      // Update document with vector ID
      await prisma.knowledgeDocument.update({
        where: { id: document.id },
        data: { vectorId },
      });
    } catch (vectorError) {
      console.error('Vector store error:', vectorError);
      // Continue even if vector store fails
    }

    return NextResponse.json({ document });
  } catch (error: any) {
    console.error('Knowledge POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const document = await prisma.knowledgeDocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete from vector store
    if (document.vectorId) {
      try {
        await deleteDocumentFromVectorStore(document.vectorId);
      } catch (vectorError) {
        console.error('Vector store deletion error:', vectorError);
        // Continue even if vector store deletion fails
      }
    }

    // Delete from database
    await prisma.knowledgeDocument.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Knowledge DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
