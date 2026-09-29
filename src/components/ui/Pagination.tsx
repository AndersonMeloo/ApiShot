import { useState } from 'react';
import { Button } from './Button';

export function usePagination<T>(items: readonly T[], pageSize: number) {
  const [requestedPage, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);
  return { page, pageCount, pageItems, setPage };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, total, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 text-sm text-slate-500">
      <span>
        Página {page + 1} de {pageCount} · {total} registro(s)
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onChange(page - 1)} disabled={page === 0}>
          Anterior
        </Button>
        <Button size="sm" onClick={() => onChange(page + 1)} disabled={page >= pageCount - 1}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
