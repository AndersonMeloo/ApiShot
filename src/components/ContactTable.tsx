import { useMemo, useState } from 'react';
import { formatPhone } from '../../core/phone';
import type { Contact, ContactStatus } from '../../core/types';
import { useAction } from '../hooks/useAction';
import { invoke } from '../lib/api';
import { CONTACT_STATUS } from '../lib/labels';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Pagination, usePagination } from './ui/Pagination';

const PAGE_SIZE = 50;
type Filter = 'ALL' | ContactStatus;

function matches(contact: Contact, filter: Filter, search: string): boolean {
  if (filter !== 'ALL' && contact.status !== filter) return false;
  if (!search) return true;
  const haystack = `${contact.name ?? ''} ${contact.rawPhone} ${contact.phone ?? ''}`.toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export function ContactTable({ contacts }: { contacts: readonly Contact[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [toBlock, setToBlock] = useState<Contact | null>(null);
  const { run, pending } = useAction();

  const filtered = useMemo(() => contacts.filter((c) => matches(c, filter, search.trim())), [contacts, filter, search]);
  const { page, pageCount, pageItems, setPage } = usePagination(filtered, PAGE_SIZE);

  const confirmBlock = async () => {
    if (!toBlock?.phone) return;
    const phone = toBlock.phone;
    await run('block', () => invoke('app:block-contact', { phone }), 'Número adicionado à lista de bloqueio.');
    setToBlock(null);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label="Filtrar por status"
        >
          <option value="ALL">Todos os status</option>
          {(Object.keys(CONTACT_STATUS) as ContactStatus[]).map((status) => (
            <option key={status} value={status}>
              {CONTACT_STATUS[status].label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Buscar nome ou telefone"
          className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">Linha</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((contact) => (
              <ContactRow key={contact.id} contact={contact} onBlock={() => setToBlock(contact)} />
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />

      <ConfirmDialog
        open={toBlock !== null}
        title="Não enviar novamente?"
        confirmLabel="Adicionar à lista de bloqueio"
        variant="danger"
        loading={pending === 'block'}
        onConfirm={() => void confirmBlock()}
        onCancel={() => setToBlock(null)}
      >
        <p>
          <strong>{toBlock?.name ?? 'Contato sem nome'}</strong> ({toBlock?.phone ? formatPhone(toBlock.phone) : ''}) será
          adicionado a <code>data/blocked.json</code> e nunca receberá mensagens desta aplicação.
        </p>
        <p className="text-slate-500">O aplicativo nunca remove números dessa lista automaticamente.</p>
      </ConfirmDialog>
    </div>
  );
}

function ContactRow({ contact, onBlock }: { contact: Contact; onBlock: () => void }) {
  const canBlock = contact.phone !== null && contact.status !== 'BLOCKED';
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 text-slate-400 tabular-nums">{contact.row}</td>
      <td className="px-3 py-2">{contact.name ?? <span className="text-slate-400">—</span>}</td>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{contact.phone ? formatPhone(contact.phone) : contact.rawPhone || '(vazio)'}</td>
      <td className="px-3 py-2">
        <StatusBadge status={CONTACT_STATUS[contact.status]} />
        {contact.issue && <p className="mt-0.5 text-xs text-slate-500">{contact.issue}</p>}
      </td>
      <td className="px-3 py-2 text-right">
        {canBlock && (
          <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={onBlock}>
            Não enviar novamente
          </Button>
        )}
      </td>
    </tr>
  );
}
