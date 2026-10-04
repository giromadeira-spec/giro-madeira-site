const FOOTER_HTML = `
<footer class="gm-footer" aria-label="Rodapé Giro Madeira">
  <style>
    .gm-footer{background:#04152b;color:#cbd5e1;border-top:4px solid #ffc400;font-family:Inter,Arial,Helvetica,sans-serif}
    .gm-footer *{box-sizing:border-box}.gm-footer a{color:#cbd5e1;text-decoration:none}.gm-footer a:hover{color:#ffc400}
    .gm-footer-wrap{max-width:1180px;margin:auto;padding:38px 20px 20px}
    .gm-footer-grid{display:grid;grid-template-columns:1.45fr 1fr 1fr 1fr;gap:34px;padding-bottom:28px}
    .gm-footer-brand{display:flex;align-items:flex-start;gap:14px}.gm-footer-logo{width:64px;height:64px;object-fit:contain;border-radius:9px;flex:0 0 64px}
    .gm-footer-name{font-size:22px;line-height:1;font-weight:1000;color:#fff;letter-spacing:-.4px;margin:5px 0 7px}.gm-footer-tagline{font-size:13px;line-height:1.55;color:#9fb0c5;max-width:285px;margin:0}
    .gm-footer-title{margin:0 0 13px;color:#ffc400;font-size:12px;font-weight:1000;text-transform:uppercase;letter-spacing:1px}
    .gm-footer-links{display:grid;gap:9px;font-size:13px}.gm-footer-note{font-size:12px;line-height:1.55;color:#8fa2b9;margin-top:12px}
    .gm-footer-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;padding:10px 13px;border-radius:6px;background:#ffc400;color:#071d3a!important;font-size:12px;font-weight:1000;text-transform:uppercase;letter-spacing:.35px}
    .gm-footer-bottom{border-top:1px solid rgba(255,255,255,.11);padding-top:18px;display:flex;justify-content:space-between;align-items:center;gap:18px;font-size:11px;color:#8497ae}
    .gm-footer-motto{color:#cbd5e1;font-weight:800}.gm-footer-social{display:inline-flex;align-items:center;gap:7px}.gm-footer-social-dot{width:8px;height:8px;border-radius:50%;background:#ffc400}
    @media(max-width:900px){.gm-footer-grid{grid-template-columns:1.4fr 1fr 1fr}.gm-footer-about{grid-column:1/-1}.gm-footer-about .gm-footer-brand{max-width:520px}}
    @media(max-width:620px){.gm-footer-wrap{padding:30px 18px 18px}.gm-footer-grid{grid-template-columns:1fr 1fr;gap:28px 20px}.gm-footer-about{grid-column:1/-1}.gm-footer-bottom{display:block;line-height:1.7}.gm-footer-motto{display:block;margin-top:7px}.gm-footer-logo{width:58px;height:58px;flex-basis:58px}}
  </style>
  <div class="gm-footer-wrap">
    <div class="gm-footer-grid">
      <section class="gm-footer-about">
        <div class="gm-footer-brand">
          <img class="gm-footer-logo" src="/assets/logo-oficial.webp" alt="Giro Madeira">
          <div><div class="gm-footer-name">GIRO MADEIRA</div><p class="gm-footer-tagline">Informação de Porto Velho, Rondônia, Brasil e Mundo. Notícias, serviço e contexto para você acompanhar o que importa.</p></div>
        </div>
        <p class="gm-footer-note">Porto Velho em primeiro lugar. Rondônia sempre no radar.</p>
      </section>
      <section><h2 class="gm-footer-title">Editorias</h2><nav class="gm-footer-links"><a href="/index.html#ultimas">Últimas notícias</a><a href="/index.html#porto-velho">Porto Velho</a><a href="/index.html#rondonia">Rondônia</a><a href="/index.html#economia">Economia</a><a href="/index.html#servico">Serviço</a><a href="/index.html#entretenimento">Entretenimento</a></nav></section>
      <section><h2 class="gm-footer-title">Giro Madeira</h2><div class="gm-footer-links"><a href="mailto:giromadeira@gmail.com?subject=Contato%20com%20a%20redação">Contato com a redação</a><a href="mailto:giromadeira@gmail.com?subject=Envio%20de%20pauta">Envie uma pauta</a><a href="mailto:giromadeira@gmail.com?subject=Anuncie%20no%20Giro%20Madeira">Anuncie conosco</a><span>Política de correções</span><span>Fontes e créditos</span></div></section>
      <section><h2 class="gm-footer-title">Acompanhe</h2><div class="gm-footer-links"><a href="https://www.instagram.com/giro_madeira/" target="_blank" rel="noopener noreferrer"><span class="gm-footer-social"><span class="gm-footer-social-dot"></span>@giro_madeira no Instagram</span></a><a href="mailto:giromadeira@gmail.com">giromadeira@gmail.com</a></div><a class="gm-footer-cta" href="mailto:giromadeira@gmail.com?subject=Quero%20anunciar%20no%20Giro%20Madeira">Quero anunciar</a></section>
    </div>
    <div class="gm-footer-bottom"><span>© 2026 Giro Madeira — Todos os direitos reservados.</span><span class="gm-footer-motto">Notícia rápida. Informação com responsabilidade.</span></div>
  </div>
</footer>`;

export default async (request, context) => {
  const response = await context.next();
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('class="gm-footer"')) return new Response(html, response);
  const footerPattern = /<footer class="footer">[\s\S]*?<\/footer>/i;
  if (!footerPattern.test(html)) return new Response(html, response);
  const headers = new Headers(response.headers);
  headers.set('cache-control','public, max-age=60');
  return new Response(html.replace(footerPattern, FOOTER_HTML), {status:response.status,statusText:response.statusText,headers});
};

export const config = { path: ["/", "/index.html", "/materia.html"], onError: "bypass" };
