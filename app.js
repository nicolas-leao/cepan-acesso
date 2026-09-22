import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuração Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCsO89sOJP9xoQH0-b4Lyf2D_E9ku_JKc0",
  authDomain: "cepan-acesso.firebaseapp.com",
  projectId: "cepan-acesso",
  storageBucket: "cepan-acesso.firebasestorage.app",
  messagingSenderId: "179404408385",
  appId: "1:179404408385:web:6afff01f3b82ca6f2668c0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elementos do DOM
const containerFila = document.getElementById('secaoFila');
const contador = document.getElementById('qtdFila');
const corpoTabela = document.getElementById('tabelaHistoricoCorpo');
const btnAudioToggle = document.getElementById('btnAudioToggle');
const inputBusca = document.getElementById('inputBusca');
const tabFila = document.getElementById('tabFila');
const tabRelatorio = document.getElementById('tabRelatorio');
const btnExportar = document.getElementById('btnExportar');

// Variáveis de Estado
let historicoCompleto = [];
let filtroAtual = 'hoje';
let audioAtivo = false;
let quantidadeAnterior = 0;
let primeiraCarga = true;

// Funções de Áudio
function tocarBip() {
  if (!audioAtivo) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.error("Áudio bloqueado", e);
  }
}

function alternarAudio() {
  audioAtivo = !audioAtivo;
  if (audioAtivo) {
    btnAudioToggle.classList.add('ativo');
    btnAudioToggle.innerText = '🔔 Alerta Sonoro: ON';
    tocarBip();
  } else {
    btnAudioToggle.classList.remove('ativo');
    btnAudioToggle.innerText = '🔔 Alerta Sonoro: OFF';
  }
}

function obterClasseEmpresa(empresa) {
  const emp = (empresa || '').toLowerCase();
  if (emp.includes('domo')) return 'emp-domo';
  if (emp.includes('avell')) return 'emp-avell';
  if (emp.includes('px')) return 'emp-px';
  return 'emp-outra';
}

// Monitoramento da Fila (Tempo Real)
const q = query(collection(db, "solicitacoes_acesso"), where("status", "==", "AGUARDANDO"));

onSnapshot(q, (snapshot) => {
  let lista = [];
  const agora = Date.now();

  snapshot.forEach((documento) => {
    const dados = documento.data();
    const diferencaMs = dados.horarioPrevisto - agora;
    lista.push({
      id: documento.id,
      ...dados,
      minutosRestantes: Math.round(diferencaMs / 60000)
    });
  });

  if (!primeiraCarga && lista.length > quantidadeAnterior) {
    tocarBip();
  }
  primeiraCarga = false;
  quantidadeAnterior = lista.length;

  lista.sort((a, b) => a.horarioPrevisto - b.horarioPrevisto);
  contador.innerText = lista.length;
  containerFila.innerHTML = '';

  if (lista.length === 0) {
    containerFila.innerHTML = `
      <div class="vazio">
        <h3>Nenhum veículo aguardando na portaria</h3>
        <p>Novos avisos de chegada aparecerão aqui automaticamente.</p>
      </div>
    `;
    return;
  }

  lista.forEach((item) => {
    let classeUrgencia = 'urgencia-baixa';
    let tagTexto = `~${item.minutosRestantes} min`;
    let classeTag = 'tag-longe';

    if (item.minutosRestantes <= 2) {
      classeUrgencia = 'urgencia-alta';
      tagTexto = item.minutosRestantes <= 0 ? 'Chegando agora' : `~${item.minutosRestantes} min`;
      classeTag = 'tag-chegando';
    } else if (item.minutosRestantes <= 6) {
      classeUrgencia = 'urgencia-media';
      classeTag = 'tag-perto';
    }

    const classeEmpresa = obterClasseEmpresa(item.empresa);

    const card = document.createElement('div');
    card.className = `card-veiculo ${classeUrgencia}`;
    card.innerHTML = `
      <div class="placa-box">${item.placa}</div>
      <div class="info-veiculo">
        <h3>${item.veiculo}</h3>
        <p><strong>${item.colaborador}</strong> <span class="tag-empresa ${classeEmpresa}">${item.empresa}</span></p>
      </div>
      <div class="tempo-box">
        <span class="tempo-tag ${classeTag}">${tagTexto}</span>
        <div class="hora-prevista">Previsão: ${item.horarioPrevistoFormatado}</div>
      </div>
      <div class="acoes-card">
        <button class="btn-liberar" data-id="${item.id}">Liberar</button>
        <button class="btn-descartar" title="Descartar solicitação" data-id="${item.id}">✖</button>
      </div>
    `;
    containerFila.appendChild(card);
  });

  document.querySelectorAll('.btn-liberar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const docId = e.target.getAttribute('data-id');
      await updateDoc(doc(db, "solicitacoes_acesso", docId), {
        status: "LIBERADO",
        liberadoEm: new Date().toISOString()
      });
    });
  });

  document.querySelectorAll('.btn-descartar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const docId = e.target.getAttribute('data-id');
      if (confirm("Deseja descartar esta solicitação?")) {
        await updateDoc(doc(db, "solicitacoes_acesso", docId), {
          status: "DESCARTADO",
          liberadoEm: new Date().toISOString()
        });
      }
    });
  });
});

