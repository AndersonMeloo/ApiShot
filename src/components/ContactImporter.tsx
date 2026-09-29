import { useRef, useState } from 'react';
import { MAX_CSV_BYTES, summarizeContacts } from '../../core/csvService';
import type { ContactList } from '../../core/types';
import { useAction } from '../hooks/useAction';
import { useNotify } from '../hooks/useNotifications';
import { invoke } from '../lib/api';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';
import { Stat } from './ui/Stat';

const VISIBLE_WARNINGS = 5;

export function ContactImporter({ contacts }: { contacts: ContactList | null }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { run, pending } = useAction();

  const importFile = (file: File) =>
    run(
      'import',
      async () => {
        if (file.size > MAX_CSV_BYTES) throw new Error('Arquivo CSV muito grande (máximo 5 MB).');
        await invoke('app:import-contacts', { fileName: file.name, content: await file.text() });
      },
      `Contatos importados de ${file.name}.`,
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
        <Button variant="primary" onClick={() => fileInput.current?.click()} loading={pending === 'import'}>
          Importar CSV
        </Button>
        {contacts && <ContactListActions contacts={contacts} />}
      </div>
      {contacts ? <ContactListSummary contacts={contacts} /> : <EmptyState />}
    </div>
  );
}

function ContactListActions({ contacts }: { contacts: ContactList }) {
  const { run, pending } = useAction();
  const notify = useNotify();
  const summary = summarizeContacts(contacts.contacts);
  const removable = summary.invalid + summary.duplicate;

  return (
    <>
      <Button
        onClick={() => run('remove', () => invoke('app:remove-invalid'), `${removable} linha(s) removida(s).`)}
        disabled={removable === 0}
        loading={pending === 'remove'}
      >
        Remover inválidos e duplicados
      </Button>
      <Button
        onClick={() =>
          run('export', async () => {
            const file = await invoke('app:export-clean');
            if (file) notify.success(`Lista limpa salva em ${file}`);
          })
        }
        disabled={summary.valid === 0}
        loading={pending === 'export'}
      >
        Exportar lista limpa
      </Button>
      <Button variant="ghost" onClick={() => run('clear', () => invoke('app:clear-contacts'))} loading={pending === 'clear'}>
        Limpar lista
      </Button>
    </>
  );
}

function ContactListSummary({ contacts }: { contacts: ContactList }) {
  const summary = summarizeContacts(contacts.contacts);
  const extraWarnings = contacts.warnings.length - VISIBLE_WARNINGS;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Arquivo: <span className="font-medium text-slate-700">{contacts.fileName}</span>
      </p>
      <div className="grid grid-cols-3 gap-2 xl:grid-cols-6">
        <Stat label="Total" value={summary.total} />
        <Stat label="Válidos" value={summary.valid} tone="green" />
        <Stat label="Inválidos" value={summary.invalid} tone="red" />
        <Stat label="Duplicados" value={summary.duplicate} tone="yellow" />
        <Stat label="Bloqueados" value={summary.blocked} />
        <Stat label="Sem autorização" value={summary.noOptIn} />
      </div>
      {!contacts.hasOptInColumn && (
        <Notice tone="warning">
          O CSV não possui a coluna <strong>optIn</strong>. Antes de iniciar, você precisará confirmar que todos os contatos
          autorizaram receber mensagens.
        </Notice>
      )}
      {contacts.warnings.length > 0 && (
        <Notice tone="info">
          {contacts.warnings.slice(0, VISIBLE_WARNINGS).join('\n')}
          {extraWarnings > 0 && `\n…e mais ${extraWarnings} aviso(s).`}
        </Notice>
      )}
      <p className="text-xs text-slate-500">
        A validação é apenas do formato do número. Ela não garante que o número tenha WhatsApp.
      </p>
    </div>
  );
}

function EmptyState() {
  const [showExample, setShowExample] = useState(false);
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      <p>Nenhuma lista importada. O CSV deve ter a coluna <strong>telefone</strong> e, opcionalmente, <strong>nome</strong> e <strong>optIn</strong>.</p>
      <button type="button" className="mt-2 text-emerald-700 underline" onClick={() => setShowExample((v) => !v)}>
        {showExample ? 'Ocultar exemplo' : 'Ver exemplo'}
      </button>
      {showExample && (
        <pre className="mx-auto mt-3 w-fit rounded bg-slate-100 px-4 py-2 text-left text-xs text-slate-700">
          {'nome,telefone,optIn\nJoão,5511999999999,true\nMaria,(11) 98888-8888,true'}
        </pre>
      )}
    </div>
  );
}
