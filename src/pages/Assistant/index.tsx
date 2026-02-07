import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { processAssistantMessage } from '../../services/assistant';
import { cn } from '../../utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function AssistantPage() {
  const equipment = useAppStore((s) => s.equipment);
  const loadEquipment = useAppStore((s) => s.loadEquipment);
  const addTemperatureRecord = useAppStore((s) => s.addTemperatureRecord);
  const getTemperatureRecords = useAppStore((s) => s.getTemperatureRecords);

  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: 'Assistant pret. Tu peux poser une question ou lancer une action.',
      timestamp: new Date(),
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadEquipment();
  }, [loadEquipment]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, processing]);

  const helperText = useMemo(
    () => `${equipment.length} equipement(s) disponible(s) pour les commandes automatiques.`,
    [equipment.length],
  );

  const pushMessage = (role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        text,
        timestamp: new Date(),
      },
    ]);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || processing) return;

    pushMessage('user', trimmed);
    setInput('');
    setProcessing(true);
    try {
      const result = await processAssistantMessage(trimmed, {
        equipment,
        addTemperatureRecord,
        getTemperatureRecords,
      });
      pushMessage('assistant', result.reply);
    } catch {
      pushMessage('assistant', 'Erreur pendant le traitement de la demande.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="app-page-wrap h-full pb-24">
      <div className="app-hero-card space-y-2">
        <h1 className="ios-title app-text">Assistant IA</h1>
        <p className="text-[14px] app-muted">{helperText}</p>
      </div>

      <div className="flex-1 overflow-y-auto app-panel space-y-3">
        {messages.map((message) => (
          <div key={message.id} className={cn('max-w-[92%] rounded-2xl px-3 py-2.5 text-[14px] whitespace-pre-wrap border', message.role === 'assistant' ? 'mr-auto app-surface-2 app-text border-[color:var(--app-border)]' : 'ml-auto app-accent-bg border-transparent')}>
            {message.text}
          </div>
        ))}
        {processing && (
          <div className="max-w-[92%] rounded-2xl px-3 py-2 text-[14px] app-surface-2 mr-auto app-muted border border-[color:var(--app-border)]">
            Traitement en cours...
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Pose ta demande..."
          className="app-input"
        />
        <button
          type="submit"
          disabled={processing || !input.trim()}
          className={cn(
            'px-4 py-2.5 rounded-xl text-[14px] font-semibold active:opacity-70 shrink-0',
            processing || !input.trim() ? 'app-surface-2 app-muted cursor-not-allowed' : 'app-accent-bg',
          )}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
