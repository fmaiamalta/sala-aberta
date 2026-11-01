// Desenha um mapa com estações e grupos. Usado pelo professor, pela projeção e pelos alunos.
// el: contentor; d: {url, estacoes:[{nome,x,y}], grupos:[{slot,cor,nome,pos,trilho}], nomes, atual, alvo}
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.desenharMapa = function (el, d) {
    if (el._url !== d.url) {
      el.classList.add('mapa');
      el.innerHTML = `<img alt="Mapa" src="${esc(d.url)}"><svg class="trilhos" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="camada"></div>`;
      el._url = d.url;
    }
    const est = d.estacoes || [];
    const grupos = d.grupos || [];
    // trilhos
    el.querySelector('.trilhos').innerHTML = grupos.map((g, gi) => {
      if (!g.trilho || g.trilho.length < 2) return '';
      const off = (gi - (grupos.length - 1) / 2) * 0.6; // afasta linhas sobrepostas
      const pts = g.trilho.map((i) => `${est[i].x + off},${est[i].y + off}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${g.cor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".75" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    // estações
    let h = est.map((e, i) => {
      const cls = ['est', i === d.atual ? 'atual' : '', i === d.alvo ? 'alvo' : ''].join(' ');
      return `<div class="${cls}" data-i="${i}" style="left:${e.x}%;top:${e.y}%"><span class="pt"></span>${d.nomes !== false ? `<span class="rot">${esc(e.nome)}</span>` : ''}</div>`;
    }).join('');
    // grupos: os que estão na mesma estação ficam à volta dela
    const porEst = {};
    grupos.forEach((g) => { if (g.pos != null) (porEst[g.pos] = porEst[g.pos] || []).push(g); });
    for (const [i, lista] of Object.entries(porEst)) {
      const e = est[i]; if (!e) continue;
      lista.forEach((g, k) => {
        const ang = (k / lista.length) * 2 * Math.PI - Math.PI / 2;
        const r = lista.length > 1 ? 16 : 0;
        h += `<div class="grp" title="${esc(g.nome)}" style="left:${e.x}%;top:${e.y}%;background:${g.cor};transform:translate(calc(-50% + ${(Math.cos(ang) * r).toFixed(1)}px), calc(-50% + ${(Math.sin(ang) * r).toFixed(1)}px))">${g.slot + 1}</div>`;
      });
    }
    el.querySelector('.camada').innerHTML = h;
  };
})();
