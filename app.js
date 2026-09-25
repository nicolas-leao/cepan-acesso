import { db, auth, COLECAO, COLECAO_PORTEIROS } from "./firebase-config.js";
import {
  collection, query, where, orderBy, limit, onSnapshot,
  doc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const INTERVALO_ATUALIZACAO_FILA_MS = 30000; 
const LIMITE_RELATORIO_TUDO = 2000;
const TITULO_BASE = document.title;

const telaLogin = document.getElementById('telaLogin');
const formLogin = document.getElementById('formLogin');
const textoLogin = document.getElementById('textoLogin');
const camposLogin = document.getElementById('camposLogin');
const inputEmail = document.getElementById('inputEmail');
const inputSenha = document.getElementById('inputSenha');
const btnEntrar = document.getElementById('btnEntrar');
const erroLogin = document.getElementById('erroLogin');

const conteudoPainel = document.getElementById('conteudoPainel');
const usuarioLogado = document.getElementById('usuarioLogado');
const btnSair = document.getElementById('btnSairPortaria');
const containerFila = document.getElementById('secaoFila');
const secaoRelatorio = document.getElementById('secaoRelatorio');
const contador = document.getElementById('qtdFila');
const corpoTabela = document.getElementById('tabelaHistoricoCorpo');
const notaRelatorio = document.getElementById('notaRelatorio');
const btnAudioToggle = document.getElementById('btnAudioToggle');
const inputBusca = document.getElementById('inputBusca');
const tabFila = document.getElementById('tabFila');
const tabRelatorio = document.getElementById('tabRelatorio');
const btnExportar = document.getElementById('btnExportar');
const botoesFiltro = document.querySelectorAll('.btn-filtro');

window.__cepanIniciou = true;
erroLogin.textContent = '';

const estado = {
  fila: [], historico: [], visiveis: [], filtro: 'hoje', abaAtual: 'fila',
  audioAtivo: false, primeiraCarga: true, pararFila: null, timerFila: null,
  processando: new Set(), requisicaoRelatorio: 0, admin: false 
};

let audioCtx = null;

function el(tag, { classe, texto, attrs } = {}, filhos = []) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined && texto !== null) e.textContent = texto;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const f of filhos) if (f) e.append(f);
  return e;
}

function paraData(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') return valor.toDate();
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

function horaCurta(data) {
  return data ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

function inicioDoDia() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function normalizarSolicitacao(id, d) {
  const criadoEm = paraData(d.criadoEm);
  let previsto = null;
  if (criadoEm && Number.isFinite(d.minutosEstimados)) {
    previsto = new Date(criadoEm.getTime() + d.minutosEstimados * 60000);
  } else if (d.horarioPrevisto) {
    previsto = paraData(d.horarioPrevisto); 
  }
  return {
    id,
    placa: d.placa || '-------',
    veiculo: (d.veiculo && d.veiculo !== 'Não especificado') ? d.veiculo : '',
    colaborador: d.colaborador || '',
    visitante: d.visitante || '',
    empresa: d.empresa || '',
    status: d.status || '',
    previsto,
    finalizadoEm: paraData(d.liberadoEm),
    finalizadoPor: d.finalizadoPor || ''
  };
}

function obterClasseEmpresa(empresa) {
  const emp = (empresa || '').toLowerCase();
  if (emp.includes('domo')) return 'emp-domo';
  if (emp.includes('avell')) return 'emp-avell';
  if (emp.includes('px')) return 'emp-px';
  return 'emp-outra';
}

function alternarAudio() {
  estado.audioAtivo = !estado.audioAtivo;
  if (estado.audioAtivo) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume();
    } catch (e) {}
  }
  btnAudioToggle.classList.toggle('ativo', estado.audioAtivo);
  btnAudioToggle.setAttribute('aria-pressed', String(estado.audioAtivo));
  btnAudioToggle.textContent = `🔔 Alerta Sonoro: ${estado.audioAtivo ? 'ON' : 'OFF'}`;
  if (estado.audioAtivo) tocarBip();
}

function tocarBip() {
  if (!estado.audioAtivo || !audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [0, 0.35].forEach((atraso) => {
      const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, t + atraso);
      gain.gain.setValueAtTime(0.2, t + atraso); gain.gain.exponentialRampToValueAtTime(0.001, t + atraso + 0.3);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t + atraso); osc.stop(t + atraso + 0.3);
    });
  } catch (e) {}
}

