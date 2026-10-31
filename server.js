// Sala Aberta: servidor sem dependências (só Node.js 18+).
// Arranque: node server.js   (opcional: PORT=3000 PIN=1234 node server.js)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PIN = (process.env.PIN || '').trim() || String(Math.floor(1000 + Math.random() * 9000));
const PUBLIC = path.join(__dirname, 'public');
const RESULTADOS = path.join(__dirname, 'resultados');
fs.mkdirSync(RESULTADOS, { recursive: true });

// ---------- utilitários ----------
const rid = () => crypto.randomBytes(8).toString('hex');
const now = () => Date.now();

function normalizar(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}
function comoNumero(s) {
  const t = normalizar(s).replace(/\s/g, '').replace(/[−–]/g, '-').replace(',', '.');
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/.test(t)) return Number(t);
  const frac = t.match(/^([-+]?\d+)\/(\d+)$/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
  return null;
}
// Várias respostas certas separadas por "|"
function correta(pergunta, resposta) {
  if (resposta == null || String(resposta).trim() === '') return false;
  return String(pergunta.a).split('|').some((certa) => {
    const n1 = comoNumero(certa), n2 = comoNumero(resposta);
    if (n1 !== null && n2 !== null) return Math.abs(n1 - n2) < 1e-9 * Math.max(1, Math.abs(n1));
    return normalizar(certa) === normalizar(resposta);
  });
}

// ---------- estado ----------
const salas = new Map(); // code -> sala

function novoCodigo() {
  let c;
  do c = String(Math.floor(1000 + Math.random() * 9000)); while (salas.has(c));
  return c;
}

const MENCOES_PADRAO = [
  { min: 0, nome: 'Insuficiente' },
  { min: 50, nome: 'Suficiente' },
  { min: 70, nome: 'Bom' },
  { min: 90, nome: 'Muito Bom' },
];
function limparMencoes(m) {
  if (!Array.isArray(m)) return null;
  const l = m
    .map((x) => ({ min: Math.max(0, Math.min(100, Number(String(x.min).replace(',', '.')) || 0)), nome: String(x.nome || '').trim().slice(0, 30) }))
    .filter((x) => x.nome)
    .sort((a, b) => a.min - b.min);
  if (!l.length) return [];
  l[0].min = 0; // a primeira menção cobre sempre desde 0%
  return l.slice(0, 8);
}
function limparLimites(l) {
  if (!Array.isArray(l) || l.length !== 4) return null;
  const v = l.map((x) => Math.max(0, Math.min(100, Number(x) || 0)));
  return v.every((x, i) => i === 0 || x >= v[i - 1]) ? v : null;
}

function criarSala({ titulo, modo, perguntas, vidas, continuarEliminados, duracaoMin, perfil }) {
  const sala = {
    code: novoCodigo(),
    titulo: String(titulo || 'Sala').slice(0, 80),
    modo: modo === 'prova' ? 'prova' : 'elim',
    perguntas: perguntas.map((p) => ({
      q: String(p.q).slice(0, 500),
      a: String(p.a).slice(0, 200),
      t: Math.max(5, Math.min(3600, Number(p.t) || 60)),
      o: Array.isArray(p.o) && p.o.length ? p.o.map((x) => String(x).slice(0, 120)) : null,
    })),
    vidas: Math.max(1, Math.min(10, Number(vidas) || 1)),
    continuarEliminados: !!continuarEliminados,
    duracaoMs: Math.max(1, Number(duracaoMin) || 15) * 60000,
    estado: 'espera', // espera | pergunta | resultado | aberta | fim
    atual: -1,
    prazo: null,
    abertaEm: null,
    alunos: new Map(), // id -> aluno
    historico: [], // por ronda: {qi, certos, errados, eliminados, ninguemSai}
    aval: {
      perfil: (perfil && String(perfil.nome || '').slice(0, 60)) || '',
      escala: perfil && perfil.escala === '5' ? '5' : '20', // '5' (níveis 1 a 5) ou '20' (0 a 20)
      limites: (perfil && limparLimites(perfil.limites)) || [20, 50, 70, 90], // % mínima para os níveis 2, 3, 4 e 5
      mencoes: (perfil && limparMencoes(perfil.mencoes)) || MENCOES_PADRAO,
      cotacoes: perguntas.map(() => 1),
      correcoes: {}, // id -> {qi: true|false}
      manual: {}, // id -> nota escrita à mão
    },
    vencedores: [],
    criadaEm: now(),
    clientesProf: new Set(),
    temporizador: null,
  };
  salas.set(sala.code, sala);
  return sala;
}

