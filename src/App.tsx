import { CampaignControls } from './components/CampaignControls';
import { CampaignPreview } from './components/CampaignPreview';
import { CampaignProgress } from './components/CampaignProgress';
import { ContactImporter } from './components/ContactImporter';
import { ContactTable } from './components/ContactTable';
import { ImageUploader } from './components/ImageUploader';
import { LogViewer } from './components/LogViewer';
import { MessageEditor } from './components/MessageEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { TestSender } from './components/TestSender';
import { Card } from './components/ui/Card';
import { Notice } from './components/ui/Notice';
import { WhatsAppConnection } from './components/WhatsAppConnection';
import { useAppState } from './hooks/useAppState';
import { useDraftMessage } from './hooks/useDraftMessage';
import { useImagePreview } from './hooks/useImagePreview';

export function App() {
  const snapshot = useAppState();
  const { message, setMessage, flush } = useDraftMessage(snapshot.message);
  const imageUrl = useImagePreview(snapshot.image);
  const { campaign, contacts } = snapshot;
  const showProgress = campaign !== null && campaign.status !== 'READY';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">ApiShot</h1>
            <p className="text-xs text-slate-500">
              Uso local · somente para contatos que autorizaram receber mensagens · {snapshot.blockedCount} número(s) bloqueado(s)
            </p>
          </div>
          <WhatsAppConnection />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 p-6 lg:grid-cols-12">
        {snapshot.blocklistError && (
          <div className="lg:col-span-12">
            <Notice tone="error">{snapshot.blocklistError}</Notice>
          </div>
        )}

        <div className="space-y-6 lg:col-span-7">
          <Card step={1} title="Contatos" description="Importe um CSV com as colunas nome, telefone e (opcional) optIn.">
            <ContactImporter contacts={contacts} />
            {contacts && (
              <div className="mt-4">
                <ContactTable contacts={contacts.contacts} />
              </div>
            )}
          </Card>

          <Card step={2} title="Mensagem" description="Use {nome} para personalizar. A pré-visualização é atualizada em tempo real.">
            <MessageEditor message={message} maxLength={snapshot.limits.maxMessageLength} onChange={setMessage} />
          </Card>

          <Card step={3} title="Imagem" description="Imagem do produto, enviada com a mensagem como legenda.">
            <ImageUploader image={snapshot.image} previewUrl={imageUrl} maxBytes={snapshot.limits.maxImageBytes} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Card title="Pré-visualização" description="Exatamente o que o contato receberá.">
            <CampaignPreview template={message} imageUrl={imageUrl} hasImage={snapshot.image !== null} contacts={contacts?.contacts ?? []} />
          </Card>

          <Card step={4} title="Enviar teste">
            <TestSender flushMessage={flush} />
          </Card>

          <Card step={5} title="Campanha">
            <CampaignControls flushMessage={flush} imageUrl={imageUrl} />
          </Card>

          {showProgress && (
            <Card title="Progresso">
              <CampaignProgress campaign={campaign} />
            </Card>
          )}

          <Card title="Configurações de segurança">
            <SettingsPanel settings={snapshot.settings} locked={campaign?.status === 'RUNNING'} />
          </Card>
        </div>

        <div className="lg:col-span-12">
          <Card title="Registros (logs)" description={`Salvos localmente em ${snapshot.dataDir}`}>
            <LogViewer campaignId={campaign?.id ?? null} version={`${campaign?.updatedAt ?? ''}|${snapshot.testInProgress}`} />
          </Card>
        </div>
      </main>
    </div>
  );
}
