# ApiShot

Aplicação desktop **local** (Electron + React) para preparar e enviar campanhas pelo **WhatsApp Web** a contatos que **autorizaram** receber mensagens.

- Importa contatos por CSV, valida e normaliza os números.
- Personaliza a mensagem com `{nome}` e mostra a pré-visualização em tempo real.
- Envia uma imagem do produto (JPG, JPEG, PNG, WEBP) com a mensagem como legenda.
- Permite um envio de teste antes da campanha.
- Controla a campanha (iniciar com confirmação, pausar, continuar, cancelar) e registra cada resultado.
- **Tudo fica no seu computador**: sem backend em nuvem, banco de dados externo, APIs pagas ou analytics.

> ⚠️ Use somente com contatos que deram consentimento. O aplicativo não burla CAPTCHA, bloqueios, limites ou sistemas anti-spam do WhatsApp e não esconde a automação. Se o WhatsApp Web mudar e uma etapa deixar de funcionar, a campanha é interrompida com um erro claro, sem tentar contornar nada.

---

## Instalação

Pré-requisitos: **Node.js 20.19+** (testado com Node 25) e npm.

```bash
cd apishot
npm install

# Navegador usado pelo Playwright (uma vez só):
npm run setup:browser
```

Em vez de baixar o Chromium do Playwright, você pode usar um navegador já instalado. Crie um arquivo `.env` (copie de `.env.example`) com:

```
BROWSER_CHANNEL=chrome    # ou msedge
```

O navegador usa um **perfil separado** (em `data/browser-profile`). Ele não mexe no seu perfil pessoal.

## Desenvolvimento

```bash
npm install
npm run dev
```

`npm run dev` compila o processo principal, sobe o Vite (com recarga automática da interface) e abre o Electron. Alterações em `electron/`, `backend/` ou `core/` exigem reiniciar o `npm run dev`.

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o aplicativo em modo desenvolvimento |
| `npm run build` | Compila o processo principal (`dist/main`) e a interface (`dist/renderer`) |
| `npm start` | Abre o aplicativo a partir do build |
| `npm run test` | Testes unitários (Vitest). Nenhuma mensagem real é enviada |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos (TypeScript estrito) |
| `npm run package` | Gera o instalador em `release/` |
| `npm run package:dir` | Gera o aplicativo descompactado (mais rápido, para testar) |
| `npm run setup:browser` | Baixa o Chromium usado pelo Playwright |

## Produção

```bash
npm run package
```

O instalador é gerado em `release/`: NSIS no Windows, DMG no macOS e AppImage no Linux. Gere cada um no sistema correspondente.

No aplicativo instalado:
- os dados ficam na pasta de dados do usuário (Windows: `%APPDATA%\ApiShot\data`). O caminho exato aparece na seção *Registros* do app;
- o `.env` opcional fica em `%APPDATA%\ApiShot\.env`;
- o navegador continua vindo de `npm run setup:browser` ou de `BROWSER_CHANNEL=chrome|msedge`.

## Uso

1. **Abrir o aplicativo** (`npm run dev` ou o aplicativo instalado).
2. **Conectar o WhatsApp**: clique em *Conectar WhatsApp* e faça login pelo QR code na janela do navegador que abrir (veja abaixo).
3. **Importar CSV** na seção *1. Contatos*.
4. **Confirmar os contatos**: confira os totais (válidos, inválidos, duplicados, bloqueados, sem autorização). Use *Remover inválidos e duplicados* e, se quiser, *Exportar lista limpa*. Marque *Não enviar novamente* para quem pediu para sair.
5. **Escrever a mensagem** na seção *2. Mensagem*. Use `{nome}`.
6. **Selecionar a imagem** na seção *3. Imagem* (opcional).
7. **Fazer um teste** na seção *4. Enviar teste*, de preferência para o seu próprio número, e conferir no celular.
8. **Confirmar a campanha**: em *5. Campanha*, clique em *Iniciar campanha*. O app valida tudo e mostra: “Você está prestes a iniciar uma campanha para N contatos. Confirma?”, com a prévia da mensagem e da imagem. É preciso marcar a caixa de confirmação.
9. **Iniciar**: acompanhe na seção *Progresso* (🟢 enviado · 🔴 falhou · 🟡 pendente · ⚪ ignorado). Use *Pausar*, *Continuar* ou *Cancelar* quando quiser.

### Formato do CSV

```csv
nome,telefone,optIn
João,5511999999999,true
Maria,(11) 98888-8888,true
Carlos,+5511977777777,false
```

