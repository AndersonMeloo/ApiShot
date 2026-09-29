# Design — ApiShot

> Linguagem visual e padrões de UX da interface. Base: React 19 + Tailwind CSS v4 (sem biblioteca de componentes).

## 1. Princípios

1. **Passo a passo.** A tela segue a ordem do trabalho: Contatos → Mensagem → Imagem → Teste → Campanha. Os cards numerados (1–5) guiam o usuário.
2. **Sem surpresa.** O usuário sempre vê exatamente o que será enviado (pré-visualização em balão do WhatsApp) e para quantas pessoas antes de confirmar.
3. **Estado sempre visível.** Conexão do WhatsApp no cabeçalho, status da campanha no card 5 e progresso em tempo real.
4. **Erros dizem o que fazer.** Toda mensagem de erro explica a causa e a próxima ação ("Clique em Conectar WhatsApp e faça login").
5. **Ações perigosas custam um passo a mais.** Iniciar exige confirmação com caixa marcada; cancelar pede confirmação; botões ficam desabilitados com o motivo escrito embaixo.

## 2. Layout

```
┌──────────────── Header (sticky) ────────────────────────────────────┐
│ ApiShot · uso local · N bloqueados          [WhatsApp: 🟢 Conectado] │
├──────────────────────────────────────┬──────────────────────────────┤
│ 1. Contatos (importar, totais,       │ Pré-visualização (balão)     │
│    tabela paginada)                  │ 4. Enviar teste              │
│ 2. Mensagem (editor + {nome})        │ 5. Campanha (status, botões) │
│ 3. Imagem (seletor + preview)        │ Progresso (se houver)        │
│                                      │ Configurações de segurança   │
│            lg:col-span-7             │        lg:col-span-5         │
├──────────────────────────────────────┴──────────────────────────────┤
│ Registros (logs) — lg:col-span-12                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Contêiner: `max-w-[1600px] mx-auto p-6`, grid de 12 colunas a partir de `lg`, `gap-6`.
- Janela mínima: 1080 × 700 (definida no Electron); padrão 1440 × 920.

## 3. Tokens

### Cores (paleta Tailwind)
| Papel | Classe | Uso |
|---|---|---|
| Fundo da página | `bg-slate-100` | body, main |
| Superfície | `bg-white`, borda `border-slate-200` | cards, header |
| Texto principal | `text-slate-900` | títulos |
| Texto secundário | `text-slate-500` / `600` | descrições, legendas |
| Primária / sucesso | `emerald-600` (hover `700`) | botão principal, número do passo, 🟢 |
| Perigo | `red-600` | cancelar, 🔴 |
| Aviso | `amber-500` | pausar, 🟡 |
| Informação | `sky-*` | status "Validando", "Pronta" |
| Neutro | `slate-*` | ignorado, bloqueado, ⚪ |

Tons de status (`Tone` em `src/lib/labels.ts`): `green | red | yellow | gray | blue`, aplicados como `bg-*-50 text-*-700 ring-*-200` (`TONE_STYLES` em `Badge.tsx`).

### Tipografia
- Fonte: `'Segoe UI', system-ui, -apple-system, …, 'Segoe UI Emoji'` (`--font-sans` em `styles/index.css`).
- Título do app: `text-lg font-semibold`. Título do card: `font-semibold`. Descrição: `text-sm text-slate-500`. Legendas e ajuda: `text-xs`.

### Forma
- Cards: `rounded-xl border shadow-sm`, header `px-5 py-4` com `border-b border-slate-100`, corpo `p-5`.
- Botões: `rounded-lg`, `md` = `px-4 py-2 text-sm`, `sm` = `px-2.5 py-1 text-xs`.
- Badges: `rounded-full px-2 py-0.5 text-xs ring-1`.
- Tema: somente claro (`color-scheme: light`).

## 4. Status: a linguagem principal

| Emoji | Significado | Status internos |
|---|---|---|
| 🟢 | Enviado / conectado | `SUCCESS`, `CONNECTED` |
| 🔴 | Falhou / erro | `FAILED`, `ERROR` |
| 🟡 | Pendente / em andamento | `PENDING`, `SENDING`, `OPENING`, `WAITING_LOGIN` |
| ⚪ | Ignorado / neutro | `INVALID`, `SKIPPED`, `CANCELLED`, `CLOSED` |

Emoji **e** texto sempre juntos (acessibilidade: nunca só cor). Fonte única: `RECIPIENT_STATUS`, `CONTACT_STATUS`, `CAMPAIGN_STATUS`, `WHATSAPP_STATUS` em `src/lib/labels.ts`.

## 5. Componentes base (`src/components/ui/`)

| Componente | Uso | Variantes |
|---|---|---|
| `Button` | Toda ação | `primary`, `secondary`, `danger`, `warning`, `ghost`; `loading` mostra spinner e desabilita |
| `Card` | Cada seção | `step` opcional (círculo numerado), `description`, `actions` |
| `Badge` / `StatusBadge` | Status | por `Tone` |
| `Notice` | Avisos em linha | `error`, `warning`, `info`… |
| `ConfirmDialog` | Confirmação de iniciar/cancelar | — |
| `Stat` | Número + rótulo (Contatos, Prontos…) | `tone` |
| `ProgressBar` | Progresso da campanha | — |
| `Pagination` | Tabelas de contatos e logs | — |

Notificações (toasts) ficam no canto inferior direito, com no máximo 5 visíveis; somem em 5 s (sucesso), 6 s (info) ou 12 s (erro); `aria-live="polite"`.

## 6. Padrões de interação

- **Proteção contra duplo clique:** toda ação usa `useAction()`. Cliques repetidos enquanto está `pending` são ignorados, e o botão mostra `loading`. O backend também rejeita ações sobrepostas.
- **Botão desabilitado explica o motivo:** ex. "Conecte o WhatsApp Web antes de iniciar." (`startBlockedReason`).
- **Salvamento automático:** a mensagem salva 500 ms após parar de digitar, sem botão "Salvar".
- **Confirmação de campanha:** o diálogo mostra "Você está prestes a iniciar uma campanha para **N** contatos. Confirma?", a prévia para o primeiro contato, a imagem e uma caixa obrigatória.
- **Configurações travadas** durante `RUNNING`.

## 7. Texto e tom

- Português do Brasil, frases curtas, voz ativa, tratamento por "você".
- Erro = causa + ação. Evite jargão ("seletor", "IPC") em textos para o usuário final, exceto em detalhes técnicos entre parênteses.
- Números com rótulo: "155 / 250", "Enviados: 151".

## 8. Melhorias de design sugeridas

Veja também [TASKS.md](TASKS.md).
- Tema escuro (tokens já concentrados em poucas classes).
- Ícone e identidade visual própria do ApiShot (hoje sem logo; o nome não deve usar a marca WhatsApp).
- Navegação por teclado e foco visível revisados em todos os diálogos.