function novoAluno(nome) {
  return {
    id: rid(),
    nome: String(nome).trim().slice(0, 40),
    vidas: 0,
    eliminado: false,
    eliminadoRonda: null,
    respostas: {}, // qi -> {r, ms, ok}
    clientes: new Set(),
    entrouEm: now(),
  };
}

function ativos(sala) {
  return [...sala.alunos.values()].filter((a) => !a.eliminado);
}

function pontuacao(sala, a) {
  let certas = 0, ms = 0;
  for (const r of Object.values(a.respostas)) {
    if (r.ok) { certas++; ms += r.ms; }
  }
  return { certas, ms };
}

function classificacao(sala) {
  return [...sala.alunos.values()]
    .map((a) => ({ a, ...pontuacao(sala, a) }))
    .sort((x, y) =>
      (x.a.eliminado - y.a.eliminado) ||
      ((y.a.eliminadoRonda ?? Infinity) - (x.a.eliminadoRonda ?? Infinity)) ||
      (y.certas - x.certas) ||
      (x.ms - y.ms) ||
      x.a.nome.localeCompare(y.a.nome));
}

// ---------- lógica de jogo ----------
function limparTemporizador(sala) {
  if (sala.temporizador) clearTimeout(sala.temporizador);
  sala.temporizador = null;
}

function abrirPergunta(sala, qi) {
  limparTemporizador(sala);
  sala.atual = qi;
  sala.estado = 'pergunta';
  sala.abertaEm = now();
  sala.prazo = sala.abertaEm + sala.perguntas[qi].t * 1000;
  sala.temporizador = setTimeout(() => fecharPergunta(sala), sala.prazo - now() + 300);
}

function fecharPergunta(sala) {
  if (sala.estado !== 'pergunta') return;
  limparTemporizador(sala);
  const qi = sala.atual;
  const emJogo = ativos(sala);
  const certos = emJogo.filter((a) => a.respostas[qi]?.ok);
  const errados = emJogo.filter((a) => !a.respostas[qi]?.ok);
  const ninguemSai = certos.length === 0 && emJogo.length > 0;
  const eliminados = [];
  if (!ninguemSai) {
    for (const a of errados) {
      a.vidas--;
      if (a.vidas <= 0) {
        a.eliminado = true;
        a.eliminadoRonda = sala.historico.length + 1;
        eliminados.push(a.nome);
      }
    }
  }
  sala.historico.push({ qi, certos: certos.length, errados: errados.length, eliminados, ninguemSai });
  sala.estado = 'resultado';
  sala.prazo = null;

  const restam = ativos(sala);
  const acabaram = sala.atual >= sala.perguntas.length - 1;
  if (restam.length <= 1 && sala.alunos.size > 1) terminar(sala);
  else if (acabaram) terminar(sala);
  else difundir(sala);
}

function terminar(sala) {
  limparTemporizador(sala);
  if (sala.estado === 'pergunta' && sala.modo === 'elim') {
    // fecha a ronda em curso antes de terminar
    sala.estado = 'resultado';
  }
  sala.estado = 'fim';
  sala.prazo = null;
  const cl = classificacao(sala);
  if (sala.modo === 'elim') {
    const vivos = cl.filter((x) => !x.a.eliminado);
    if (vivos.length) {
      // desempate: mais respostas certas, depois menos tempo total nas certas
      const top = vivos[0];
      sala.vencedores = vivos.filter((x) => x.certas === top.certas && x.ms === top.ms).map((x) => x.a.nome);
    } else sala.vencedores = [];
  } else sala.vencedores = [];
  guardarResultados(sala);
  difundir(sala);
}