- Só `telefone` é obrigatório. `nome` e `optIn` são opcionais. Também são aceitos `phone`, `celular`, `whatsapp`, `name`, `consentimento`.
- Separador `,` ou `;` (Excel em português). Aceita UTF-8 com BOM.
- Aceita uma lista de números sem cabeçalho (uma coluna).
- Números sem `+` são tratados como brasileiros e aceitam `11999999999`, `5511999999999`, `+5511999999999` e `(11) 99999-9999`. Todos viram `5511999999999`. Números de outros países precisam do `+` e do código do país.
- `optIn`: `true/sim/s/yes/1` = autorizado; `false/não/n/no/0` = não autorizado; vazio = sem registro. Valores desconhecidos são tratados como **não autorizado**.
- Limites: 5 MB e 5.000 linhas por arquivo.

A validação é **só de formato**. Um número válido não necessariamente tem WhatsApp. Se o WhatsApp informar que o número não existe, o contato é marcado como *Inválido* no resultado.

### Mensagem

- `{nome}` é substituído pelo nome do contato.
- Sem nome, a variável sai junto com a vírgula: `Olá, {nome}! 👋` vira `Olá! 👋`. Um contato sem nome nunca quebra a campanha.
- Variáveis desconhecidas (ex.: `{name}`) bloqueiam a campanha, para não enviar texto quebrado.

## WhatsApp Web

- O login é **sempre manual**: na primeira vez, escaneie o QR code com o celular (WhatsApp → Aparelhos conectados).
- A sessão fica salva **somente** em `data/browser-profile` e é reutilizada nas próximas vezes. O aplicativo não lê, captura nem envia credenciais, QR codes ou tokens.
- Para sair da conta, desconecte o aparelho pelo celular ou apague a pasta `data/browser-profile`.
- Para cada contato, o app abre a conversa pelo link oficial `web.whatsapp.com/send?phone=…`, envia a mensagem e, se houver imagem, anexa a imagem com o texto como legenda (uma única mensagem). Só marca 🟢 depois que a mensagem aparece na conversa.
- Se a caixa de legenda não for encontrada, a pré-visualização é fechada sem enviar e o app envia o texto e depois a imagem, em duas mensagens. Isso fica registrado em `data/logs/app.log`. Se o texto sair mas a imagem falhar, o contato fica 🔴 com o aviso "texto enviado, mas a imagem falhou" e não é reenviado, para não duplicar o texto.
- Os seletores da página ficam em [`backend/whatsapp/selectors.ts`](backend/whatsapp/selectors.ts). Se o WhatsApp Web mudar, o erro diz qual elemento não foi encontrado.

## Segurança

- Contatos, mensagens, imagens, campanhas e logs ficam só na pasta `data/`. Nada é enviado a serviços externos além do próprio WhatsApp Web.
- `data/`, `.env`, `dist/` e `node_modules/` estão no `.gitignore`.
- O `.env` não contém credenciais, apenas opções (veja `.env.example`).
- Interface isolada (Electron com `contextIsolation`, `sandbox`, CSP e IPC com validação por Zod).
- **Proteções contra disparos acidentais**:
  - confirmação explícita com a quantidade exata de contatos;
  - envio de teste;
  - pausar e cancelar;
  - botões protegidos contra duplo clique;
  - uma campanha por vez e uma instância do aplicativo por vez;
  - limite `maxContactsPerCampaign` (padrão **50**, máximo 1000);
  - intervalo mínimo entre mensagens (padrão 20 s, mínimo 10 s).

  O app nunca aumenta esses limites sozinho.
- **Tentativas limitadas**: só erros temporários *antes* do envio (página lenta, sem internet, falha de upload) são repetidos, no máximo 3 vezes, com espera crescente (15 s, 30 s…). Se a mensagem **pode ter sido enviada**, o app **não repete**, para evitar duplicidade.

### Estrutura de `data/`

```
data/
├── contacts/          # current.json (lista atual) + cópia de cada CSV importado
├── campaigns/         # campaign-AAAA-MM-DD-HHMMSS.json (estado completo de cada campanha)
├── media/             # imagens selecionadas
├── logs/              # <campanha>.jsonl, <campanha>.summary.json, testes.jsonl, app.log
├── browser-profile/   # sessão local do WhatsApp Web (não compartilhe)
├── blocked.json       # lista de bloqueio / opt-out
├── settings.json      # configurações de segurança
└── draft.json         # mensagem e imagem em edição
```

Cada linha de log tem `timestamp`, `campaignId`, `contactName`, `phone`, `status` (`SUCCESS`, `FAILED`, `SKIPPED`, `INVALID`, `CANCELLED`), `error`, `durationMs` e `attempts`. O resumo traz total, enviados, falharam, inválidos, ignorados, cancelados e pendentes. Use *Exportar relatório CSV* na seção de registros.

