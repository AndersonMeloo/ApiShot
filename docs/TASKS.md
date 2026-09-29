# Tarefas — ApiShot

> Backlog vivo. Atualize ao abrir ou concluir trabalho. Prioridade: **P0** bloqueia o uso ou a publicação · **P1** importante · **P2** melhoria.

Estado verificado em **2026-09-29**: `typecheck` ✅ · `lint` ✅ · `test` ✅ (8 arquivos, 107 testes).

## ✅ Concluído (v1.0.0)

- [x] Importação de CSV com apelidos de colunas, separador automático e BOM
- [x] Normalização e validação de telefones BR e internacionais
- [x] Classificação: válido, inválido, duplicado, bloqueado, sem opt-in
- [x] Remover inválidos, exportar lista limpa, "não enviar novamente"
- [x] Editor com `{nome}`, pré-visualização e salvamento automático
- [x] Upload de imagem com validação de assinatura e tamanho
- [x] Envio de teste
- [x] Campanha com máquina de estados, pausar, continuar, cancelar e confirmação explícita
- [x] Tentativas limitadas com backoff; nunca repetir quando pode ter sido enviado
- [x] Recuperação após encerramento inesperado
- [x] Logs JSONL, resumo e exportação de relatório CSV
- [x] Automação Playwright com perfil persistente, legenda e plano B texto + imagem
- [x] Segurança do Electron (sandbox, CSP, IPC validado, instância única)
- [x] Renomeado para **ApiShot**
- [x] Documentação em `docs/`

## P0 — Publicar no GitHub

- [x] `git init`, primeiro commit e push para https://github.com/AndersonMeloo/ApiShot.git (2026-09-29)
- [x] Conferido que `data/`, `.env`, `dist/` e `release/` ficaram fora do commit
- [ ] Mover `Arquitetura.txt` (é o prompt/especificação original) para `docs/SPEC-ORIGINAL.md` ou removê-lo
- [ ] Escolher e adicionar uma `LICENSE`
- [ ] Renomear a pasta local `whatsapp-campaign-manager` para `apishot` (com o VS Code fechado)

## P1 — Qualidade e manutenção

- [ ] CI no GitHub Actions: `npm ci && npm run typecheck && npm run lint && npm run test` em push e PR
- [ ] Testes do `CampaignRunner` isolado (hoje coberto indiretamente via `CampaignService`)
- [ ] Testes de `pageActions` com DOM de fixture (Playwright + HTML estático, sem WhatsApp real) para `comparableText`, `classifyError`, `confirmSent`
- [ ] Renomear o atributo `data-wcm-caption` (resquício do nome antigo) para `data-apishot-caption`
- [ ] Guia "o WhatsApp Web mudou: como atualizar `selectors.ts`" (passo a passo com DevTools)
- [ ] Ícone do aplicativo para os instaladores (`build.icon` no electron-builder)
- [ ] Migração da pasta de dados antiga `%APPDATA%/WhatsApp Campaign Manager` para `%APPDATA%/ApiShot` na primeira execução (ou documentar a cópia manual)

## P2 — Produto

- [ ] Histórico de campanhas na interface (hoje o `LogViewer` só mostra a campanha atual; as antigas ficam em `data/logs/`)
- [ ] Mais variáveis de template a partir de colunas extras do CSV (ex.: `{produto}`), mantendo o bloqueio de variáveis desconhecidas
- [ ] Tela para ver a lista de bloqueio (somente leitura; remoção continua manual por regra)
- [ ] Tema escuro
- [ ] Aviso quando a mesma pessoa já recebeu uma campanha recente (consulta aos logs locais)
- [ ] Internacionalização (EN) da interface

## ❌ Não fazer (decisão de produto)

Veja [RULES.md §1](RULES.md#1-ética-e-uso-responsável-inegociável). Pedidos como "modo invisível/headless para envio", "evitar ban", "aumentar o limite automaticamente", "login automático" e "enviar para lista comprada" devem ser recusados.
