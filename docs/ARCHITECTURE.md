# Arquitetura — ApiShot

> Como o app funciona por dentro. Leia antes de mexer no código.

## 1. Visão geral

Electron com três processos lógicos e uma regra central: **a lógica de campanha não conhece o navegador**.

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                  │
│  Renderer (React, sandbox)          Main process (Node.js)       │
│  ┌──────────────────────┐   IPC    ┌──────────────────────────┐  │
│  │ src/                 │ ───────► │ electron/ipc.ts          │  │
│  │  App, components,    │ invoke   │  (canal + Zod + origem)  │  │
│  │  hooks, lib/api.ts   │ ◄─────── │           │              │  │
│  └──────────────────────┘ snapshot │           ▼              │  │
│        ▲ preload.ts                │ backend/appBackend.ts    │  │
│        │ (window.campaignApp)      │  stores · CampaignService│  │
│                                    │           │              │  │
│                                    │           ▼              │  │
│                                    │ core/ (regras puras)     │  │
│                                    │  CampaignRunner ──► WhatsAppService (interface)
│                                    └──────────────────────────┘  │
└──────────────────────────────────────────────┬───────────────────┘
                                               │ implementa
                              backend/whatsapp/PlaywrightWhatsAppService
                                               │ Playwright (perfil persistente, visível)
                                               ▼
                                        web.whatsapp.com
```

## 2. Camadas e dependências

| Pasta | Responsabilidade | Pode importar |
|---|---|---|
| `core/` | Regras puras e testáveis: CSV, telefone, validação, template, máquina de estados, runner, tipos, contrato IPC | só `core/`, `zod`, `papaparse` |
| `backend/` | I/O local: arquivos JSON, logs, mídia, bloqueio, orquestração (`CampaignService`) | `core/`, Node |
| `backend/whatsapp/` | **Única** parte que conhece Playwright e o DOM do WhatsApp Web | `core/`, `playwright-core` |
| `electron/` | Janela, ciclo de vida, preload, registro do IPC | `backend/`, `core/`, Electron |
| `src/` | Interface React + Tailwind | `core/` (tipos e funções puras), `src/` |
| `tests/` | Vitest com `MockWhatsAppService` | tudo menos o Playwright real |

O sentido das dependências é `electron → backend → core` e `src → core`. `core/` nunca importa de `backend/`, `electron/` ou `src/`.

## 3. Processo principal

### Inicialização ([electron/main.ts](../electron/main.ts))
1. `requestSingleInstanceLock()`: uma segunda instância só foca a janela existente.
2. Carrega o `.env` (da raiz do projeto em dev, de `userData` quando instalado).
3. `loadConfig()` valida o env com Zod e gera `AppConfig { dataDir, browserChannel, maxImageBytes }`.
4. `new AppBackend(config)` e `init()`: cria as pastas, carrega settings/draft/blocklist/contatos e executa `campaigns.recover()`.
5. Cria a `BrowserWindow` (`contextIsolation`, `sandbox`, sem `nodeIntegration`, sem navegação nem pop-ups).
6. `registerIpc(backend, getWindow)`.

### Encerramento
- Se houver campanha `RUNNING`, a janela pergunta "Pausar e sair" ou "Continuar campanha".
- `before-quit` chama `backend.shutdown()`: pausa o runner, espera até 20 s o envio atual e fecha o navegador.

### Composition root ([backend/appBackend.ts](../backend/appBackend.ts))
`AppBackend` instancia todos os stores e serviços, expõe as ações do app e gera o `AppSnapshot`, o estado completo enviado à interface.

## 4. IPC

Contrato tipado único em [core/ipc.ts](../core/ipc.ts) (`IpcContract`). Todos os canais começam com `app:`.

```
Renderer: invoke('app:start-campaign', {campaignId, confirmedCount})
  → preload: confere o prefixo "app:" → ipcRenderer.invoke
  → main (electron/ipc.ts):
      1. event.sender === janela principal? (senão "Origem IPC não autorizada")
      2. schemas[channel].parse(payload)   (Zod)
      3. handler → backend
      4. retorna { ok: true, data } | { ok: false, error: "mensagem amigável" }
      5. se o canal não for somente leitura → broadcast do snapshot (debounce de 30 ms)
  → lib/api.ts: lança Error(result.error) se ok=false