function mostrarLogin(mensagemErro) {
  pararTudo();
  conteudoPainel.classList.add('oculto'); telaLogin.classList.remove('oculto');
  textoLogin.textContent = 'Entre com o usuário da portaria:';
  camposLogin.classList.remove('oculto');
  if (mensagemErro) erroLogin.textContent = mensagemErro;
  btnEntrar.disabled = false; btnEntrar.textContent = 'Acessar Painel';
  inputEmail.focus();
}

function mostrarPainel(usuario) {
  telaLogin.classList.add('oculto'); conteudoPainel.classList.remove('oculto');
  usuarioLogado.textContent = usuario.email || '';
  inputSenha.value = ''; erroLogin.textContent = '';
  trocarAba('fila');
}

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault(); erroLogin.textContent = '';
  const email = inputEmail.value.trim(); const senha = inputSenha.value;
  if (!email || !senha) { erroLogin.textContent = 'Informe e-mail e senha.'; return; }
  btnEntrar.disabled = true; btnEntrar.textContent = 'Entrando...';

  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (erro) {
    const mensagens = {
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet.'
    };
    erroLogin.textContent = mensagens[erro.code] || 'Não foi possível entrar. Tente novamente.';
    inputSenha.value = ''; btnEntrar.disabled = false; btnEntrar.textContent = 'Acessar Painel';
  }
});

onAuthStateChanged(auth, async (usuario) => {
  pararTudo();
  if (!usuario || usuario.isAnonymous) { mostrarLogin(); return; }
  try {
    const perfil = await getDoc(doc(db, COLECAO_PORTEIROS, usuario.uid));
    if (!perfil.exists()) { await signOut(auth); mostrarLogin('Este usuário não tem permissão de portaria.'); return; }
    estado.admin = perfil.data().admin === true;
  } catch (erro) {
    await signOut(auth); mostrarLogin('Não foi possível validar o acesso. Verifique a conexão.'); return;
  }
  mostrarPainel(usuario); iniciarFila();
});

btnSair.addEventListener('click', () => signOut(auth));

function pararTudo() {
  if (estado.pararFila) estado.pararFila();
  if (estado.timerFila) clearInterval(estado.timerFila);
  estado.pararFila = null; estado.timerFila = null;
  estado.fila = []; estado.historico = []; estado.visiveis = []; estado.processando.clear();
  estado.admin = false; estado.primeiraCarga = true; document.title = TITULO_BASE;
}

function iniciarFila() {
  const q = query(collection(db, COLECAO), where('status', '==', 'AGUARDANDO'));
  estado.pararFila = onSnapshot(q, (snapshot) => {
    const chegouNovo = !estado.primeiraCarga && snapshot.docChanges().some(m => m.type === 'added');
    estado.primeiraCarga = false;
    estado.fila = snapshot.docs.map(d => normalizarSolicitacao(d.id, d.data({ serverTimestamps: 'estimate' })));
    renderizarFila();
    if (chegouNovo) tocarBip();
  }, (erro) => {
    containerFila.replaceChildren(el('div', { classe: 'vazio' }, [
      el('h3', { texto: 'Sem conexão com o banco de dados' }), el('p', { texto: 'Verifique a internet da portaria.' })
    ]));
  });
  estado.timerFila = setInterval(renderizarFila, INTERVALO_ATUALIZACAO_FILA_MS);
}

function renderizarFila() {
  const total = estado.fila.length;
  contador.textContent = total;
  document.title = total ? `(${total}) ${TITULO_BASE}` : TITULO_BASE;

  if (total === 0) {
    containerFila.replaceChildren(el('div', { classe: 'vazio' }, [
      el('h3', { texto: 'Nenhum veículo aguardando na portaria' }), el('p', { texto: 'Novos avisos de chegada aparecerão aqui.' })
    ]));
    return;
  }
  const agora = Date.now();
  const ordenados = [...estado.fila].sort((a, b) => (a.previsto?.getTime() ?? Infinity) - (b.previsto?.getTime() ?? Infinity));
  containerFila.replaceChildren(...ordenados.map(item => criarCardVeiculo(item, agora)));
}

