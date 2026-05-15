# Deploy da integração GitHub App (Team Link)

A interface do Team Link (Vercel) **não publica** Edge Functions. As funções em `supabase/functions/` precisam ser implantadas no projeto Supabase com a CLI.

## Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) instalada
- Acesso ao projeto Supabase do Team Link
- GitHub App criado e configurado no GitHub

## 1. Login e link do projeto

```bash
supabase login
supabase link
```

O comando `link` pede o **project ref** do dashboard (Settings → General). Não commite o ref no repositório.

## 2. Secrets no Supabase

Defina os secrets **apenas** no Supabase (Dashboard → Edge Functions → Secrets, ou CLI):

| Secret | Origem |
|--------|--------|
| `SUPABASE_URL` | URL do projeto (geralmente já injetada automaticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (somente backend; nunca no front) |
| `SUPABASE_ANON_KEY` | Anon key (usada nas functions para validar JWT do usuário) |
| `GITHUB_APP_ID` | GitHub App → General → App ID |
| `GITHUB_APP_SLUG` | Slug na URL pública do app, ex.: `team-link-pi` em `github.com/apps/team-link-pi` |
| `GITHUB_PRIVATE_KEY` | Arquivo `.pem` gerado ao criar o GitHub App (conteúdo PEM completo) |
| `GITHUB_WEBHOOK_SECRET` | Mesmo valor configurado em Webhook → Secret no GitHub App |
| `GITHUB_STATE_SECRET` | Segredo aleatório forte (32+ caracteres) usado só para assinar o `state` do fluxo de instalação |

Exemplo via CLI (substitua os valores localmente; **não** commite):

```bash
supabase secrets set GITHUB_APP_ID=...
supabase secrets set GITHUB_APP_SLUG=...
supabase secrets set GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----"
supabase secrets set GITHUB_WEBHOOK_SECRET=...
supabase secrets set GITHUB_STATE_SECRET=...
```

Listar secrets configurados (nomes apenas):

```bash
npm run supabase:secrets:list
```

### O que **não** usar

- Token pessoal (PAT) do GitHub
- Senha da conta GitHub
- `service_role` no frontend Next.js
- Private key ou webhook secret no código ou na Vercel

O usuário final do Team Link **não vê** esses secrets.

## 3. Deploy das Edge Functions

Todas as funções GitHub do projeto:

```bash
npm run supabase:deploy:github
```

Ou uma a uma:

```bash
npm run supabase:deploy:github:start
supabase functions deploy github-complete-installation
supabase functions deploy github-link-selected-repository
supabase functions deploy github-link-repository
supabase functions deploy github-sync-repository
supabase functions deploy github-webhook
```

Funções esperadas no repositório:

- `github-start-installation` — inicia instalação (URL do GitHub + state)
- `github-complete-installation` — callback após instalação; lista repositórios
- `github-link-selected-repository` — vincula repositório escolhido ao projeto
- `github-link-repository` — modo legado (owner + repo manual)
- `github-sync-repository` — sincroniza commits
- `github-webhook` — eventos push do GitHub

## 4. Configuração do GitHub App

No GitHub → Settings → Developer settings → GitHub Apps → seu app:

| Campo | Valor sugerido |
|-------|----------------|
| **Setup URL** (Post installation) | `https://team-link-pi.vercel.app/github/setup` |
| **Webhook URL** | URL da function `github-webhook` no Supabase |
| **Webhook secret** | Igual a `GITHUB_WEBHOOK_SECRET` |
| **Repository permissions** | Metadata: Read · Contents: Read |
| **Repository access** | Only select repositories (usuário escolhe na instalação) |

## 5. Testar o fluxo

1. Entrar como **gestor** (dono ou admin) em `/projetos/[slug]/painel`
2. Clicar em **Conectar GitHub** → **Continuar com GitHub**
3. Instalar/configurar o app no GitHub e autorizar repositórios
4. Voltar em `/github/setup`, escolher repositório e visibilidade
5. Confirmar commits no painel

### Se aparecer erro ao iniciar

Mensagem na tela:

> Não foi possível iniciar a conexão com o GitHub. Verifique se a integração foi publicada e configurada.

Causas comuns:

1. Edge Functions **não deployadas** → rodar `npm run supabase:deploy:github`
2. Falta `GITHUB_APP_SLUG` ou `GITHUB_STATE_SECRET` nos secrets
3. Projeto Supabase do front (`.env`) diferente do projeto onde as functions foram deployadas
4. Usuário sem permissão de gestor no projeto

Em **desenvolvimento** (`npm run dev`), abra o console do navegador (F12) para ver função chamada, status HTTP e corpo da resposta (sem secrets).

## 6. Variáveis do frontend (Vercel)

O Next.js só precisa das variáveis públicas do Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Não configure secrets do GitHub App na Vercel para este fluxo.