function abrirProva(sala) {
  limparTemporizador(sala);
  sala.estado = 'aberta';
  sala.abertaEm = now();
  sala.prazo = sala.abertaEm + sala.duracaoMs;
  sala.temporizador = setTimeout(() => terminar(sala), sala.duracaoMs + 300);
}

// ---------- avaliação ----------
// Perguntas que contam: na prova, todas; na eliminatória, só as que chegaram a ser abertas.
function perguntasAvaliadas(sala) {
  if (sala.modo === 'prova') return sala.perguntas.map((_, i) => i);
  return [...new Set(sala.historico.map((h) => h.qi))];
}
function certaFinal(sala, a, qi) {
  const c = sala.aval.correcoes[a.id];
  if (c && typeof c[qi] === 'boolean') return c[qi];
  return !!a.respostas[qi]?.ok;
}
function nivel(pct, limites) {
  let n = 1;
  limites.forEach((l) => { if (pct >= l) n++; });
  return n;
}
function avaliar(sala, a) {
  const qs = perguntasAvaliadas(sala);
  const cot = sala.aval.cotacoes;
  let pontos = 0, total = 0;
  for (const qi of qs) {
    const c = Number(cot[qi]) || 0;
    total += c;
    if (certaFinal(sala, a, qi)) pontos += c;
  }
  const pct = total ? (pontos / total) * 100 : 0;
  const calculada = sala.aval.escala === '5' ? nivel(pct, sala.aval.limites) : Math.round(pct / 5 * 10) / 10;
  const manual = sala.aval.manual[a.id];
  const nota = manual ?? calculada;
  // a menção segue a nota final: se o professor mudou a nota, a menção acompanha
  let pctMencao = pct;
  if (manual != null) {
    pctMencao = sala.aval.escala === '5' ? (manual <= 1 ? 0 : sala.aval.limites[Math.round(manual) - 2]) : manual * 5;
  }
  let mencao = '';
  for (const m of sala.aval.mencoes) if (pctMencao >= m.min - 1e-9) mencao = m.nome;
  return { pontos, total, pct: Math.round(pct * 10) / 10, calculada, nota, manual: manual ?? null, mencao };
}
const virgula = (n) => String(n).replace('.', ',');
function atualizarAval(sala, b) {
  const av = sala.aval;
  if (b.perfil) {
    const p = b.perfil;
    const escala = p.escala === '5' ? '5' : '20';
    if (escala !== av.escala) av.manual = {};
    av.escala = escala;
    av.limites = limparLimites(p.limites) || av.limites;
    av.mencoes = limparMencoes(p.mencoes) || av.mencoes;
    av.perfil = String(p.nome || '').slice(0, 60);
    return;
  }
  if (b.mencoes) { const m = limparMencoes(b.mencoes); if (m) { av.mencoes = m; av.perfil = ''; } }
  if (b.escala === '5' || b.escala === '20') {
    if (b.escala !== av.escala) av.perfil = '';
    if (b.escala !== av.escala) av.manual = {}; // notas manuais deixam de fazer sentido noutra escala
    av.escala = b.escala;
  }
  if (Array.isArray(b.limites) && b.limites.length === 4) {
    const l = b.limites.map((x) => Math.max(0, Math.min(100, Number(x) || 0)));
    if (l.every((x, i) => i === 0 || x >= l[i - 1])) { av.limites = l; av.perfil = ''; }
  }
  if (Number.isInteger(b.qi) && b.qi >= 0 && b.qi < sala.perguntas.length && b.cotacao !== undefined) {
    av.cotacoes[b.qi] = Math.max(0, Math.min(100, Number(String(b.cotacao).replace(',', '.')) || 0));
  }
  if (b.correcao && sala.alunos.has(b.correcao.id) && Number.isInteger(b.correcao.qi)) {
    const { id, qi, valor } = b.correcao;
    av.correcoes[id] = av.correcoes[id] || {};
    if (valor === null) delete av.correcoes[id][qi]; else av.correcoes[id][qi] = !!valor;
  }
  if (b.manual && sala.alunos.has(b.manual.id)) {
    const v = b.manual.valor;
    if (v === null || v === '') delete av.manual[b.manual.id];
    else {
      const n = Number(String(v).replace(',', '.'));
      const max = av.escala === '5' ? 5 : 20, min = av.escala === '5' ? 1 : 0;
      if (!isNaN(n)) av.manual[b.manual.id] = Math.max(min, Math.min(max, n));
    }
  }
}