```

Estado reativo: a interface **não guarda estado de domínio**. `AppStateProvider` recebe o `AppSnapshot` inicial via `app:get-state` e depois cada `app:state-changed` enviado pelo main. O processo principal é a única fonte da verdade.

Para adicionar um canal: (1) `IpcContract` em `core/ipc.ts`, (2) schema e handler em `electron/ipc.ts`, (3) incluir em `READ_ONLY` se não alterar estado, (4) chamar com `invoke()` na interface.

## 5. Domínio

### Contatos ([core/csvService.ts](../core/csvService.ts), [core/phone.ts](../core/phone.ts))
```
CSV texto → Papa.parse (detecta o separador) → mapColumns (apelidos) → ContactInput[]
          → classifyContacts: normalizePhone → duplicado? → bloqueado? → optIn=false?
          → Contact { status: VALID | INVALID | DUPLICATE | BLOCKED | NO_OPT_IN, issue }
```
`normalizePhone`: sem `+` = Brasil (valida DDD, 9º dígito); `+`/`00` = internacional (8–15 dígitos). A validação é **só sintática**.

### Elegibilidade ([core/validation.ts](../core/validation.ts))
`evaluateEligibility(list, { onlyOptIn, consentConfirmed })` separa os contatos em:
- `eligible`: `VALID` com `optIn=true`, ou `optIn` vazio com o consentimento confirmado;
- `excluded`: `INVALID`/`DUPLICATE` viram `INVALID`; `BLOCKED`/`NO_OPT_IN`/sem optIn (com `onlyOptIn`) viram `SKIPPED`;
- `awaitingConsent`: `optIn` vazio aguardando a confirmação do usuário.

`validateCampaignDraft` também confere a mensagem, as variáveis e o `maxContactsPerCampaign`.

### Máquina de estados ([core/stateMachine.ts](../core/stateMachine.ts))
```
IDLE ─► VALIDATING ─► READY ─► RUNNING ─┬─► COMPLETED ─► IDLE
          │   ▲         │  ▲            ├─► CANCELLED ─► IDLE
          ▼   └─────────┘  │            ├─► PAUSED ─┬─► RUNNING
         IDLE/ERROR       IDLE          │           └─► CANCELLED
                                        └─► ERROR ──┬─► RUNNING
                                                    └─► CANCELLED
```
Qualquer transição fora da tabela lança `InvalidTransitionError`.

### Status do destinatário
`PENDING → SENDING → SUCCESS | FAILED | INVALID | SKIPPED | CANCELLED`. Os cinco últimos são `LogStatus` e cada um gera uma linha de log.

### CampaignRunner ([core/campaignRunner.ts](../core/campaignRunner.ts))
Loop cooperativo, um contato por vez:

```
step():
  requestedAction == CANCEL → marca PENDING/SENDING como CANCELLED → CANCELLED
  requestedAction == PAUSE  → PAUSED
  sem PENDING               → COMPLETED
  espera o intervalo (abortável por pausa/cancelamento)
  process(next):
    bloqueado agora? → SKIPPED              (checagem feita de novo a cada envio)
    renderMessage → SENDING → deliver()
deliver(): até maxRetries+1 tentativas
  ok                         → SUCCESS
  NOT_ON_WHATSAPP            → INVALID
  erro fatal                 → FAILED (se pode ter sido enviado) ou volta a PENDING → campanha ERROR
  retryable && !mayHaveSent  → espera base·2^(n-1) → tenta de novo
  senão                      → FAILED (+ "verifique manualmente" se pode ter sido enviado)
