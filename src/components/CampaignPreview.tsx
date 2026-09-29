import { useState } from 'react';
import { renderMessage } from '../../core/template';
import type { Contact } from '../../core/types';

const NO_NAME = '__sem_nome__';
const SAMPLE_SIZE = 20;

interface MessageBubbleProps {
  message: string;
  imageUrl: string | null;
  hasImage: boolean;
}

/** WhatsApp-like bubble showing exactly what one contact will receive: the image with the text as caption. */
export function MessageBubble({ message, imageUrl, hasImage }: MessageBubbleProps) {
  return (
    <div className="rounded-lg bg-[#efeae2] p-4">
      <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 shadow-sm">
        {hasImage &&
          (imageUrl ? (
            <img src={imageUrl} alt="Imagem da campanha" className="mb-1 max-h-64 w-full rounded-md object-cover" />
          ) : (
            <div className="mb-1 grid h-32 place-items-center rounded-md bg-slate-200 text-xs text-slate-500">Imagem indisponível</div>
          ))}
        <p className="px-1.5 pb-1 text-sm wrap-break-word whitespace-pre-wrap text-slate-900">
          {message || <span className="text-slate-400 italic">Sua mensagem aparecerá aqui</span>}
        </p>
      </div>
    </div>
  );
}

interface CampaignPreviewProps {
  template: string;
  imageUrl: string | null;
  hasImage: boolean;
  contacts: readonly Contact[];
}

export function CampaignPreview({ template, imageUrl, hasImage, contacts }: CampaignPreviewProps) {
  const samples = contacts.filter((c) => c.status === 'VALID' && c.name).slice(0, SAMPLE_SIZE);
  const [selected, setSelected] = useState<string>('');
  const sample = samples.find((c) => c.id === selected) ?? samples[0];
  const name = selected === NO_NAME ? null : (sample?.name ?? 'Maria');

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Visualizar como:
        <select className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">{samples[0]?.name ?? 'Maria (exemplo)'}</option>
          {samples.slice(1).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NO_NAME}>Contato sem nome</option>
        </select>
      </label>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500 uppercase">Mensagem{hasImage ? ' + imagem (texto como legenda)' : ''}</p>
        <MessageBubble message={renderMessage(template, name)} imageUrl={imageUrl} hasImage={hasImage} />
      </div>
    </div>
  );
}
