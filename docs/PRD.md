# PRD — ApiShot

> Documento de requisitos do produto. Descreve **o quê** e **por quê**. O **como** está em [ARCHITECTURE.md](ARCHITECTURE.md).

Repositório: <https://github.com/AndersonMeloo/ApiShot>

## 1. Visão

ApiShot é um aplicativo desktop **local** que ajuda pequenos negócios a enviar campanhas pelo WhatsApp Web para clientes que **autorizaram** receber mensagens. O app transforma uma planilha de contatos em uma campanha personalizada, com imagem, teste prévio e controle total sobre o envio. Tudo roda no computador do usuário.

## 2. Problema

Quem vende pelo WhatsApp costuma avisar os clientes sobre novidades de forma manual: copia a mensagem, abre conversa por conversa, anexa a imagem e troca o nome. Isso é lento e gera erros (nome errado, imagem esquecida, mensagem duplicada, envio para quem pediu para sair).

As alternativas pagas (APIs oficiais, SaaS de disparo) exigem conta empresarial, custo por mensagem e envio dos contatos a terceiros.

## 3. Público-alvo

- **Usuário principal:** dono ou atendente de um pequeno comércio, sem conhecimento técnico, que já usa o WhatsApp Web no computador.
- **Usuário secundário:** desenvolvedor que mantém o app (atualiza os seletores quando o WhatsApp Web muda, gera instaladores).

## 4. Objetivos

| # | Objetivo | Como medimos |
|---|---|---|
| O1 | Enviar uma campanha personalizada sem trabalho manual contato a contato | Campanha de 50 contatos concluída só com a interface |
| O2 | Nunca enviar para quem não autorizou ou pediu para sair | 0 envios para `optIn=false` ou para números em `blocked.json` (garantido por testes) |
| O3 | Nunca enviar a mesma mensagem duas vezes para o mesmo contato | Nenhuma nova tentativa quando `messageMayHaveBeenSent = true` |
| O4 | Manter os dados do usuário no computador dele | Nenhuma chamada de rede além do WhatsApp Web |
| O5 | Falhar de forma clara quando o WhatsApp Web mudar | Erro `UI_CHANGED` com o nome do elemento, e a campanha para |

## 5. Fora de escopo (não objetivos)

Estes itens são **proibidos** por decisão de produto (veja [RULES.md](RULES.md)):

- burlar CAPTCHA, bloqueios, limites ou sistemas anti-spam do WhatsApp;
- esconder ou disfarçar a automação (stealth, fingerprint falso, user agent falso);
- login automático, captura de QR code, tokens ou credenciais;
- criar contas, coletar ou gerar números;
- backend em nuvem, banco de dados externo, APIs pagas, analytics.

Também fora de escopo por enquanto: agendamento de campanhas, múltiplas contas de WhatsApp, respostas automáticas, envio de vídeo, áudio ou documentos.

## 6. Requisitos funcionais

### RF1 — Contatos
- Importar CSV (`,` `;` tab `|`, UTF-8 com ou sem BOM, até 5 MB e 5.000 linhas).
- Colunas por apelido: `nome|name|cliente|contato`, `telefone|phone|celular|whatsapp|numero|fone|tel`, `optIn|consentimento|autorizado|autorizacao`.
- Aceitar uma lista de números sem cabeçalho.
- Normalizar telefones (sem `+` = Brasil; com `+` = internacional) para apenas dígitos, ex.: `5511999999999`.
- Classificar cada linha como `VALID`, `INVALID`, `DUPLICATE`, `BLOCKED` ou `NO_OPT_IN`, mostrar os totais e uma tabela paginada.
- Remover inválidos e duplicados; exportar a lista limpa em CSV.
- "Não enviar novamente": adiciona o número a `blocked.json`.

### RF2 — Mensagem
- Editor com contador (máx. 4.096 caracteres) e salvamento automático do rascunho.
- Variável única `{nome}`. Sem nome, a variável e o separador saem da frase (`Olá, {nome}!` vira `Olá!`).
- Variável desconhecida bloqueia a campanha.
- Pré-visualização em tempo real, no formato de balão do WhatsApp.

### RF3 — Imagem
- JPG, JPEG, PNG ou WEBP, até `MAX_IMAGE_SIZE_MB` (padrão 5 MB, máx. 16).
- Tipo conferido pela assinatura binária, não só pela extensão.
- Cópia salva em `data/media/`; preview e botão para remover.

### RF4 — Teste
- Envio único para um número informado, com a mensagem e a imagem atuais.
- Registrado em `data/logs/testes.jsonl`.

### RF5 — Campanha
- Preparar: valida tudo e cria uma campanha `READY`.
- Confirmação explícita com a quantidade exata de contatos, a prévia e uma caixa de confirmação.
- Iniciar, pausar, continuar e cancelar. Pausa e cancelamento esperam o envio atual terminar.
- Progresso em tempo real: 🟢 enviado · 🔴 falhou · 🟡 pendente · ⚪ ignorado.
- Uma campanha por vez e uma instância do app por vez.

### RF6 — Registros
- Um log JSONL por campanha e um resumo JSON.
- Visualizador na interface e exportação de relatório em CSV.
- `app.log` com eventos técnicos, sem dados de sessão.

### RF7 — Recuperação
- Se o app fechar durante uma campanha, ela reabre **pausada**.
- O contato que estava em envio vira `FAILED` com "verifique manualmente" e **não é reenviado**.

## 7. Requisitos não funcionais

| Categoria | Requisito |
|---|---|
| Privacidade | Dados apenas em `data/`. Nada sai do computador além do tráfego do WhatsApp Web. |
| Segurança | Electron com `contextIsolation`, `sandbox`, CSP, IPC com canal permitido + validação Zod + checagem de origem. |
| Confiabilidade | Escrita atômica de JSON; estado salvo a cada mudança; tentativas limitadas (≤ 3) com backoff exponencial. |
| Ritmo | Intervalo mínimo de 10 s entre mensagens (padrão 20 s). Limite por campanha: padrão 50, máx. 1.000. |
| Portabilidade | Windows (NSIS), macOS (DMG), Linux (AppImage). |
| Idioma | Interface, mensagens de erro e documentação para o usuário em **português do Brasil**. |
| Qualidade | TypeScript estrito, ESLint, testes Vitest sem nenhum envio real. |

## 8. Fluxo principal

```
Conectar WhatsApp (QR manual) → Importar CSV → Revisar contatos → Escrever mensagem
→ Selecionar imagem → Enviar teste → Iniciar campanha → Confirmar N contatos
→ Acompanhar progresso (pausar/continuar/cancelar) → Exportar relatório
```

## 9. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| WhatsApp Web muda o DOM | Envio para | Seletores centralizados em `selectors.ts`; erro `UI_CHANGED` nomeia o elemento; logs com a estrutura dos campos, sem o texto |
| Conta do usuário restringida pelo WhatsApp | Alto | Limites conservadores, intervalo mínimo, apenas contatos opt-in, sem ocultar a automação |
| Mensagem duplicada | Médio | Nunca repetir após `messageMayHaveBeenSent`; recuperação marca o envio interrompido como `FAILED` |
| Uso para spam | Alto (ético/legal) | Consentimento obrigatório, lista de bloqueio permanente, sem coleta de números |
| LGPD | Médio | Dados locais, sem terceiros; o usuário é o controlador dos dados |
