// benchmark.js
// Este arquivo faz testes de desempenho chamando as rotas reais da API.
// Aqui eu simulo vários inserts e calls em filas de transplantes
// e meço quanto tempo cada operação demora (latência).
// Depois calculo médias, desvios padrão e métricas gerais de desempenho.
//
// Como usar:
//   node benchmark.js <ESTADO> <QTD_FILAS> <QTD_INSERTS> <QTD_CALLS>
// Exemplo:
//   node benchmark.js MG 2 10 3

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// URL base da API que será testada
const API_URL = "http://localhost:3000/transplant";

// Aqui defino quais órgãos testar dependendo da quantidade pedida no terminal
const ORG_BY_QTD = {
  1: ["rim"],
  2: ["rim", "figado"],
  4: ["rim", "figado", "coracao", "pulmao"]
};

// Função para medir tempo com alta precisão em milissegundos
// Uso ela para ver quanto cada operação da API demorou
const agora = () => {
  const [s, n] = process.hrtime();
  return s * 1000 + n / 1e6;
};

// Função para gerar nomes de arquivos no formato brasileiro (dia-mês-ano)
function timestampBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}__${String(d.getHours()).padStart(2,"0")}h${String(d.getMinutes()).padStart(2,"0")}m${String(d.getSeconds()).padStart(2,"0")}s`;
}

// Gero dados falsos de pacientes, só para simular carga real
function gerarCPF(seed) {
  return String(Math.floor(Math.random() * 1e9) + seed).padStart(11,"0");
}

function gerarNomeCompleto() {
  const n = ["Ana","Paulo","Julia","Clara","Rafael","Mateus","João","Helena","Bianca"];
  const s = ["Silva","Souza","Pereira","Costa","Oliveira","Santos","Gomes"];
  return n[Math.floor(Math.random()*n.length)] + " " + s[Math.floor(Math.random()*s.length)];
}

// -------------------------------------------------
// LEITURA DOS PARÂMETROS DO TERMINAL
// -------------------------------------------------

// Aqui pego os parâmetros que o usuário digitou
const estado = (process.argv[2] || "SP").toUpperCase();
const qtdFilas = Number(process.argv[3]) || 4;
const qtdInserts = Number(process.argv[4]) || 10;
const qtdCalls = Number(process.argv[5]) || 0;

// Escolho automaticamente quais órgãos serão testados
const orgaos = ORG_BY_QTD[qtdFilas] || ORG_BY_QTD[4];

// Só imprimindo no console para o usuário entender o teste que está rodando
console.log("==================================================");
console.log("BENCHMARK API - FILA DE TRANSPLANTES");
console.log("Estado:", estado);
console.log("Órgãos:", orgaos.join(", "));
console.log("Inserções por órgão:", qtdInserts);
console.log("Chamadas por órgão:", qtdCalls);
console.log("==================================================");

// -------------------------------------------------
// OBJETO QUE VAI GUARDAR TODOS OS RESULTADOS
// -------------------------------------------------

const result = {
  estado,
  orgaos,
  insercoes_por_orgao: qtdInserts,
  calls_por_orgao: qtdCalls,

  // Aqui salvo as listas de tempos de cada operação
  create_latencias_ms_por_orgao: {},
  insert_latencias_ms_por_orgao: {},
  call_latencias_ms_por_orgao: {},

  erros: []
};

// -------------------------------------------------
// FUNÇÕES QUE CHAMAM A API REAL
// -------------------------------------------------

// Consulta a fila
async function apiGetFila(estado, orgao) {
  return (await fetch(`${API_URL}/${estado}/${orgao}`)).json();
}

// Cria a fila se não existir
async function apiCreateFila(estado, orgao) {
  return (await fetch(`${API_URL}/${estado}/${orgao}/create`, { method:"POST" })).json();
}

// Adiciona paciente (INSERT)
async function apiInsert(estado, orgao, cpf, nome) {
  return (
    await fetch(`${API_URL}/${estado}/${orgao}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ cpf, nome, usuario:"benchmark" })
    })
  ).json();
}

// Chama o próximo paciente (CALL)
async function apiCallNext(estado, orgao) {
  return (
    await fetch(`${API_URL}/${estado}/${orgao}/next`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ usuario:"benchmark" })
    })
  ).json();
}

// -------------------------------------------------
// FUNÇÕES DE ESTATÍSTICAS
// -------------------------------------------------

// Calcula média de latências
function media(lista) {
  const v = lista.filter(x => x != null);
  if (!v.length) return null;
  return v.reduce((s,x) => s+x, 0) / v.length;
}

// Calcula desvio padrão
function desvioPadrao(lista) {
  const v = lista.filter(x => x != null);
  if (!v.length) return null;
  const m = media(v);
  const variancia = v.reduce((s,x)=>s+(x-m)**2,0) / v.length;
  return Math.sqrt(variancia);
}

// -------------------------------------------------
// FUNÇÃO QUE TESTA UM ÓRGÃO ESPECÍFICO
// -------------------------------------------------