// Gestão de Relatórios
async function carregarRelatorio() {
  corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px;">Atualizando...</td></tr>`;
  
  try {
    const querySnapshot = await getDocs(collection(db, "solicitacoes_acesso"));
    historicoCompleto = [];

    querySnapshot.forEach((doc) => {
      const dados = doc.data();
      if (dados.status === 'LIBERADO' || dados.status === 'DESCARTADO') {
        historicoCompleto.push({ id: doc.id, ...dados });
      }
    });

    historicoCompleto.sort((a, b) => new Date(b.liberadoEm || 0) - new Date(a.liberadoEm || 0));
    atualizarKPIs();
    renderizarTabela();
  } catch (err) {
    console.error(err);
    corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding: 24px;">Erro ao carregar dados.</td></tr>`;
  }
}

function atualizarKPIs() {
  const liberados = historicoCompleto.filter(i => i.status === 'LIBERADO' && i.liberadoEm && !isNaN(new Date(i.liberadoEm)));
  const descartados = historicoCompleto.filter(i => i.status === 'DESCARTADO' && i.liberadoEm && !isNaN(new Date(i.liberadoEm)));

  document.getElementById('kpiTotal').innerText = liberados.length;
  document.getElementById('kpiDescartados').innerText = descartados.length;

  const contagemEmpresas = {};
  liberados.forEach(i => {
    contagemEmpresas[i.empresa] = (contagemEmpresas[i.empresa] || 0) + 1;
  });

  let topEmpresa = '-';
  let maxAcessos = 0;
  for (const [emp, total] of Object.entries(contagemEmpresas)) {
    if (total > maxAcessos) {
      maxAcessos = total;
      topEmpresa = `${emp} (${total})`;
    }
  }
  document.getElementById('kpiEmpresaTop').innerText = topEmpresa;
}

function renderizarTabela() {
  const agora = new Date();
  const termoBusca = inputBusca.value.toLowerCase().trim();

  let filtrados = historicoCompleto.filter(item => {
    if (!item.liberadoEm || isNaN(new Date(item.liberadoEm).getTime())) {
      return false;
    }

    const dataItem = new Date(item.liberadoEm);

    let passaData = true;
    if (filtroAtual === 'hoje') {
      passaData = dataItem.toDateString() === agora.toDateString();
    } else if (filtroAtual === 'semana') {
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(agora.getDate() - 7);
      passaData = dataItem >= seteDiasAtras;
    }

    let passaBusca = true;
    if (termoBusca) {
      passaBusca = (item.placa || '').toLowerCase().includes(termoBusca) ||
                   (item.colaborador || '').toLowerCase().includes(termoBusca) ||
                   (item.empresa || '').toLowerCase().includes(termoBusca);
    }

    return passaData && passaBusca;
  });

  if (filtrados.length === 0) {
    corpoTabela.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color:#94a3b8;">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  corpoTabela.innerHTML = '';
  filtrados.forEach(item => {
    const dataFormatada = new Date(item.liberadoEm).toLocaleString('pt-BR');
    const isLiberado = item.status === 'LIBERADO';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.placa}</strong></td>
      <td>${item.veiculo}</td>
      <td>${item.colaborador}</td>
      <td>${item.empresa}</td>
      <td>${dataFormatada}</td>
      <td><span class="badge-status ${isLiberado ? 'status-liberado' : 'status-descartado'}">${item.status}</span></td>
      <td style="text-align: center;">
        <button class="btn-descartar btn-excluir" style="padding: 4px 8px; font-size: 0.75rem;" data-id="${item.id}" data-placa="${item.placa}">
          🗑️ Excluir
        </button>
      </td>
    `;
    corpoTabela.appendChild(tr);
  });

  document.querySelectorAll('.btn-excluir').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const docId = e.currentTarget.getAttribute('data-id');
      const placa = e.currentTarget.getAttribute('data-placa');
      await excluirRegistro(docId, placa);
    });
  });
}

async function excluirRegistro(docId, placa) {
  if (confirm(`Remover permanentemente o registro da placa ${placa} do relatório?`)) {
    try {
      await deleteDoc(doc(db, "solicitacoes_acesso", docId));
      carregarRelatorio();
    } catch (erro) {
      console.error("Erro ao apagar registro:", erro);
      alert("Erro ao excluir o registro do banco de dados.");
    }
  }
}

function trocarAba(aba) {
  if (aba === 'fila') {
    tabFila.classList.add('active');
    tabRelatorio.classList.remove('active');
    document.getElementById('secaoFila').style.display = 'flex';
    document.getElementById('secaoRelatorio').style.display = 'none';
  } else {
    tabRelatorio.classList.add('active');
    tabFila.classList.remove('active');
    document.getElementById('secaoFila').style.display = 'none';
    document.getElementById('secaoRelatorio').style.display = 'block';
    carregarRelatorio();
  }
}

function exportarCSV() {
  if (historicoCompleto.length === 0) {
    alert("Sem dados para exportar.");
    return;
  }

  let csv = "Placa;Veiculo;Solicitante;Empresa;Data e Hora;Status\n";
  historicoCompleto.forEach(r => {
    if (r.liberadoEm && !isNaN(new Date(r.liberadoEm))) {
      const dataHora = new Date(r.liberadoEm).toLocaleString('pt-BR');
      csv += `"${r.placa}";"${r.veiculo}";"${r.colaborador}";"${r.empresa}";"${dataHora}";"${r.status}"\n`;
    }
  });

  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio_cepan_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Event Listeners
btnAudioToggle.addEventListener('click', alternarAudio);
tabFila.addEventListener('click', () => trocarAba('fila'));
tabRelatorio.addEventListener('click', () => trocarAba('relatorio'));
inputBusca.addEventListener('input', renderizarTabela);
btnExportar.addEventListener('click', exportarCSV);

document.querySelectorAll('.btn-filtro').forEach(btn => {
  btn.addEventListener('click', (e) => {
    filtroAtual = e.target.getAttribute('data-filtro');
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderizarTabela();
  });
});