## Consentimento

Esta aplicação deve ser usada **somente** com contatos que autorizaram receber suas mensagens.

- A opção **“Somente enviar para contatos que autorizaram receber mensagens”** vem marcada. Com ela, só `optIn=true` recebe.
- Se o CSV não tiver a coluna `optIn`, o app avisa e exige que **você confirme** que todos autorizaram. O app nunca presume consentimento.
- `optIn=false` **nunca** recebe, mesmo com a opção desmarcada.
- **Opt-out**: *Não enviar novamente* adiciona o número a `data/blocked.json`. Números bloqueados nunca recebem mensagens, e isso é conferido de novo antes de cada envio. O app **nunca remove** números dessa lista. Para remover um, edite o arquivo manualmente.

## Troubleshooting

**Sessão desconectada / “WhatsApp Web desconectado”**
Clique em *Mostrar navegador* e faça login de novo pelo QR code. Uma campanha em andamento vai para o estado *Interrompida por erro* sem perder o contato atual. Depois de reconectar, clique em *Continuar*.

**O navegador não abre**
- Mensagem “Navegador não encontrado”: rode `npm run setup:browser` ou defina `BROWSER_CHANNEL=chrome` (ou `msedge`) no `.env`.
- “Perfil já em uso”: feche outras janelas abertas por este aplicativo. Só uma instância roda por vez.
- Sem internet: verifique a conexão e tente *Conectar WhatsApp* de novo.

**Campanha pausada**
A pausa espera o envio atual terminar. Para retomar, clique em *Continuar*, e o envio segue do próximo contato pendente. Se o aplicativo foi fechado durante uma campanha, ela reabre **pausada**. Um contato que estava sendo enviado no momento do fechamento fica como 🔴 *“verifique manualmente”* e **não é reenviado automaticamente**.

**Erro de envio**
Veja a mensagem na lista de progresso e na seção *Registros*:
- *Tempo esgotado*: WhatsApp lento. Aumente “Tempo limite por envio”.
- *Número inválido ou sem conta*: o WhatsApp recusou o número.
- *Elemento não encontrado… interface pode ter mudado*: o WhatsApp Web mudou. A campanha para de propósito. Atualize `backend/whatsapp/selectors.ts` ou aguarde uma atualização.
- *Verifique manualmente se a mensagem chegou*: o envio pode ter acontecido, mas não foi confirmado. Por segurança, não houve nova tentativa.

Detalhes técnicos ficam em `data/logs/app.log`.

**CSV inválido**
- “Coluna telefone não encontrada”: o cabeçalho precisa ter `telefone` (ou `phone`, `celular`, `whatsapp`).
- Números como `5,511E+12` vieram do Excel em notação científica. Formate a coluna como **Texto** antes de salvar.
- Celular sem o 9 (ex.: `11 8888-8888`) é recusado. Corrija para `11 98888-8888`.
- Use *Exportar lista limpa* para gerar um CSV só com os contatos válidos.

## Arquitetura

```
apishot/
├── electron/            # processo principal: janela, preload (sandbox) e IPC validado
├── backend/             # Node.js local: arquivos JSON, logs, bloqueio, mídia, serviço de campanha
│   └── whatsapp/        # automação do WhatsApp Web com Playwright (única parte que conhece o navegador)
├── core/                # regras puras e testáveis: CSV, telefone, validação, {nome}, máquina de estados, runner
├── src/                 # interface React + Tailwind
│   ├── components/      # ContactImporter, ContactTable, MessageEditor, ImageUploader, CampaignPreview,
│   │                    # TestSender, CampaignControls, CampaignProgress, LogViewer, SettingsPanel, ui/
│   ├── hooks/           # estado do app, ações com proteção a duplo clique, notificações
│   └── lib/             # cliente IPC tipado e rótulos
├── tests/               # Vitest + MockWhatsAppService (nenhum envio real)
└── scripts/             # dev e build do processo principal
```

- `core/campaignRunner.ts` executa a campanha contato a contato e depende apenas da interface `WhatsAppService` (`core/whatsapp.ts`), nunca do Playwright.
- Estados: `IDLE → VALIDATING → READY → RUNNING ⇄ PAUSED`, `RUNNING → COMPLETED | CANCELLED | ERROR`, `ERROR → RUNNING | CANCELLED`. Transições inválidas são rejeitadas (`core/stateMachine.ts`).
- O estado é gravado em `data/campaigns/*.json` a cada mudança, com escrita atômica.
