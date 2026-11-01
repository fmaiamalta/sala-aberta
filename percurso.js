// Modo Percurso: um navegador por grupo guia um caminhante (sem aparelho) de estação em estação.
// Em cada estação há um cartão dobrado com um código por grupo. O navegador escreve o código na app.

const CORES = [
  { nome: 'Vermelho', hex: '#d93025' },
  { nome: 'Azul', hex: '#1a73e8' },
  { nome: 'Verde', hex: '#188038' },
  { nome: 'Amarelo', hex: '#e3a008' },
  { nome: 'Roxo', hex: '#8e24aa' },
  { nome: 'Laranja', hex: '#e8710a' },
  { nome: 'Rosa', hex: '#d01884' },
  { nome: 'Ciano', hex: '#0f9aa5' },
];
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXZ'; // sem I, O, Q, Y (confundem-se)
const DIGITOS = '23456789'; // sem 0 e 1
const PENALIZACAO_ERRADA = 15000; // estação errada
const PENALIZACAO_DESCONHECIDO = 5000; // código que não existe

const now = () => Date.now();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function baralhar(l) {
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}
// codigos[grupo][estacao]: todos diferentes na sala, para se saber a estação e a cor de cada código
function gerarCodigos(nGrupos, nEst) {
  const todos = [];
  for (const l of LETRAS) for (const d of DIGITOS) todos.push(l + d); // 176 códigos de 2 caracteres
  if (nGrupos * nEst > todos.length) { // salas muito grandes: 3 caracteres
    for (const l of LETRAS) for (const d of DIGITOS) for (const e of DIGITOS) todos.push(l + d + e);
  }
  const b = baralhar(todos);
  return Array.from({ length: nGrupos }, (_, g) => b.slice(g * nEst, (g + 1) * nEst));
}

function preparar(sala, b) {
  const estacoes = Array.isArray(b.estacoes) ? b.estacoes : [];
  if (estacoes.length < 2 || estacoes.length > 40) throw new Error('O mapa precisa de 2 a 40 estações.');
  const est = estacoes.map((e) => ({
    nome: String(e.nome || '').trim().slice(0, 40),
    x: Math.max(0, Math.min(100, Number(e.x) || 0)),
    y: Math.max(0, Math.min(100, Number(e.y) || 0)),
  }));
  if (est.some((e) => !e.nome)) throw new Error('Todas as estações precisam de nome.');
  if (new Set(est.map((e) => e.nome.toLowerCase())).size !== est.length) throw new Error('Há estações com o mesmo nome.');

  const missoes = (Array.isArray(b.missoes) ? b.missoes : []).map((m) => ({
    titulo: String(m.titulo || '').trim().slice(0, 80) || 'Missão',
    caminho: (Array.isArray(m.caminho) ? m.caminho : []).map(Number),
  }));
  if (!missoes.length || missoes.length > 20) throw new Error('Cria entre 1 e 20 missões.');
  for (const m of missoes) {
    if (m.caminho.length < 2) throw new Error(`A missão "${m.titulo}" precisa de pelo menos 2 estações.`);
    if (m.caminho.some((i) => !Number.isInteger(i) || i < 0 || i >= est.length)) throw new Error(`A missão "${m.titulo}" tem uma estação que não existe.`);
    if (m.caminho.some((i, k) => k > 0 && i === m.caminho[k - 1])) throw new Error(`A missão "${m.titulo}" repete a mesma estação seguida.`);
  }

  const mapa = {};
  const m = b.mapa || {};
  if (typeof m.url === 'string' && /^\/static\/mapas\/[\w-]+\.svg$/.test(m.url) &&
      require('fs').existsSync(require('path').join(__dirname, 'public', m.url.replace('/static/', '')))) mapa.url = m.url;
  else if (typeof m.imagem === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(m.imagem) && m.imagem.length < 6e6) mapa.imagem = m.imagem;
  else throw new Error('Escolhe um mapa (exemplo ou imagem PNG/JPG).');

  const nGrupos = Math.max(2, Math.min(CORES.length, Number(b.nGrupos) || 6));
  sala.percurso = { mapa, estacoes: est, missoes, nGrupos, codigos: gerarCodigos(nGrupos, est.length), inicio: null };
}

function mapaUrl(sala) {
  return sala.percurso.mapa.url || `/api/sala/${sala.code}/mapa`;
}
function imagemMapa(sala) { // {tipo, dados} para servir a imagem carregada pelo professor
  const m = /^data:(image\/[\w+]+);base64,(.*)$/.exec(sala.percurso.mapa.imagem || '');
  return m ? { tipo: m[1], dados: Buffer.from(m[2], 'base64') } : null;
}

function slotLivre(sala) {
  const usados = new Set([...sala.alunos.values()].map((a) => a.slot));
  for (let i = 0; i < sala.percurso.nGrupos; i++) if (!usados.has(i)) return i;
  return -1;
}