// ---------- resultados ----------
function csvCampo(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvSala(sala) {
  const escala = sala.aval.escala === '5' ? 'Nível (1 a 5)' : 'Nota (0 a 20)';
  const cab = ['Posição', 'Nome', escala, 'Menção', 'Percentagem', 'Pontos', 'Cotação total', 'Certas', 'Tempo nas certas (s)', 'Estado'];
  sala.perguntas.forEach((p, i) => cab.push(`P${i + 1} resposta`, `P${i + 1} certa?`));
  const linhas = [cab];
  classificacao(sala).forEach((x, i) => {
    const av = avaliar(sala, x.a);
    const l = [
      i + 1, x.a.nome, virgula(av.nota), av.mencao, virgula(av.pct) + '%', virgula(av.pontos), virgula(av.total),
      x.certas, (x.ms / 1000).toFixed(1).replace('.', ','),
      sala.modo === 'elim' ? (x.a.eliminado ? `Eliminado na ronda ${x.a.eliminadoRonda}` : 'Em jogo') : 'Terminou',
    ];
    sala.perguntas.forEach((_, qi) => {
      const r = x.a.respostas[qi];
      l.push(r ? r.r : '', r || sala.aval.correcoes[x.a.id]?.[qi] !== undefined ? (certaFinal(sala, x.a, qi) ? 'sim' : 'não') : '');
    });
    linhas.push(l);
  });
  const certas = ['', 'Resposta certa', '', '', '', '', '', '', '', ''];
  sala.perguntas.forEach((p) => certas.push(p.a.split('|').join(' ou '), ''));
  linhas.push([], certas);
  return '﻿' + linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n');
}
function guardarResultados(sala) {
  try {
    if (!sala.ficheiro) {
      const data = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      sala.ficheiro = `${data}_${sala.titulo.replace(/[^\p{L}\p{N}\-]+/gu, '_')}_${sala.code}.csv`;
    }
    fs.writeFileSync(path.join(RESULTADOS, sala.ficheiro), csvSala(sala));
  } catch (e) {
    console.error('Não consegui guardar resultados:', e.message);
  }
}

// ---------- vistas (o que cada um pode ver) ----------
function vistaProf(sala) {
  const qi = sala.atual;
  return {
    agora: now(),
    code: sala.code,
    titulo: sala.titulo,
    modo: sala.modo,
    estado: sala.estado,
    atual: qi,
    total: sala.perguntas.length,
    prazo: sala.prazo,
    vidas: sala.vidas,
    continuarEliminados: sala.continuarEliminados,
    duracaoMin: sala.duracaoMs / 60000,
    perguntas: sala.perguntas,
    historico: sala.historico,
    vencedores: sala.vencedores,
    aval: sala.aval,
    avaliadas: perguntasAvaliadas(sala),
    alunos: classificacao(sala).map((x) => ({
      id: x.a.id,
      nome: x.a.nome,
      vidas: x.a.vidas,
      eliminado: x.a.eliminado,
      eliminadoRonda: x.a.eliminadoRonda,
      online: x.a.clientes.size > 0,
      certas: x.certas,
      ms: x.ms,
      respondidas: Object.keys(x.a.respostas).length,
      respostaAtual: qi >= 0 ? x.a.respostas[qi] || null : null,
      respostas: Object.fromEntries(Object.entries(x.a.respostas).map(([k, v]) => [k, { r: v.r, ok: v.ok }])),
      avaliacao: avaliar(sala, x.a),
    })),
  };
}

function vistaAluno(sala, a) {
  const base = {
    agora: now(),
    titulo: sala.titulo,
    modo: sala.modo,
    estado: sala.estado,
    prazo: sala.prazo,
    total: sala.perguntas.length,
    nome: a.nome,
    vidas: a.vidas,
    vidasIniciais: sala.vidas,
    eliminado: a.eliminado,
    podeResponder: !a.eliminado || sala.continuarEliminados,
    emJogo: ativos(sala).length,
    inscritos: sala.alunos.size,
  };
  if (sala.modo === 'elim') {
    const qi = sala.atual;
    base.atual = qi;
    if (qi >= 0 && sala.estado !== 'espera') {
      const p = sala.perguntas[qi];
      base.pergunta = { q: p.q, o: p.o, t: p.t };
      base.minhaResposta = a.respostas[qi] ? { r: a.respostas[qi].r } : null;
      if (sala.estado !== 'pergunta') {
        base.certa = p.a.split('|')[0];
        base.acertei = !!a.respostas[qi]?.ok;
        base.ronda = sala.historico[sala.historico.length - 1] || null;
      }
    }
  } else {
    if (sala.estado === 'aberta') {
      base.perguntas = sala.perguntas.map((p) => ({ q: p.q, o: p.o }));
      base.minhas = Object.fromEntries(Object.entries(a.respostas).map(([k, v]) => [k, v.r]));
    }
  }
  if (sala.estado === 'fim') {
    const p = pontuacao(sala, a);
    base.certas = p.certas;
    base.vencedores = sala.vencedores;
    const cl = classificacao(sala);
    base.posicao = cl.findIndex((x) => x.a === a) + 1;
  }
  return base;
}

// ---------- SSE ----------
function enviar(res, dados) {
  try { res.write(`data: ${JSON.stringify(dados)}\n\n`); } catch {}
}
function difundir(sala) {
  const vp = vistaProf(sala);
  for (const res of sala.clientesProf) enviar(res, vp);
  for (const a of sala.alunos.values()) {
    if (!a.clientes.size) continue;
    const va = vistaAluno(sala, a);
    for (const res of a.clientes) enviar(res, va);
  }
}
function abrirSSE(req, res, aoFechar) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
  req.on('close', () => { clearInterval(ping); aoFechar(); });
}

