/** @type {import("next").NextConfig} */
const nextConfig = {
  // O projeto agora consome dados reais do Supabase (auth + projetos).
  // Removemos `output: "export"` para permitir rotas dinâmicas
  // (ex.: /projetos/[slug]) acessarem registros criados após o deploy.
  images: {
    unoptimized: true,
  },
  async headers() { return [{ source:'/sw.js',headers:[{key:'Cache-Control',value:'no-store'},{key:'Service-Worker-Allowed',value:'/'}] }] },
};

export default nextConfig;