// Cada grupo começa numa missão diferente, para não irem todos à mesma estação ao mesmo tempo
function ordemMissoes(sala, slot) {
  const n = sala.percurso.missoes.length;
  return Array.from({ length: n }, (_, i) => (i + slot) % n);
}

function novoGrupo(sala, a) {
  a.g = { ordem: ordemMissoes(sala, a.slot), mi: 0, passo: 0, inicio: null, tempos: [], erros: 0, bloqueadoAte: 0, trilho: [], estado: 'espera', msg: null };
}

function comecarMissao(sala, a) {
  const g = a.g;
  const m = sala.percurso.missoes[g.ordem[g.mi]];
  g.passo = 0;
  g.inicio = now();
  g.trilho = [m.caminho[0]];
  g.estado = 'missao';
  g.msg = null;
}

function iniciar(sala) {
  sala.estado = 'percurso';
  sala.percurso.inicio = now();
  for (const a of sala.alunos.values()) comecarMissao(sala, a);
}

function missaoAtual(sala, a) {
  return sala.percurso.missoes[a.g.ordem[a.g.mi]];
}

function submeter(sala, a, codigoBruto) {
  const g = a.g;
  if (sala.estado !== 'percurso' || g.estado !== 'missao') return { erro: 'Agora não há destino.' };
  const t = now();
  if (g.bloqueadoAte > t) return { erro: `Esperem ${Math.ceil((g.bloqueadoAte - t) / 1000)} s.` };
  const codigo = String(codigoBruto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const p = sala.percurso;
  const m = missaoAtual(sala, a);
  const alvo = m.caminho[g.passo + 1];
  const est = p.codigos[a.slot].indexOf(codigo);

  if (est === alvo) {
    g.passo++;
    g.trilho.push(alvo);
    if (g.passo === m.caminho.length - 1) {
      g.tempos.push(t - g.inicio);
      g.estado = g.mi + 1 < g.ordem.length ? 'entre' : 'terminou';
      g.msg = { tipo: 'ok', texto: `Chegaram a ${p.estacoes[alvo].nome}. Missão concluída!` };
    } else {
      g.msg = { tipo: 'ok', texto: `Certo! Chegaram a ${p.estacoes[alvo].nome}.` };
    }
    return { ok: true };
  }
  if (est >= 0) {
    g.erros++;
    g.bloqueadoAte = t + PENALIZACAO_ERRADA;
    const aqui = est === m.caminho[g.passo];
    g.msg = {
      tipo: 'bad',
      texto: aqui
        ? `Esse é o código de ${p.estacoes[est].nome}, onde já estavam. O caminhante não saiu do sítio.`
        : `Esse código é de ${p.estacoes[est].nome}. Não é o destino. Esperem 15 s e voltem a guiar.`,
    };
    return { ok: false };
  }
  g.bloqueadoAte = t + PENALIZACAO_DESCONHECIDO;
  const outra = p.codigos.findIndex((l, k) => k !== a.slot && l.includes(codigo));
  g.msg = outra >= 0
    ? { tipo: 'warn', texto: `${codigo} é o código da cor ${CORES[outra].nome}. O caminhante tem de ler a linha ${CORES[a.slot].nome}.` }
    : { tipo: 'warn', texto: `O código ${codigo || '(vazio)'} não existe. Confirmem a cor do grupo no cartão.` };
  return { ok: false };
}

function proximaMissao(sala, a) {
  if (a.g.estado !== 'entre') return false;
  a.g.mi++;
  comecarMissao(sala, a);
  return true;
}

function tempoTotal(a) {
  return a.g.tempos.reduce((s, x) => s + x, 0);
}
function classificar(sala) {
  return [...sala.alunos.values()].sort((x, y) =>
    (y.g.tempos.length - x.g.tempos.length) ||
    (y.g.passo * (y.g.estado === 'missao' ? 1 : 0) - x.g.passo * (x.g.estado === 'missao' ? 1 : 0)) ||
    (tempoTotal(x) - tempoTotal(y)) ||
    (x.g.erros - y.g.erros) ||
    x.nome.localeCompare(y.nome));
}
function todosTerminaram(sala) {
  const l = [...sala.alunos.values()];
  return l.length > 0 && l.every((a) => a.g.estado === 'terminou');
}

// O que se mostra de um grupo (sem códigos)
function resumo(sala, a) {
  const p = sala.percurso, g = a.g;
  const m = p.missoes[g.ordem[Math.min(g.mi, g.ordem.length - 1)]];
  const fim = g.estado === 'terminou' || g.estado === 'entre';
  return {
    slot: a.slot,
    cor: CORES[a.slot].hex,
    corNome: CORES[a.slot].nome,
    estado: g.estado,
    missao: g.mi + 1,
    missoes: g.ordem.length,
    titulo: m.titulo,
    passo: g.passo,
    passos: m.caminho.length - 1,
    pos: g.trilho.length ? g.trilho[g.trilho.length - 1] : m.caminho[0],
    alvo: fim || g.estado === 'espera' ? null : m.caminho[g.passo + 1],
    trilho: g.trilho,
    erros: g.erros,
    concluidas: g.tempos.length,
    tempos: g.tempos,
    tempoTotal: tempoTotal(a),
    inicio: g.inicio,
    bloqueadoAte: g.bloqueadoAte,
  };
}

function vistaMapa(sala) {
  const p = sala.percurso;
  return { mapaUrl: mapaUrl(sala), estacoes: p.estacoes, nGrupos: p.nGrupos, inicioPercurso: p.inicio };
}

function linhasCsv(sala) {
  const p = sala.percurso;
  const cab = ['Posição', 'Grupo', 'Cor', 'Missões concluídas', 'Tempo total', 'Erros'];
  p.missoes.forEach((m) => cab.push(`Tempo: ${m.titulo}`));
  const linhas = [cab];
  const mmss = (ms) => { const t = Math.round(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  classificar(sala).forEach((a, i) => {
    const l = [i + 1, a.nome, CORES[a.slot].nome, `${a.g.tempos.length}/${a.g.ordem.length}`, mmss(tempoTotal(a)), a.g.erros];
    p.missoes.forEach((_, mi) => {
      const k = a.g.ordem.indexOf(mi);
      l.push(k >= 0 && k < a.g.tempos.length ? mmss(a.g.tempos[k]) : '');
    });
    linhas.push(l);
  });
  return linhas;
}

// Folha A4 com um cartão por estação, para imprimir, recortar e dobrar
function htmlCartoes(sala) {
  const p = sala.percurso;
  const cartoes = p.estacoes.map((e, i) => `
    <div class="cartao">
      <div class="frente"><div class="num">${i + 1}</div><div class="nome">${esc(e.nome)}</div><div class="dica">levanta para ver o código</div></div>
      <div class="codigos">${Array.from({ length: p.nGrupos }, (_, k) => `
        <div class="cod"><span class="cor" style="background:${CORES[k].hex}"></span><span class="cn">${CORES[k].nome}</span><b>${p.codigos[k][i]}</b></div>`).join('')}
      </div>
    </div>`).join('');
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Cartões · ${esc(sala.titulo)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; color: #111; background: #fff; }
  .instr { padding: 12px 16px; border: 1px solid #ccc; border-radius: 8px; margin: 12px; font-size: 14px; line-height: 1.5; }
  .instr button { font: inherit; padding: 6px 14px; margin-top: 6px; }
  .grelha { display: grid; grid-template-columns: repeat(3, 62mm); gap: 4mm; justify-content: center; padding: 4mm; }
  .cartao { width: 62mm; height: 84mm; border: 1px dashed #888; display: flex; flex-direction: column; break-inside: avoid; }
  .frente { height: 42mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px dashed #888; text-align: center; padding: 3mm; }
  .num { font-size: 11pt; color: #666; }
  .nome { font-size: 17pt; font-weight: 800; line-height: 1.15; }
  .dica { font-size: 7.5pt; color: #888; margin-top: 2mm; }
  .codigos { height: 42mm; display: grid; grid-template-columns: 1fr 1fr; align-content: center; gap: 1.5mm 3mm; padding: 3mm; }
  .cod { display: flex; align-items: center; gap: 1.5mm; font-size: 9pt; }
  .cod b { font-size: 14pt; letter-spacing: .05em; margin-left: auto; font-family: ui-monospace, Menlo, monospace; }
  .cor { width: 3.5mm; height: 3.5mm; border-radius: 50%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { .instr { display: none; } }
</style></head><body>
<div class="instr">
  <b>${esc(sala.titulo)}</b> · sala ${sala.code} · ${p.estacoes.length} cartões · ${p.nGrupos} grupos<br>
  1. Imprime e recorta pelo tracejado de fora.<br>
  2. Dobra cada cartão <b>para trás</b> pela linha do meio: o nome fica à frente, os códigos ficam escondidos atrás.<br>
  3. Cola cada cartão só pela parte de cima, na estação certa (no mapa projetado ou na mesa do grupo).<br>
  4. O caminhante levanta o cartão por baixo e lê só o código da cor do seu grupo.<br>
  Estes códigos só servem para esta sala. Numa sala nova, a app gera códigos novos.<br>
  <button onclick="print()">Imprimir</button>
</div>
<div class="grelha">${cartoes}</div>
</body></html>`;
}

module.exports = {
  CORES, preparar, mapaUrl, imagemMapa, slotLivre, novoGrupo, comecarMissao, iniciar, submeter, proximaMissao,
  classificar, todosTerminaram, resumo, vistaMapa, linhasCsv, htmlCartoes, tempoTotal,
};
