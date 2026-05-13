/** @type {import("next").NextConfig} */
const nextConfig = {
  // O projeto agora consome dados reais do Supabase (auth + projetos).
  // Removemos `output: "export"` para permitir rotas dinâmicas
  // (ex.: /projetos/[slug]) acessarem registros criados após o deploy.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
