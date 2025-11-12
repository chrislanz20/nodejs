import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/prisma';
import { generateCoachResponse } from '@/lib/ai/claude';
import { searchSimilarDocuments } from '@/lib/ai/vector-store';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, conversationId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } },
      });

      if (!conversation || conversation.userId !== (session.user as any).id) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId: (session.user as any).id,
          title: message.slice(0, 100),
        },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Search for relevant knowledge documents
    const relevantDocs = await searchSimilarDocuments(message, 5);

    // Get conversation history
    const conversationHistory = conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Generate response using Claude with RAG context
    const response = await generateCoachResponse(
      message,
      {
        relevantDocuments: relevantDocs.map((doc) => ({
          title: doc.metadata.title || 'Untitled',
          content: doc.content,
          type: doc.metadata.type || 'general',
        })),
      },
      conversationHistory
    );

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: response,
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: response,
        createdAt: assistantMessage.createdAt,
      },
      sources: relevantDocs.map((doc) => ({
        title: doc.metadata.title,
        type: doc.metadata.type,
      })),
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