```

Dependências injetadas (`RunnerDeps`): `whatsapp.sendMessage`, `isBlocked`, `sleep`, `now`, `onChange`, `onRecipientFinished`. É isso que torna o runner 100% testável.

### Erros de envio ([core/errors.ts](../core/errors.ts))
| Código | Retryable | Fatal (para a campanha) |
|---|---|---|
| `DISCONNECTED`, `BROWSER_CLOSED`, `UI_CHANGED` | não | **sim** |
| `PAGE_UNAVAILABLE`, `TIMEOUT`, `UPLOAD_FAILED` | sim | não |
| `NOT_ON_WHATSAPP`, `BUSY`, `UNKNOWN` | não | não |

`AppError` é o erro com mensagem segura para mostrar ao usuário. Os demais viram "Erro inesperado: …" e vão para o `app.log`.

### CampaignService ([backend/campaignService.ts](../backend/campaignService.ts))
Dono da **única** campanha ativa. Responsabilidades:
- `exclusive()`: rejeita ações sobrepostas (duplo clique ou ação concorrente) em vez de enfileirar;
- `prepare` → `start(campaignId, confirmedCount)`: o start confere se o id e a quantidade batem com o que o usuário confirmou;
- `assertReadyToSend`: sem teste em andamento, blocklist saudável, imagem no disco, WhatsApp conectado;
- `persist`: salva o JSON da campanha e o resumo e notifica a interface a cada mudança;
- `recover`: na inicialização, carrega a última campanha e aplica `recoverInterruptedCampaign`.

## 6. Automação do WhatsApp Web

[backend/whatsapp/playwrightWhatsAppService.ts](../backend/whatsapp/playwrightWhatsAppService.ts) implementa `WhatsAppService`.

- `chromium.launchPersistentContext(data/browser-profile, { headless: false })`: navegador **visível**, com perfil próprio e login manual.
- Um monitor a cada 3 s atualiza `WhatsAppState` (`CLOSED | OPENING | WAITING_LOGIN | CONNECTED | ERROR`).
- `sendMessage`:
  - **Só texto:** abre `web.whatsapp.com/send?phone=…&text=…`, `waitForChat`, `fillAndVerify` (aceita o texto já preenchido), Enter, `confirmSent`.
  - **Com imagem:** abre a conversa, anexa, `setInputFiles`, espera o preview, `findCaptionBox`, preenche a legenda, envia, `confirmSent`.
  - **Plano B:** sem campo de legenda, fecha o preview sem enviar, manda o texto e depois a imagem. Se a imagem falhar, retorna "texto enviado, mas a imagem falhou".
- `fillAndVerify` tenta colar, depois digitar (ou `fill` em textarea/input) e confere o texto (ignorando emoji e espaços). Texto incompleto **nunca** é enviado.
- `confirmSent` compara o snapshot das linhas `#main [data-id]` antes e depois e espera sair do ícone `msg-time`.
- `messageMayHaveBeenSent` vira `true` imediatamente **antes** do Enter/clique em enviar. Tudo que falha depois disso não é repetido.
- Seletores centralizados em [selectors.ts](../backend/whatsapp/selectors.ts), em ordem de prioridade (PT e EN).

## 7. Persistência

Tudo em JSON e JSONL sob `dataDir` (`./data` em dev; `%APPDATA%/ApiShot/data` quando instalado; ou `DATA_DIR`).

| Arquivo | Classe | Política se corrompido |
|---|---|---|
| `settings.json` | `SettingsStore` | move para `.corrupt-<ts>` e usa o padrão |
| `draft.json` | `DraftStore` | reset |
| `contacts/current.json` (+ cópia de cada CSV) | `ContactsStore` | reset |
| `blocked.json` | `BlocklistStore` | **fail**: bloqueia importação e envio até correção manual |
| `campaigns/campaign-*.json` | `CampaignStore` | ignora o arquivo e loga |
| `logs/<id>.jsonl`, `<id>.summary.json`, `testes.jsonl`, `app.log` | `CampaignLogger`, `AppLogger` | linhas inválidas são ignoradas |
| `media/*` | `MediaStore` | — |
| `browser-profile/` | Playwright | — |

`writeJsonFile` grava em um arquivo `.tmp` e faz `rename` (com retry para EPERM/EBUSY no Windows): escrita atômica. Todos os JSON lidos passam por schema Zod ([backend/schemas.ts](../backend/schemas.ts)).

## 8. Interface

- `main.tsx` → `NotificationsProvider` → `AppStateProvider` → `App`.
- `App.tsx` é só layout: 12 colunas, com passos 1–3 à esquerda, pré-visualização/teste/campanha/progresso/configurações à direita e logs embaixo.
- Hooks:
  - `useAppState`: snapshot atual;
  - `useAction`: uma ação por vez por componente, erros viram notificação;
  - `useDraftMessage`: estado local + salvamento com debounce de 500 ms (`flush()` antes de testar ou preparar);
  - `useImagePreview`: data URL via IPC (o renderer não acessa arquivos).
- `lib/labels.ts`: rótulos, cores e emojis de cada status.
- `components/ui/`: Button, Badge, Card, ConfirmDialog, Notice, Pagination, ProgressBar, Stat.

## 9. Build

| Etapa | Ferramenta | Saída |
|---|---|---|
| Main (`electron/`, `backend/`, `core/`) | `tsc -p tsconfig.electron.json` via `scripts/build-main.mjs` | `dist/main` (CommonJS + `package.json {type: commonjs}`) |
| Renderer (`src/`) | Vite + React + Tailwind v4 (+ CSP no build) | `dist/renderer` |
| Dev | `scripts/dev.mjs`: build do main + servidor Vite + Electron com `VITE_DEV_SERVER_URL` | — |
| Instalador | electron-builder (`playwright-core` fora do asar) | `release/` |

## 10. Testes

Vitest em ambiente Node ([tests/](../tests/)). `MockWhatsAppService` simula resultados e falhas; nenhum teste abre o navegador. Cobertura atual: CSV, telefone, validação/elegibilidade, template, máquina de estados, blocklist, logger e `CampaignService` (pausa, cancelamento, retry, recuperação, opt-in).
