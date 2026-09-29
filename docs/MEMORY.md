# Memória do projeto — ApiShot

> Contexto e decisões que **não são óbvios lendo o código**. Leia no início de cada sessão de trabalho (humano ou IA). Adicione entradas novas no topo do registro de decisões, com data.

## Resumo em 30 segundos

- **O que é:** app desktop (Electron + React) que envia campanhas pelo WhatsApp Web, via Playwright, para contatos com opt-in. 100% local.
- **Repositório:** <https://github.com/AndersonMeloo/ApiShot> · Autor: Anderson Melo.
- **Nome anterior:** *WhatsApp Campaign Manager*. A pasta local ainda se chama `whatsapp-campaign-manager`.
- **Onde começar a ler:** [core/campaignRunner.ts](../core/campaignRunner.ts) (o coração), [backend/campaignService.ts](../backend/campaignService.ts) (as proteções), [backend/whatsapp/playwrightWhatsAppService.ts](../backend/whatsapp/playwrightWhatsAppService.ts) (a automação).
- **Comandos:** `npm run dev` · `npm run typecheck && npm run lint && npm run test` · `npm run package`.
- **Estado:** v1.0.0 funcional. Checagens verdes em 2026-09-29 (107 testes). Ainda não versionado em git.

## Mapa de documentos

| Doc | Para quê |
|---|---|
| [PRD.md](PRD.md) | O que o produto faz e por quê |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Como funciona por dentro |
| [RULES.md](RULES.md) | O que é proibido e como escrever código aqui |
| [DESIGN.md](DESIGN.md) | Interface e UX |
| [TASKS.md](TASKS.md) | Backlog |
| [../README.md](../README.md) | Manual do usuário |
| `../Arquitetura.txt` | Especificação/prompt original que gerou o projeto |

## Registro de decisões

| Data | Decisão | Motivo |
|---|---|---|
| 2026-09-29 | Projeto renomeado para **ApiShot** (`name: apishot`, `appId: local.apishot`) | A Meta não permite "WhatsApp" no nome de produtos de terceiros. Efeito colateral: a pasta de dados do app instalado mudou para `%APPDATA%/ApiShot` |
| 2026-09-29 | Documentação criada em `docs/` | Onboarding e contexto para contribuidores e agentes de IA |
| 2026-09-28 | Playwright com navegador **visível** e perfil persistente em `data/browser-profile` | Login manual por QR; nada de esconder a automação |
| 2026-09-28 | `core/` independente de Playwright via interface `WhatsAppService` | Testar o runner com mock, sem enviar mensagens reais |
| 2026-09-28 | JSON/JSONL local com escrita atômica, sem banco | Requisito "sem banco externo"; simples de inspecionar e recuperar |
| 2026-09-28 | `blocked.json` com política **fail** (não reseta se corrompido) | Resetar apagaria opt-outs, o que seria pior que parar |
| 2026-09-28 | Texto sem imagem usa `send?phone=…&text=…` e aceita o texto pré-preenchido | Evita digitar em um editor que o WhatsApp já preencheu (duplicaria o texto) |
| 2026-09-28 | Preencher campos colando (evento `paste`) antes de digitar | Digitar linha a linha perdia a primeira linha em alguns casos; `fillAndVerify` confere o resultado |
| 2026-09-28 | Confirmação de envio por snapshot de `#main [data-id]` (quantidade/último id) + ausência de `msg-time` | O WhatsApp Web deixou de distinguir mensagens enviadas e recebidas por id ou classe |
| 2026-09-28 | Plano B sem legenda: fecha o preview, envia o texto e depois a imagem | Melhor duas mensagens do que nenhuma; falha parcial é reportada e não repetida |
| 2026-09-28 | Padrões: 50 contatos por campanha, 20 s de intervalo, 2 retries, backoff de 15 s, timeout de 45 s | Conservadores de propósito, para proteger a conta do usuário |

## Armadilhas conhecidas

- **Alterações em `electron/`, `backend/` ou `core/` exigem reiniciar `npm run dev`.** Só o renderer tem HMR.
- O preload é sandboxed e **não pode importar** módulos do projeto. Por isso `IPC_PREFIX` está duplicado em `electron/preload.ts` e `core/ipc.ts`; mantenha os dois iguais.
- O main é compilado para **CommonJS** (`dist/main/package.json` com `type: commonjs`), embora o projeto seja `"type": "module"`.
- `playwright-core` precisa ficar fora do asar (`asarUnpack`); o navegador vem de `npm run setup:browser` ou de `BROWSER_CHANNEL=chrome|msedge`.
- **Windows:** `rename` pode falhar com EPERM/EBUSY (antivírus, indexador). `writeJsonFile` tenta de novo 3 vezes.
- "Perfil já em uso": outra janela do Chromium com o mesmo `browser-profile` está aberta.
- Números do Excel em notação científica (`5,511E+12`) chegam inválidos. A orientação ao usuário é formatar a coluna como Texto.
- Os seletores do WhatsApp Web **vão quebrar** com o tempo. Os logs de `app.log` (`describeTextFields`, `describeLastMessages`) trazem os atributos do DOM para ajudar a corrigir, sem o texto das mensagens.
- `data/` já contém dados reais de uso (logs, campanhas, sessão). Nunca commitar.

## Glossário

| Termo | Significado |
|---|---|
| Opt-in | Contato autorizou receber mensagens (`optIn=true`) |
| Opt-out / bloqueio | Número em `blocked.json`; nunca recebe |
| Elegível | Contato que vai de fato receber na campanha |
| Recipient | Contato dentro de uma campanha, com status de envio |
| Snapshot | `AppSnapshot`, o estado completo enviado do main para a interface |
| `messageMayHaveBeenSent` | Flag que proíbe nova tentativa: o clique ou Enter de envio já aconteceu |
| Fatal | Erro que para a campanha inteira (`ERROR`): desconectado, navegador fechado, interface mudou |