function criarCardVeiculo(item, agora) {
  const minutos = item.previsto ? Math.round((item.previsto.getTime() - agora) / 60000) : null;
  let classeUrgencia = 'urgencia-baixa'; let classeTag = 'tag-longe'; let tagTexto = minutos === null ? 'Sem previsão' : `~${minutos} min`;

  if (minutos !== null && minutos <= 2) {
    classeUrgencia = 'urgencia-alta'; classeTag = 'tag-chegando';
    if (minutos < -10) { tagTexto = `Atrasado ${-minutos} min`; classeTag = 'tag-atrasado'; }
    else if (minutos <= 0) { tagTexto = 'Chegando agora'; }
  } else if (minutos !== null && minutos <= 6) {
    classeUrgencia = 'urgencia-media'; classeTag = 'tag-perto';
  }

  const ocupado = estado.processando.has(item.id);
  const acoes = [];

  const btnLiberar = el('button', { classe: 'btn-liberar', texto: ocupado ? '...' : 'Liberar', attrs: { type: 'button', 'data-acao': 'liberar', 'data-id': item.id } });
  const btnDescartar = el('button', { classe: 'btn-descartar', texto: '✖', attrs: { type: 'button', 'data-acao': 'descartar', 'data-id': item.id, title: 'Descartar solicitação' } });
  btnLiberar.disabled = ocupado; btnDescartar.disabled = ocupado;
  acoes.push(btnLiberar, btnDescartar);

  // Formatação para identificar se é Visita ou Próprio Colaborador
  const textoIdentificacao = item.visitante ? `Visita: ${item.visitante} (Aut: ${item.colaborador})` : item.colaborador;

  return el('div', { classe: `card-veiculo ${classeUrgencia}` }, [
    el('div', { classe: 'placa-box', texto: item.placa }),
    el('div', { classe: 'info-veiculo' }, [
      el('h3', { texto: item.veiculo || 'Modelo não informado' }),
      el('p', {}, [ el('strong', { texto: textoIdentificacao }), el('span', { classe: `tag-empresa ${obterClasseEmpresa(item.empresa)}`, texto: item.empresa }) ])
    ]),
    el('div', { classe: 'tempo-box' }, [ el('span', { classe: `tempo-tag ${classeTag}`, texto: tagTexto }), el('div', { classe: 'hora-prevista', texto: `Previsão: ${horaCurta(item.previsto)}` }) ]),
    el('div', { classe: 'acoes-card' }, acoes)
  ]);
}

containerFila.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-acao]');
  if (!btn || btn.disabled) return;
  const { acao, id } = btn.dataset;
  if (acao === 'descartar' && !confirm('Deseja descartar esta solicitação?')) return;
  await finalizarSolicitacao(id, acao === 'liberar' ? 'LIBERADO' : 'DESCARTADO');
});

async function finalizarSolicitacao(id, status) {
  if (estado.processando.has(id)) return;
  estado.processando.add(id); renderizarFila();
  try {
    await updateDoc(doc(db, COLECAO, id), { status, liberadoEm: serverTimestamp(), finalizadoPor: auth.currentUser?.email || '' });
  } catch (erro) {
    alert(erro.code === 'permission-denied' ? 'Sessão expirou ou documento travado.' : 'Verifique a conexão.');
  } finally { estado.processando.delete(id); renderizarFila(); }
}

function mostrarLinhaTabela(texto, classeExtra = '') {
  corpoTabela.replaceChildren(el('tr', {}, [ el('td', { classe: `celula-info ${classeExtra}`.trim(), texto, attrs: { colspan: '8' } }) ]));
}

async function carregarRelatorio() {
  const minhaRequisicao = ++estado.requisicaoRelatorio;
  mostrarLinhaTabela('Atualizando...'); notaRelatorio.textContent = '';
  const base = collection(db, COLECAO); let q;
  if (estado.filtro === 'tudo') { q = query(base, orderBy('liberadoEm', 'desc'), limit(LIMITE_RELATORIO_TUDO)); } 
  else {
    const inicio = estado.filtro === 'hoje' ? inicioDoDia() : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    q = query(base, where('liberadoEm', '>=', Timestamp.fromDate(inicio)), orderBy('liberadoEm', 'desc'));
  }
  try {
    const snapshot = await getDocs(q);
    if (minhaRequisicao !== estado.requisicaoRelatorio) return; 
    estado.historico = snapshot.docs.map(d => normalizarSolicitacao(d.id, d.data())).filter(i => (i.status === 'LIBERADO' || i.status === 'DESCARTADO') && i.finalizadoEm).sort((a, b) => b.finalizadoEm - a.finalizadoEm);
    if (estado.filtro === 'tudo' && snapshot.size >= LIMITE_RELATORIO_TUDO) notaRelatorio.textContent = `Mostrando os ${LIMITE_RELATORIO_TUDO} registros mais recentes.`;
    atualizarKPIs(); renderizarTabela();
  } catch (erro) {
    if (minhaRequisicao !== estado.requisicaoRelatorio) return;
    mostrarLinhaTabela('Erro ao carregar dados. Tente novamente.', 'celula-erro');
  }
}

