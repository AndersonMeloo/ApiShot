# Regras do projeto — ApiShot

> Regras para qualquer pessoa (ou agente de IA) que altere este código. As regras de **ética e segurança** não são negociáveis. As de **código** podem evoluir, mas por decisão explícita registrada em [MEMORY.md](MEMORY.md).

## 1. Ética e uso responsável (inegociável)

1. **Consentimento primeiro.** Nunca enviar para `optIn=false`. Nunca presumir consentimento: sem a coluna `optIn`, o usuário precisa confirmar explicitamente.
2. **A lista de bloqueio é permanente.** O app só **adiciona** números a `blocked.json`. Nenhum código pode remover entradas. A checagem é feita na importação, na preparação **e** antes de cada envio.
3. **Proibido:**
   - burlar CAPTCHA, bloqueios, limites, rate limit ou anti-spam do WhatsApp;
   - esconder a automação: modo headless para envio, stealth plugins, user agent ou fingerprint falsos, atrasos "humanizados" aleatórios para evitar detecção;
   - login automático, leitura ou armazenamento de QR code, tokens, cookies ou credenciais;
   - criar contas, gerar ou raspar números, enviar para números sem origem conhecida.
4. **Limites só diminuem sozinhos.** Nenhum código pode aumentar `maxContactsPerCampaign`, reduzir o intervalo ou aumentar as tentativas automaticamente. Os limites mínimos dos schemas (intervalo ≥ 10 s, retries ≤ 3, limite ≤ 1.000) só mudam com uma decisão registrada.
5. **Quando o WhatsApp mudar, falhe com clareza.** Seletor não encontrado gera `UI_CHANGED` com o nome do elemento, e a campanha para. Não tente contornar.
6. **Dados ficam locais.** Nenhuma chamada de rede além do WhatsApp Web: sem telemetria, analytics ou serviços externos.

## 2. Segurança contra envios indevidos

- **Nunca repetir o que pode ter sido enviado.** `messageMayHaveBeenSent = true` deve ser marcado **antes** da ação que envia (Enter/clique). Com essa flag, só `FAILED` + "verifique manualmente".
- **Nunca enviar texto incompleto.** Todo preenchimento passa por `fillAndVerify`.
- Toda ação que altera estado no `CampaignService` passa por `exclusive()`.
- O início da campanha exige `campaignId` + `confirmedCount` iguais aos da campanha `READY`.
- Uma campanha por vez; uma instância do app por vez; nenhum teste durante uma campanha ativa.

## 3. Arquitetura

- `core/` é **puro**: sem `fs`, Electron ou Playwright. Tempo, sleep e I/O entram por injeção (`RunnerDeps`, `now()`).
- **Só `backend/whatsapp/`** importa `playwright-core` e conhece seletores do DOM.
- Seletores novos vão em [`selectors.ts`](../backend/whatsapp/selectors.ts), em ordem de prioridade, com variante PT **e** EN quando depender de texto.
- A interface não guarda estado de domínio: lê o `AppSnapshot` e chama `invoke()`. Regras de negócio ficam no main; a interface pode usar funções puras de `core/` só para exibir.
- Todo canal IPC novo: tipo em `core/ipc.ts` + schema Zod + handler em `electron/ipc.ts`. Payloads sempre validados; strings com `max()`.
- Toda leitura de JSON do disco passa por schema Zod. Toda escrita usa `writeJsonFile` (atômica).
- Mudança de estado da campanha só via `transition()`. Novas transições exigem atualizar a tabela e o teste da máquina de estados.

## 4. Código

- TypeScript **estrito**. Sem `any`; prefira `unknown` + narrowing.
- Funções pequenas, nomes claros, sem duplicação. Nada de lógica em `App.tsx`.
- Comentários só quando o **porquê** não é óbvio (ex.: por que `acceptCurrent`). Em inglês no código, seguindo o padrão atual.
- **Textos para o usuário em português do Brasil**: mensagens de erro, rótulos, logs em `app.log`, README e docs.
- Erros para o usuário usam `AppError` com uma mensagem que diz **o que fazer**. Erros inesperados são logados e mostrados de forma resumida (`shortErrorMessage`).
- Nunca logar conteúdo de mensagens do WhatsApp, cookies ou dados de sessão. Em diagnósticos do DOM, logar só atributos (veja `describeTextFields`, `describeLastMessages`).
- Componentes reutilizáveis ficam em `src/components/ui/`. Rótulos e cores de status ficam em `src/lib/labels.ts`.
- Estilo: Tailwind utilitário; siga os tokens de [DESIGN.md](DESIGN.md).

## 5. Testes

- Toda regra de `core/` e do `CampaignService` tem teste.
- **Nenhum teste envia mensagem real** ou abre o navegador: use `tests/helpers/mockWhatsAppService.ts`.
- Bug corrigido = teste que falhava antes.
- Antes de commitar, os três precisam estar limpos:
  ```bash
  npm run typecheck && npm run lint && npm run test
  ```
- Mudanças em `backend/whatsapp/` precisam de teste manual com WhatsApp Web real e envio de teste para o próprio número. Diga no PR se o teste real **não** foi feito.

## 6. Git e repositório

- Repositório: <https://github.com/AndersonMeloo/ApiShot>
- **Nunca** commitar `data/`, `.env`, `dist/`, `release/`, `node_modules/` (já estão no `.gitignore`). `data/browser-profile` contém a sessão do WhatsApp.
- Branch por tarefa (`feat/…`, `fix/…`, `docs/…`); a `main` sempre passa nas checagens.
- Mensagens de commit curtas, no imperativo, em português (ex.: `Corrige seletor do botão de anexar`).
- Atualize [TASKS.md](TASKS.md) ao concluir ou abrir trabalho e [MEMORY.md](MEMORY.md) ao tomar uma decisão.

## 7. Checklist de PR

- [ ] Não viola nenhuma regra da seção 1
- [ ] `typecheck`, `lint` e `test` passam
- [ ] Testes novos para regras novas
- [ ] Textos novos em PT-BR
- [ ] README/docs atualizados se o comportamento mudou
- [ ] Automação: testado com o WhatsApp Web real? (sim/não)
