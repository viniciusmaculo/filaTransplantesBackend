const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// URL da API que vamos testar
const API_URL = "http://localhost:3000/transplant";

// Órgãos usados no benchmark de acordo com a quantidade escolhida no terminal
const ORG_BY_QTD = {
  1: ["rim"],
  2: ["rim", "figado"],
  4: ["rim", "figado", "coracao", "pulmao"]
};

// Função para pegar o tempo atual em ms
// Usamos isso para medir a duração de CREATE e TRANSFER
const agora = () => {
  const [s, n] = process.hrtime();
  return s * 1000 + n / 1e6; // converte para milissegundos
};

// Função para gerar timestamp no padrão brasileiro
// Ex: 07-12-2025__14h32m55s
function timestampBR() {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const seg = String(d.getSeconds()).padStart(2, "0");

  return `${dia}-${mes}-${ano}__${hora}h${min}m${seg}s`;
}

// -------------------------------------------------
// GERADORES DE DADOS – Para simular pacientes
// -------------------------------------------------
function gerarCPF(seed) {
  const base = String(Math.floor(Math.random() * 1e9) + seed).padStart(9, "0");
  const dv = String(Math.floor(Math.random() * 90)).padStart(2, "0");
  return base + dv;
}

function gerarNomeCompleto() {
  const n = ["Ana", "Paulo", "Julia", "Clara", "Rafael", "Mateus", "João", "Helena", "Bianca"];
  const s = ["Silva", "Souza", "Pereira", "Costa", "Oliveira", "Santos", "Gomes"];
  return n[Math.floor(Math.random() * n.length)] + " " + s[Math.floor(Math.random() * s.length)];
}

// -------------------------------------------------
// ENTRADAS DO TERMINAL
// -------------------------------------------------
const estado = (process.argv[2] || "SP").toUpperCase();
const qtdFilas = Number(process.argv[3]) || 4;  // quantos órgãos testar
const qtdTrans = Number(process.argv[4]) || 10; // quantas TRANSFER por órgão

const orgaos = ORG_BY_QTD[qtdFilas] || ORG_BY_QTD[4];

console.log("==================================================");
console.log("BENCHMARK API - FILA DE TRANSPLANTES");
console.log("Estado:", estado);
console.log("Órgãos:", orgaos.join(", "));
console.log("Transações por órgão:", qtdTrans);
console.log("==================================================");

// Objeto onde vamos armazenar os resultados finais
const result = {
  estado,
  orgaos,
  transacoes_por_orgao: qtdTrans,
  create_latencias_ms_por_orgao: {},   // tempo dos CREATE
  transfer_latencias_ms_por_orgao: {}, // tempo das TRANSFERs
  erros: []
};

// -------------------------------------------------
// Funções que chamam a API
// -------------------------------------------------
async function apiGetFila(estado, orgao) {
  return (await fetch(`${API_URL}/${estado}/${orgao}`)).json();
}

async function apiCreateFila(estado, orgao) {
  // POST que cria a fila vazia
  return (
    await fetch(`${API_URL}/${estado}/${orgao}/create`, {
      method: "POST"
    })
  ).json();
}

async function apiAddPatient(estado, orgao, cpf, nome) {
  // POST que adiciona paciente (TRANSFER)
  return (
    await fetch(`${API_URL}/${estado}/${orgao}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpf, nome, usuario: "benchmark" })
    })
  ).json();
}

// -------------------------------------------------
// Função principal que testa cada órgão
// -------------------------------------------------
async function testarOrgao(orgao, idx) {
  const latCreate = [];   // guarda tempos do CREATE
  const latTransfer = []; // guarda tempos das TRANSFERs

  try {
    console.log(`Iniciando testes para ${orgao}...`);

    // Verifica se a fila já existe consultando a API
    const existente = await apiGetFila(estado, orgao);

    // Se a fila não existe nós criamos ela
    if (!existente || existente.error) {
      const t0 = agora();
      await apiCreateFila(estado, orgao);
      const t1 = agora();

      const lat = t1 - t0; // tempo gasto
      latCreate.push(lat);

      console.log(`CREATE (${orgao}) em ${lat.toFixed(2)} ms`);
    } else {
      // Se já existe, não medimos CREATE
      latCreate.push(null);
      console.log(`Fila ${orgao} já existe — CREATE ignorado.`);
    }

    // Agora executamos várias TRANSFERs (uma por vez)
    for (let i = 0; i < qtdTrans; i++) {
      const t2 = agora();
      await apiAddPatient(estado, orgao, gerarCPF(idx + i + Date.now()), gerarNomeCompleto());
      const t3 = agora();

      const lat = t3 - t2;
      latTransfer.push(lat);

      console.log(`TRANSFER ${orgao} #${i + 1} em ${lat.toFixed(2)} ms`);
    }
  } catch (err) {
    console.log(`ERRO no órgão ${orgao}: ${err.message}`);
    result.erros.push({ orgao, erro: err.message });
  }

  // Salvamos os tempos no resultado final
  result.create_latencias_ms_por_orgao[orgao] = latCreate;
  result.transfer_latencias_ms_por_orgao[orgao] = latTransfer;
}

// -------------------------------------------------
// Execução principal do benchmark
// -------------------------------------------------
(async () => {
  const inicio = agora();

  // Executa cada órgão em paralelo para simular múltiplos admins
  await Promise.all(orgaos.map(testarOrgao));

  const fim = agora();
  const totalMs = fim - inicio;
  const totalSeg = totalMs / 1000;

  // Função que calcula média das latências
  function media(lista) {
    const validos = lista.filter(v => v != null);
    if (!validos.length) return null;
    return validos.reduce((s, v) => s + v, 0) / validos.length;
  }

  let totalTx = 0;
  let mediasTransfer = {};

  // Para cada órgão...
  orgaos.forEach(org => {
    const c = result.create_latencias_ms_por_orgao[org];
    const t = result.transfer_latencias_ms_por_orgao[org];

    mediasTransfer[org] = media(t); // média das TRANSFERs

    totalTx += c.filter(x => x != null).length; // conta CREATE
    totalTx += t.filter(x => x != null).length; // conta TRANSFER
  });

  const throughput = totalTx / totalSeg; // tx/s

  // Objeto final que será salvo no JSON
  const resumo = {
    estado,
    orgaos,
    transacoes_por_orgao: qtdTrans,

    tempo_total_seg: Number(totalSeg.toFixed(3)),
    total_transacoes: totalTx,
    throughput_tx_s: Number(throughput.toFixed(3)),

    latencia_media_transfer_ms_por_orgao: mediasTransfer,

    create_latencias_ms_por_orgao: result.create_latencias_ms_por_orgao,
    transfer_latencias_ms_por_orgao: result.transfer_latencias_ms_por_orgao,

    erros: result.erros
  };

  // Cria pasta se não existir
  const pasta = path.join(__dirname, "benchmark-results-api");
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);

  // Nome do arquivo no padrão brasileiro
  const nomeArquivo = `${estado}_${orgaos.length}_${qtdTrans}_${timestampBR()}.json`;

  fs.writeFileSync(path.join(pasta, nomeArquivo), JSON.stringify(resumo, null, 2));

  console.log("\n==================================================");
  console.log("BENCHMARK FINALIZADO!");
  console.log("Total de transações:", totalTx);
  console.log("Tempo total:", totalSeg.toFixed(3), "s");
  console.log("Throughput:", throughput.toFixed(3), "tx/s");
  console.log("==================================================\n");
})();