Configuração necessária (não inserir segredos no repositório):

1. Gerar um par VAPID usando `web-push` e configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `PUSH_DISPATCH_SECRET` nos secrets das Edge Functions.
2. Guardar o mesmo `PUSH_DISPATCH_SECRET` no Supabase Vault com o nome `push_dispatch_secret`.
3. Habilitar `pg_net` e agendar pelo Cron, a cada minuto, um `net.http_post` para `https://yjvtjqvkclkujcttvtwi.supabase.co/functions/v1/push-delivery`, com Authorization Bearer lido do Vault. A chave deve ser lida em execução, nunca escrita literalmente no comando do job.
4. Validar uma assinatura de dispositivo controlado e ao menos um recebimento real antes de anunciar o envio como operacional.

O endpoint GET fornece somente a chave pública quando os três secrets estão configurados. POST usa autenticação própria por segredo de despacho; publicar com `verify_jwt=false`. Não usar chaves administrativas no navegador.

A fila é processada em lotes de 30, com lease de 5 minutos, até 5 tentativas e descarte após 24 horas. Push é entrega de melhor esforço: em falhas de rede ambíguas pode haver reenvio; a tag por notificação permite substituição no dispositivo.
