# Team Link

Plataforma web para **publicação**, **descoberta** e **formação de equipes** em projetos colaborativos — identidade visual focada em confiança, tecnologia e organização acadêmica.

## Funcionalidades (front-end)

- Home com hero, destaques, como funciona e CTA
- **Explorar** (`/explorar`): busca, filtros e ordenação sobre dados mockados
- **Nova ideia** (`/nova-ideia`): formulário com validação client-side e preview (sem persistência/backend)

## Stack

- **Next.js** 15 (App Router) + **React** 19 + **TypeScript**
- **Tailwind CSS** 4 + componentes estilo **shadcn/ui** (Radix)
- **Framer Motion** e **Lenis** (scroll suave)

## Como executar

```bash
npm install
npm run dev
```

Build de produção (gera saída estática conforme `next.config.mjs`):

```bash
npm run build
```

Servir export estático: use a pasta `out/` no provedor de hospedagem ou configure preview conforme a documentação do Next.js.

## Variáveis de ambiente

Não são necessárias na versão atual (sem backend).

## Deploy

Projeto configurado com `output: "export"` em `next.config.mjs` para site estático. URLs de exemplo em `sitemap.xml` e `robots.txt`: `https://team-link.vercel.app` — ajuste para o domínio real ao publicar.

## Licença

MIT — ver `LICENSE`.
