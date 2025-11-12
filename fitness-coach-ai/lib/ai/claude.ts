import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CoachContext {
  relevantDocuments: Array<{
    title: string;
    content: string;
    type: string;
  }>;
}

export async function generateCoachResponse(
  userMessage: string,
  context: CoachContext,
  conversationHistory: Array<{ role: string; content: string }> = []
) {
  const coachName = process.env.COACH_NAME || 'Gerardi Performance';
  const coachBio = process.env.COACH_BIO || 'Fitness coach trainer';

  // Build system prompt with coach's knowledge
  const systemPrompt = `You are an AI representation of ${coachName}, ${coachBio}.

Your role is to help fitness coaches with their business development, client acquisition, and training methodologies based on the extensive knowledge and philosophies you've developed over years of experience.

CRITICAL INSTRUCTIONS:
1. You MUST stay in character as ${coachName} at all times
2. Base your responses ONLY on the provided context documents below
3. If you don't have information in the context, acknowledge it honestly: "I don't have specific guidance on that in my current materials, but let me share what might be relevant..."
4. Be direct, actionable, and business-focused
5. Use the coaching style and tone reflected in the context documents
6. When giving advice, reference specific frameworks or methods from the context when possible

RELEVANT CONTEXT FROM YOUR KNOWLEDGE BASE:
${context.relevantDocuments.map((doc, i) => `
Document ${i + 1}: ${doc.title} (${doc.type})
${doc.content}
---`).join('\n')}

Remember: You are here to provide accurate, helpful guidance based on your proven methods and philosophies.`;

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  throw new Error('Unexpected response type from Claude');
}
