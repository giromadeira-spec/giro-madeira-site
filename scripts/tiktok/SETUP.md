# Integração TikTok — Giro Madeira (Sandbox/manual)

**Estado:** estrutura de teste instalada; não há postagem automática nem submissão para auditoria.
**Site:** https://giro-madeira.netlify.app/tiktok-integracao.html
**Código:** `scripts/tiktok/giro-tiktok-panel.ts` e `scripts/tiktok/giro-tiktok-callback.ts`
**Funções Supabase:** `giro-tiktok-panel` (JWT do editor obrigatório) e `giro-tiktok-callback` (OAuth state único, uso único).

## 1. TikTok for Developers
No aplicativo Giro Madeira, no ambiente **Sandbox**:
- Produto **Login Kit**, para web.
- Produto **Content Posting API**, com modalidade de **Upload de rascunho**.
- Scopes mínimos: `user.info.basic` e `video.upload`.
- Redirect URI do Login Kit (HTTPS e sem parâmetros):
  `https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-tiktok-callback`
- Web/Desktop URL: `https://giro-madeira.netlify.app/tiktok-integracao.html`
- Termos: `https://giro-madeira.netlify.app/termos-de-uso.html`
- Privacidade: `https://giro-madeira.netlify.app/politica-de-privacidade.html`
- Habilitar usuário de teste no Sandbox, conforme exigido pelo aplicativo.

## 2. Supabase → Edge Functions → Secrets
Configure, sem inserir os valores no chat, no código público ou em capturas:
- `TIKTOK_CLIENT_KEY` — chave do aplicativo TikTok selecionado (Sandbox para testes).
- `TIKTOK_CLIENT_SECRET` — segredo privado do mesmo aplicativo.

As funções já usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` fornecidas pelo ambiente do Supabase.
O segredo TikTok também é base da chave de criptografia dos tokens de acesso; ao rotacioná-lo será necessário reconectar a conta.

## 3. Teste real e demonstração
1. Verificar no Netlify se houve deploy das alterações do GitHub.
2. Entrar em https://giro-madeira.netlify.app/admin.html com editor autorizado.
3. Abrir https://giro-madeira.netlify.app/tiktok-integracao.html.
4. Clicar em **Conectar com TikTok**, autorizar os scopes e confirmar o nome da conta.
5. Escolher arquivo MP4 próprio de até 15 MB, sem marca-d'água nem logos aplicados pela ferramenta.
6. Confirmar envio MANUAL à caixa de entrada TikTok (`video.upload`).
7. Conferir o estado no painel e concluir a postagem no próprio TikTok se o ambiente de testes permitir.
8. Gravar a TELA do fluxo efetivamente executado e enviar MP4/MOV até 50 MB à revisão do TikTok.

O arquivo de vídeo de teste fornecido separadamente é somente um conteúdo de teste, NÃO é a gravação de demonstração que o TikTok exige.

## Segurança e limites
- Apenas usuários previamente autorizados em `editor_profiles` (admin/editor) acessam o painel.
- Nenhum token OAuth é entregue ao navegador; tokens persistidos cifrados em AES-GCM.
- `giro_tiktok_oauth_requests`, `giro_tiktok_connections` e `giro_tiktok_upload_log` possuem RLS e nenhum acesso a anon/authenticated.
- Sem CRON, publicação direta pública, sincronização automática ou alterações em pipelines existentes.
- Cada upload requer confirmação explícita, tem registro e bloqueio de duplicação por SHA-256.
- Submissão para uso público NÃO é garantida. O TikTok lista ferramentas internas para publicar apenas nas contas da própria equipe como uso não aceito para auditoria da API Direct Post.
- Para envio público automático com API `video.publish`, será necessária aprovação do TikTok e um caso de uso que atenda às políticas. O fluxo atual utiliza `video.upload`, dependente de confirmação no aplicativo TikTok.

Documentação oficial: https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content