async function testarOrgao(orgao, idx) {
  // Aqui vou guardar os tempos de cada ação
  const latCreate = [];
  const latInsert = [];
  const latCall = [];

  try {
    console.log(`\n>>> Testando órgão: ${orgao}...`);

    // Primeiro verifico se a fila existe
    const existente = await apiGetFila(estado, orgao);

    // Se não existe, crio e meço o tempo
    if (!existente || existente.error) {
      const t0 = agora();
      await apiCreateFila(estado, orgao);
      const t1 = agora();
      latCreate.push(t1 - t0);
      console.log(`  CREATE ${orgao} em ${latCreate[0].toFixed(2)} ms`);
    } else {
      // Se já existe, não preciso criar de novo
      latCreate.push(null);
      console.log(`  CREATE ${orgao} ignorado (fila já existe)`);
    }

    // Agora faço todos os INSERTs
    for (let i = 0; i < qtdInserts; i++) {
      const t0 = agora();
      await apiInsert(estado, orgao, gerarCPF(idx+i+Date.now()), gerarNomeCompleto());
      const t1 = agora();
      latInsert.push(t1 - t0);
      console.log(`  INSERT ${orgao} #${i+1} em ${latInsert[i].toFixed(2)} ms`);
    }

    // Depois faço todos os CALLs (chamar o próximo)
    for (let j = 0; j < qtdCalls; j++) {
      const t0 = agora();
      await apiCallNext(estado, orgao);
      const t1 = agora();
      latCall.push(t1 - t0);
      console.log(`  CALL (next) ${orgao} #${j+1} em ${latCall[j].toFixed(2)} ms`);
    }

  } catch (err) {
    // Se der erro em algum órgão, salvo para analisar depois
    result.erros.push({ orgao, erro: err.message });
  }

  // Aqui armazeno tudo no objeto final
  result.create_latencias_ms_por_orgao[orgao] = latCreate;
  result.insert_latencias_ms_por_orgao[orgao] = latInsert;
  result.call_latencias_ms_por_orgao[orgao] = latCall;
}

// -------------------------------------------------
// EXECUÇÃO PRINCIPAL DO BENCHMARK
// -------------------------------------------------

(async () => {

  const inicio = agora(); // tempo inicial

  // Executo cada fila do estado em paralelo
  await Promise.all(orgaos.map((o,i) => testarOrgao(o,i)));

  const fim = agora(); // tempo final
  const totalSeg = (fim - inicio) / 1000;

  // Aqui calculo todas as métricas por órgão e globais
  const insert_media_ms_por_orgao = {};
  const insert_desvio_ms_por_orgao = {};
  const call_media_ms_por_orgao = {};
  const call_desvio_ms_por_orgao = {};
  const total_media_ms_por_orgao = {};
  const total_desvio_ms_por_orgao = {};

  let totalTx = 0; // total de transações realizadas
  let todas_latencias_totais = []; // para métricas globais

  // Para cada órgão calculo as estatísticas
  orgaos.forEach(org => {
    const creates = result.create_latencias_ms_por_orgao[org];
    const inserts = result.insert_latencias_ms_por_orgao[org];
    const calls = result.call_latencias_ms_por_orgao[org];

    // Cálculo das médias e desvios
    insert_media_ms_por_orgao[org] = media(inserts);
    insert_desvio_ms_por_orgao[org] = desvioPadrao(inserts);

    call_media_ms_por_orgao[org] = media(calls);
    call_desvio_ms_por_orgao[org] = desvioPadrao(calls);

    // Junto inserts + calls para obter a métrica total da fila
    const totalFila = [...inserts, ...calls].filter(v => v != null);
    total_media_ms_por_orgao[org] = media(totalFila);
    total_desvio_ms_por_orgao[org] = desvioPadrao(totalFila);

    todas_latencias_totais.push(...totalFila);

    // Conto número total de transações feitas
    totalTx += creates.filter(x=>x!=null).length;
    totalTx += inserts.length;
    totalTx += calls.length;
  });

  // Agora calculo as métricas globais (todas as filas juntas)
  const total_media_ms_global = media(todas_latencias_totais);
  const total_desvio_ms_global = desvioPadrao(todas_latencias_totais);

  // Throughput = transações por segundo
  const throughput = totalTx / totalSeg;

  // P/ salvar no JSON final
  const resumo = {
    estado,
    orgaos,
    insercoes_por_orgao: qtdInserts,
    calls_por_orgao: qtdCalls,

    tempo_total_seg: Number(totalSeg.toFixed(3)),
    total_transacoes: totalTx,
    throughput_tx_s: Number(throughput.toFixed(3)),

    insert_media_ms_por_orgao,
    insert_desvio_ms_por_orgao,
    call_media_ms_por_orgao,
    call_desvio_ms_por_orgao,
    total_media_ms_por_orgao,
    total_desvio_ms_por_orgao,

    total_media_ms_global,
    total_desvio_ms_global,

    create_latencias_ms_por_orgao: result.create_latencias_ms_por_orgao,
    insert_latencias_ms_por_orgao: result.insert_latencias_ms_por_orgao,
    call_latencias_ms_por_orgao: result.call_latencias_ms_por_orgao,

    erros: result.erros
  };

  // Crio pasta de resultados se ainda não existir
  const pasta = path.join(__dirname, "benchmark-results-api");
  if (!fs.existsSync(pasta)) fs.mkdirSync(pasta);

  // Nome do arquivo com timestamp BR
  const nomeArquivo = `${estado}_${orgaos.length}_${qtdInserts}_${qtdCalls}_${timestampBR()}.json`;
  fs.writeFileSync(path.join(pasta, nomeArquivo), JSON.stringify(resumo, null, 2));

  // Resumo no console
  console.log("\n==================================================");
  console.log("BENCHMARK FINALIZADO!");
  console.log("Arquivo salvo em:", nomeArquivo);
  console.log("Total de transações:", totalTx);
  console.log("Tempo total:", totalSeg.toFixed(3), "s");
  console.log("Throughput:", throughput.toFixed(3), "tx/s");
  console.log("==================================================\n");
})();