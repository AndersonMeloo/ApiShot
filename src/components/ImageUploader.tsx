import { useRef } from 'react';
import type { MediaInfo } from '../../core/types';
import { ALLOWED_IMAGE_EXTENSIONS, formatBytes, validateImage } from '../../core/validation';
import { useAction } from '../hooks/useAction';
import { invoke } from '../lib/api';
import { Button } from './ui/Button';

interface ImageUploaderProps {
  image: MediaInfo | null;
  previewUrl: string | null;
  maxBytes: number;
}

const ACCEPT = ALLOWED_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export function ImageUploader({ image, previewUrl, maxBytes }: ImageUploaderProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { run, pending } = useAction();

  const upload = (file: File) =>
    run(
      'upload',
      async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        validateImage(file.name, bytes, maxBytes);
        await invoke('app:set-image', { fileName: file.name, bytes });
      },
      'Imagem salva.',
    );

  return (
    <div className="space-y-3">
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      {image ? (
        <div className="flex gap-4">
          <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {previewUrl ? (
              <img src={previewUrl} alt="Pré-visualização da imagem" className="size-full object-contain" />
            ) : (
              <span className="px-2 text-center text-xs text-red-600">Arquivo não encontrado</span>
            )}
          </div>
          <div className="min-w-0 space-y-2 text-sm">
            <p className="truncate font-medium text-slate-800" title={image.fileName}>
              {image.fileName}
            </p>
            <p className="text-slate-500">{formatBytes(image.sizeBytes)}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileInput.current?.click()} loading={pending === 'upload'}>
                Trocar imagem
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run('remove', () => invoke('app:remove-image'))} loading={pending === 'remove'}>
                Remover
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-slate-300 p-4">
          <p className="text-sm text-slate-500">
            Opcional. JPG, JPEG, PNG ou WEBP até {formatBytes(maxBytes)}. A mensagem será enviada como legenda.
          </p>
          <Button variant="primary" onClick={() => fileInput.current?.click()} loading={pending === 'upload'}>
            Selecionar imagem
          </Button>
        </div>
      )}
    </div>
  );
}
