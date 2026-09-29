import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  /** When set, the user must tick this checkbox before confirming. */
  acknowledgement?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!props.loading) props.onCancel();
      }}
      className="m-auto w-full max-w-lg rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      {props.open && <DialogBody {...props} />}
    </dialog>
  );
}

function DialogBody({ title, children, confirmLabel, cancelLabel = 'Voltar', variant = 'primary', acknowledgement, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3 text-sm text-slate-700">{children}</div>
      {acknowledgement && (
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-800">
          <input type="checkbox" className="mt-0.5 size-4 accent-emerald-600" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          {acknowledgement}
        </label>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} loading={loading} disabled={Boolean(acknowledgement) && !acknowledged}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