function atualizarKPIs() {
  const liberados = estado.historico.filter(i => i.status === 'LIBERADO');
  const descartados = estado.historico.filter(i => i.status === 'DESCARTADO');
  document.getElementById('kpiTotal').textContent = liberados.length;
  document.getElementById('kpiDescartados').textContent = descartados.length;
  const contagem = new Map();
  liberados.forEach(i => {
    const nome = (i.empresa || '').trim();
    const chave = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const atual = contagem.get(chave) || { nome, total: 0 };
    atual.total++; contagem.set(chave, atual);
  });
  let topEmpresa = '-'; let maxAcessos = 0;
  for (const { nome, total } of contagem.values()) {
    if (total > maxAcessos) { maxAcessos = total; topEmpresa = `${nome || 'Sem empresa'} (${total})`; }
  }
  document.getElementById('kpiEmpresaTop').textContent = topEmpresa;
}

function renderizarTabela() {
  const termo = inputBusca.value.toLowerCase().replace(/[\s-]/g, '');
  estado.visiveis = !termo ? estado.historico : estado.historico.filter(item => [item.placa, item.colaborador, item.visitante, item.empresa].some(campo => (campo || '').toLowerCase().replace(/[\s-]/g, '').includes(termo)));
  if (estado.visiveis.length === 0) { mostrarLinhaTabela('Nenhum registro encontrado.', 'celula-vazia'); return; }

  corpoTabela.replaceChildren(...estado.visiveis.map(item => {
    const liberado = item.status === 'LIBERADO';
    return el('tr', {}, [
      el('td', {}, [el('strong', { texto: item.placa })]),
      el('td', { texto: item.veiculo || '-' }),
      el('td', { texto: item.visitante ? `${item.visitante} (Aut: ${item.colaborador})` : item.colaborador }),
      el('td', { texto: item.empresa }),
      el('td', { texto: item.finalizadoEm.toLocaleString('pt-BR') }),
      el('td', {}, [el('span', { classe: `badge-status ${liberado ? 'status-liberado' : 'status-descartado'}`, texto: item.status })]),
      el('td', { classe: 'celula-por', texto: item.finalizadoPor || '-' }),
      el('td', { classe: 'centro' }, estado.admin ? [el('button', { classe: 'btn-excluir', texto: '🗑️ Excluir', attrs: { type: 'button', 'data-id': item.id, 'data-placa': item.placa } })] : [document.createTextNode('—')])
    ]);
  }));
}

corpoTabela.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-excluir');
  if (!btn || btn.disabled) return;
  await excluirRegistro(btn, btn.dataset.id, btn.dataset.placa);
});

async function excluirRegistro(btn, docId, placa) {
  if (!confirm(`Remover permanentemente o registro da placa ${placa}?`)) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, COLECAO, docId));
    estado.historico = estado.historico.filter(i => i.id !== docId);
    atualizarKPIs(); renderizarTabela();
  } catch (erro) { alert('Erro ao excluir do banco de dados.'); btn.disabled = false; }
}

function celulaCSV(valor) {
  let s = String(valor ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportarCSV() {
  if (estado.visiveis.length === 0) { alert('Sem dados para exportar.'); return; }
  const cabecalho = ['Placa', 'Veiculo', 'Solicitante', 'Empresa', 'Data e Hora', 'Status', 'Finalizado por'];
  const linhas = estado.visiveis.map(r => {
    const nomeSolicitante = r.visitante ? `${r.visitante} (Aut: ${r.colaborador})` : r.colaborador;
    return [ r.placa, r.veiculo, nomeSolicitante, r.empresa, r.finalizadoEm.toLocaleString('pt-BR'), r.status, r.finalizadoPor ].map(celulaCSV).join(';');
  });
  const csv = [cabecalho.map(celulaCSV).join(';'), ...linhas].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `relatorio_cepan_${estado.filtro}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function trocarAba(aba) {
  estado.abaAtual = aba; const fila = aba === 'fila';
  tabFila.classList.toggle('active', fila); tabRelatorio.classList.toggle('active', !fila);
  containerFila.style.display = fila ? 'flex' : 'none'; secaoRelatorio.style.display = fila ? 'none' : 'block';
  if (!fila) carregarRelatorio();
}

btnAudioToggle.addEventListener('click', alternarAudio);
tabFila.addEventListener('click', () => trocarAba('fila'));
tabRelatorio.addEventListener('click', () => trocarAba('relatorio'));
inputBusca.addEventListener('input', renderizarTabela);
btnExportar.addEventListener('click', exportarCSV);

botoesFiltro.forEach(btn => {
  btn.addEventListener('click', () => { estado.filtro = btn.dataset.filtro; botoesFiltro.forEach(b => b.classList.toggle('active', b === btn)); carregarRelatorio(); });
});
