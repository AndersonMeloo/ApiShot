import { useRef } from 'react';
import { TEMPLATE_VARIABLES } from '../../core/template';
import { validateMessage } from '../../core/validation';
import { Notice } from './ui/Notice';

interface MessageEditorProps {
  message: string;
  maxLength: number;
  onChange: (message: string) => void;
}

const PLACEHOLDER = 'Olá, {nome}! 👋\n\nTemos uma novidade para você.\n\nConfira nosso novo produto na imagem abaixo.\n\nSe tiver interesse, responda esta mensagem.';

export function MessageEditor({ message, maxLength, onChange }: MessageEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const errors = message ? validateMessage(message) : [];

  const insertVariable = (variable: string) => {
    const element = textarea.current;
    const token = `{${variable}}`;
    if (!element) return onChange(message + token);
    const { selectionStart, selectionEnd } = element;
    onChange(message.slice(0, selectionStart) + token + message.slice(selectionEnd));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(selectionStart + token.length, selectionStart + token.length);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        Variáveis disponíveis:
        {TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable}
            type="button"
            onClick={() => insertVariable(variable)}
            className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
            title="Inserir no cursor"
          >
            {`{${variable}}`}
          </button>
        ))}
      </div>
      <textarea
        ref={textarea}
        value={message}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={9}
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>Sem nome, "{'{nome}'}" é removido automaticamente (ex.: "Olá, {'{nome}'}!" vira "Olá!").</span>
        <span className="tabular-nums">
          {message.length}/{maxLength}
        </span>
      </div>
      {errors.length > 0 && <Notice tone="error">{errors.join('\n')}</Notice>}
    </div>
  );
}
