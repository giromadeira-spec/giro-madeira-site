const IMAGE_GUARD = `
<style>
  img.giro-image-fallback{
    box-sizing:border-box!important;
    object-fit:contain!important;
    padding:18px!important;
    background:linear-gradient(135deg,#071d3a 0%,#0d3159 72%,#f4c21d 72%,#f4c21d 76%,#071d3a 76%,#071d3a 100%)!important;
  }
</style>
<script>
(()=>{
  const repairs = [
    {
      match: 'BR-364%20em%20Rond%C3%B4nia.jpg',
      src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Br364.jpg?width=1600'
    },
    {
      match: 'Petrobras%20headquarters.jpg',
      src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Sede%20da%20Petrobras.jpg?width=1600'
    }
  ];

  const fallback = (img) => {
    if (!img || img.dataset.giroFallback === '1') return;
    img.dataset.giroFallback = '1';
    img.removeAttribute('srcset');
    img.classList.add('giro-image-fallback');
    img.alt = 'Giro Madeira';
    img.src = '/assets/logo-oficial.webp';
  };

  const repair = (img) => {
    if (!img || img.tagName !== 'IMG') return;
    const current = img.currentSrc || img.src || '';
    if (img.dataset.giroRetry !== '1') {
      const known = repairs.find((item) => current.includes(item.match));
      if (known) {
        img.dataset.giroRetry = '1';
        img.removeAttribute('srcset');
        img.src = known.src;
        return;
      }
    }
    fallback(img);
  };

  document.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target.tagName === 'IMG') repair(target);
  }, true);

  const checkExisting = () => {
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) repair(img);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkExisting, { once:true });
  } else {
    checkExisting();
  }
  window.addEventListener('load', checkExisting, { once:true });
})();
<\/script>`;

export default async (request, context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const html = await response.text();
  if (html.includes('giro-image-fallback')) return new Response(html, response);

  const transformed = html.includes('</body>')
    ? html.replace('</body>', `${IMAGE_GUARD}</body>`)
    : `${html}${IMAGE_GUARD}`;

  const headers = new Headers(response.headers);
  headers.set('cache-control', 'public, max-age=60');
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

export const config = {
  path: ['/', '/index.html', '/materia.html'],
  onError: 'bypass'
};
