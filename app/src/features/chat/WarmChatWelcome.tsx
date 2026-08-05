import { Code2, ListTodo, Search, Sparkles } from 'lucide-react';
import { useChatMessages } from './hooks';

const QUICK_PROMPTS = [
  {
    title: 'Ask Jarvis anything',
    description: 'General knowledge, help, ideas',
    icon: Sparkles,
  },
  {
    title: 'Plan a project',
    description: 'Break tasks into steps',
    icon: ListTodo,
  },
  {
    title: 'Review my code',
    description: 'Find issues and improve',
    icon: Code2,
  },
  {
    title: 'Research a topic',
    description: 'Deep dive and summarize',
    icon: Search,
  },
] as const;

export function WarmChatWelcome({
  chatId,
  /** Dense layout for pet mini-panel (same 4 starters + art, panel-scaled). */
  compact = false,
}: {
  chatId: string;
  compact?: boolean;
}) {
  const messages = useChatMessages(chatId);
  const insertPrompt = (text: string) => {
    window.dispatchEvent(
      new CustomEvent('jarvis:composer:insert-text', {
        detail: { chatId, text },
      }),
    );
  };

  if (messages.length > 0) return null;

  return (
    <section
      className={compact ? 'warm-chat-welcome warm-chat-welcome--compact' : 'warm-chat-welcome'}
      aria-labelledby="warm-chat-welcome-title"
      data-pet-chat-welcome={compact ? 'true' : undefined}
    >
      <div className="warm-chat-welcome__content">
        <img
          alt="Notebook, coffee, and writing tools"
          className="warm-chat-welcome__art"
          draggable={false}
          height="2048"
          src="/assets/themes/warm/reference/chat-notebook.png"
          width="2048"
        />
        <h1 id="warm-chat-welcome-title">Start a conversation</h1>
        <p>Ask anything, explore ideas, or delegate to an agent.</p>
        <div className="warm-chat-welcome__prompts" aria-label="Conversation starters">
          {QUICK_PROMPTS.map(({ title, description, icon: Icon }) => (
            <button
              key={title}
              type="button"
              data-warm-quick-prompt={title}
              onClick={() => insertPrompt(title)}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