// ---------- HTTP ----------
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 2e6) { falha(new Error('grande')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { falha(e); } });
  });
}
function servirFicheiro(res, ficheiro) {
  const p = path.join(PUBLIC, ficheiro);
  if (!p.startsWith(PUBLIC)) return json(res, 404, { erro: 'não existe' });
  fs.readFile(p, (err, dados) => {
    if (err) return json(res, 404, { erro: 'não existe' });
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  });
}

function ipsLocais() {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }
  return ips;
}

const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

// Online, o PIN tem de ser uma palavra-passe longa (ver arranque). Cada PIN errado demora 1 s a responder.
function pinOk(req, url) {
  const dado = String(req.headers['x-pin'] || url.searchParams.get('pin') || '');
  const a = Buffer.from(dado), b = Buffer.from(PIN);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return ok;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const partes = url.pathname.split('/').filter(Boolean);
  try {
    // páginas
    if (req.method === 'GET' && url.pathname === '/saude') return json(res, 200, { ok: true, salas: salas.size });
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/aluno')) return servirFicheiro(res, 'aluno.html');
    if (req.method === 'GET' && url.pathname === '/professor') return servirFicheiro(res, 'professor.html');
    if (req.method === 'GET' && partes[0] === 'static') return servirFicheiro(res, partes.slice(1).join('/'));
    if (req.method === 'GET' && partes[0] === 'exemplos' && partes[1]) {
      const p = path.join(__dirname, 'exemplos', path.basename(partes[1]));
      return fs.readFile(p, (err, d) => {
        if (err) return json(res, 404, { erro: 'não existe' });
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(d);
      });
    }

    // ----- professor -----
    if (partes[0] === 'api' && partes[1] === 'prof') {
      if (!pinOk(req, url)) return setTimeout(() => json(res, 401, { erro: 'PIN errado' }), 1000);

      if (req.method === 'GET' && partes[2] === 'info') {
        return json(res, 200, {
          enderecos: PUBLIC_URL ? [PUBLIC_URL] : ipsLocais().map((ip) => `http://${ip}:${PORT}`),
          exemplos: fs.readdirSync(path.join(__dirname, 'exemplos')).filter((f) => f.endsWith('.csv')),
          salas: [...salas.values()].map((s) => ({ code: s.code, titulo: s.titulo, modo: s.modo, estado: s.estado, alunos: s.alunos.size })),
        });
      }
      if (req.method === 'POST' && partes[2] === 'salas') {
        const b = await lerCorpo(req);
        if (!Array.isArray(b.perguntas) || !b.perguntas.length) return json(res, 400, { erro: 'Sem perguntas' });
        const sala = criarSala(b);
        return json(res, 200, { code: sala.code });
      }
      const sala = salas.get(partes[3]);
      if (partes[2] === 'sala' && !sala) return json(res, 404, { erro: 'Sala não existe' });

      if (req.method === 'GET' && partes[4] === 'eventos') {
        abrirSSE(req, res, () => sala.clientesProf.delete(res));
        sala.clientesProf.add(res);
        enviar(res, vistaProf(sala));
        return;
      }
      if (req.method === 'GET' && partes[4] === 'csv') {
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="resultados_${sala.code}.csv"`,
        });
        return res.end(csvSala(sala));
      }
      if (req.method === 'POST' && partes[4] === 'acao') {
        const b = await lerCorpo(req);
        switch (b.acao) {
          case 'iniciar': // começa o jogo / abre a prova
            if (sala.estado !== 'espera') break;
            for (const a of sala.alunos.values()) a.vidas = sala.vidas;
            if (sala.modo === 'elim') abrirPergunta(sala, 0); else abrirProva(sala);
            break;
          case 'proxima':
            if (sala.modo === 'elim' && sala.estado === 'resultado' && sala.atual < sala.perguntas.length - 1) abrirPergunta(sala, sala.atual + 1);
            break;
          case 'fecharRonda':
            if (sala.estado === 'pergunta') fecharPergunta(sala);
            return json(res, 200, { ok: true });
          case 'maisTempo':
            if ((sala.estado === 'pergunta' || sala.estado === 'aberta') && sala.prazo) {
              limparTemporizador(sala);
              sala.prazo += (Number(b.segundos) || 30) * 1000;
              sala.temporizador = setTimeout(
                () => (sala.modo === 'elim' ? fecharPergunta(sala) : terminar(sala)),
                sala.prazo - now() + 300);
            }
            break;
          case 'terminar':
            if (sala.estado !== 'fim') terminar(sala);
            return json(res, 200, { ok: true });
          case 'expulsar': {
            const a = sala.alunos.get(b.id);
            if (a) { for (const r of a.clientes) enviar(r, { expulso: true }); sala.alunos.delete(b.id); }
            break;
          }
          case 'avaliacao':
            atualizarAval(sala, b);
            if (sala.estado === 'fim') {
              clearTimeout(sala.gravarAval);
              sala.gravarAval = setTimeout(() => guardarResultados(sala), 2000);
            }
            break;
          case 'apagar':
            limparTemporizador(sala);
            for (const a of sala.alunos.values()) for (const r of a.clientes) enviar(r, { fechada: true });
            salas.delete(sala.code);
            return json(res, 200, { ok: true });
          default:
            return json(res, 400, { erro: 'Ação desconhecida' });
        }
        difundir(sala);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { erro: 'não existe' });
    }

    // ----- alunos -----
    if (partes[0] === 'api' && partes[1] === 'sala') {
      const sala = salas.get(partes[2]);
      if (!sala) return json(res, 404, { erro: 'Esta sala não existe ou já foi fechada.' });

      if (req.method === 'POST' && partes[3] === 'entrar') {
        const b = await lerCorpo(req);
        if (b.id && sala.alunos.has(b.id)) return json(res, 200, { id: b.id });
        const nome = String(b.nome || '').trim();
        if (!nome) return json(res, 400, { erro: 'Escreve o teu nome.' });
        const tardeProva = sala.modo === 'prova' && sala.estado === 'aberta';
        if (sala.estado !== 'espera' && !tardeProva) return json(res, 403, { erro: 'O jogo já começou. Fala com o professor.' });
        if ([...sala.alunos.values()].some((a) => normalizar(a.nome) === normalizar(nome)))
          return json(res, 409, { erro: 'Já há alguém com esse nome. Junta a inicial do apelido.' });
        const a = novoAluno(nome);
        a.vidas = sala.vidas;
        sala.alunos.set(a.id, a);
        difundir(sala);
        return json(res, 200, { id: a.id });
      }
      const a = sala.alunos.get(url.searchParams.get('id') || '');
      if (req.method === 'GET' && partes[3] === 'existe') return json(res, a ? 200 : 404, { ok: !!a });
      if (req.method === 'GET' && partes[3] === 'eventos') {
        if (!a) return json(res, 404, { erro: 'Não estás inscrito nesta sala.' });
        abrirSSE(req, res, () => { a.clientes.delete(res); difundir(sala); });
        a.clientes.add(res);
        difundir(sala);
        return;
      }
      if (req.method === 'POST' && partes[3] === 'responder') {
        const b = await lerCorpo(req);
        const al = sala.alunos.get(b.id);
        if (!al) return json(res, 404, { erro: 'Não estás inscrito.' });
        const qi = Number(b.qi);
        const resposta = String(b.resposta ?? '').slice(0, 200);
        if (sala.modo === 'elim') {
          if (sala.estado !== 'pergunta' || qi !== sala.atual) return json(res, 409, { erro: 'Tempo esgotado.' });
          if (al.eliminado && !sala.continuarEliminados) return json(res, 403, { erro: 'Estás eliminado.' });
          if (al.respostas[qi]) return json(res, 409, { erro: 'Já respondeste.' });
          al.respostas[qi] = { r: resposta, ms: now() - sala.abertaEm, ok: correta(sala.perguntas[qi], resposta) };
          // fecha logo se todos os que podem responder já responderam
          const podem = [...sala.alunos.values()].filter((x) => !x.eliminado || sala.continuarEliminados);
          if (podem.every((x) => x.respostas[qi])) fecharPergunta(sala);
          else difundir(sala);
          return json(res, 200, { ok: true });
        } else {
          if (sala.estado !== 'aberta') return json(res, 409, { erro: 'A prova está fechada.' });
          if (!(qi >= 0 && qi < sala.perguntas.length)) return json(res, 400, { erro: 'Pergunta inválida.' });
          if (resposta.trim() === '') delete al.respostas[qi];
          else al.respostas[qi] = { r: resposta, ms: now() - sala.abertaEm, ok: correta(sala.perguntas[qi], resposta) };
          difundir(sala);
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { erro: 'não existe' });
    }

    json(res, 404, { erro: 'não existe' });
  } catch (e) {
    console.error(e);
    json(res, 500, { erro: 'Erro no servidor' });
  }
});

if (require.main === module) {
  if (PUBLIC_URL && PIN.length < 8) {
    console.error('\n  Online, define um PIN com pelo menos 8 caracteres (variável PIN).\n');
    process.exit(1);
  }
  servidor.listen(PORT, '0.0.0.0', () => {
    const ends = ipsLocais();
    console.log('\n  Sala Aberta a funcionar.\n');
    console.log(`  Professor:  http://localhost:${PORT}/professor`);
    console.log(`  PIN do professor:  ${PIN}\n`);
    console.log('  Alunos (na mesma rede Wi-Fi):');
    for (const e of ends) console.log(`     http://${e}:${PORT}`);
    if (!ends.length) console.log(`     http://localhost:${PORT}`);
    console.log('\n  Para desligar: fecha esta janela ou carrega Ctrl+C.\n');
  });
}

module.exports = { correta, servidor };
