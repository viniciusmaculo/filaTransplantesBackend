const { conn, BigchainDB } = require('./connection');
const { createKeysForState, getKeysForState } = require('./keys');
const { createPatient } = require('../utils/masking');
const fs = require('fs');
const path = require('path');

// Cache de assets em um arquivo .json
const ASSETS_FILE = path.join(__dirname, '../assets.json');

let assetCache = {};

// Carrega assets do disco se existir
if (fs.existsSync(ASSETS_FILE)) {
  try {
    assetCache = JSON.parse(fs.readFileSync(ASSETS_FILE));
  } catch (err) {
    console.error("Erro ao ler assets.json", err);
    assetCache = {};
  }
}

// Salva assets no disco
function saveAssets() {
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(assetCache, null, 2));
}

// CACHE EM MEMÓRIA

// Guarda apenas o último tx_id de cada fila
// Ex: lastTxCache["RJ-rim"] = "abcd1234"
const lastTxCache = {};

// Gera a chave para armazenar os IDs em cache
function cacheKey(estado, orgao) {
  return `${estado}-${orgao}`;
}

// BUSCA DO ASSET
async function findAssetByStateAndOrgan(estado, orgao) {
  const key = cacheKey(estado, orgao);

  if (assetCache[key]) {
    return {
      id: assetCache[key],
      data: {
        tipo: "fila-transplantes",
        estado,
        orgao
      }
    };
  }

  return null;
}

 // 1. CRIAMOS O PRIMEIRO ASSET DO ÓRGÃO NO ESTADO (primeira versão da fila)
 // Recebe dois parâmetros: estado (UF) e orgao (ex: 'rim')
async function createOrganAsset(estado, orgao) {

  const key = cacheKey(estado, orgao);

  if (assetCache[key]) {
    throw new Error("Fila já existe para este estado e órgão.");
  }

  let keyPair = getKeysForState(estado);

  // Gera ou recupera o par de chaves do ESTADO (só o estado tem a private key)
  // Se não existir chave para o estado, criamos uma
  if (!keyPair) {
    console.log(`Criando par de chaves para o estado ${estado}...`);
    keyPair = createKeysForState(estado);
  }

  // Esse é o "asset" inicial, contendo estado + órgão
  const assetData = {
    tipo: "fila-transplantes",
    estado,
    orgao
  };

  // Metadados da primeira transação (v1)
  const metadata = {
    versao: "v1",
    evento: "criado",
    usuario: `admin-${estado}`,
    timestamp: new Date().toISOString(),
    fila: []
  };

  // Criamos a primeira transação CREATE no BigchainDB
  const tx = BigchainDB.Transaction.makeCreateTransaction(
    assetData,
    metadata,
    [
      BigchainDB.Transaction.makeOutput(
        BigchainDB.Transaction.makeEd25519Condition(keyPair.publicKey)
      )
    ],
    keyPair.publicKey
  );

  // Assinamos com a chave privada do Estado
  const signed = BigchainDB.Transaction.signTransaction(tx, keyPair.privateKey);

  await conn.postTransactionCommit(signed);

  // Guarda o id do asset no cache
  assetCache[cacheKey(estado, orgao)] = signed.id;

  // Guarda o id da primeira transação no cache
  assetCache[key] = signed.id;
  saveAssets();

  lastTxCache[key] = signed.id;

  return signed.id;
}

 // 2. BUSCAR A ÚLTIMA TRANSAÇÃO DO ASSET (estado+orgao)
async function getLastTransaction(estado, orgao) {
  const asset = await findAssetByStateAndOrgan(estado, orgao);
  if (!asset) return null;

  const key = cacheKey(estado, orgao);

  // Se já temos o último tx no cache, usamos direto
  if (lastTxCache[key]) {
    return await conn.getTransaction(lastTxCache[key]);
  }

  // PRIMEIRA VEZ: usa listTransactions só uma vez
  const txs = await conn.listTransactions(asset.id);
  const lastTx = txs[txs.length - 1];

  // Salva no cache
  lastTxCache[key] = lastTx.id;

  return lastTx;
}

 // 3. ADICIONAR PACIENTE NA FILA
async function addPatient(estado, orgao, cpf, nome, usuario) {
  let keyPair = getKeysForState(estado);

  if (!keyPair) {
    console.log(`Não havia chaves para ${estado}. Criando automaticamente...`);
    keyPair = createKeysForState(estado);
  }

  const lastTx = await getLastTransaction(estado, orgao);
  const fila = lastTx.metadata?.fila || [];

  const newPatient = createPatient(cpf, nome, fila.length + 1);
  const novaFila = [...fila, newPatient];

  // Gera a nova versão (v2, v3...)
  const lastVersionNum = lastTx.metadata?.versao ? parseInt(lastTx.metadata.versao.slice(1)) : 1;
  const version = `v${lastVersionNum + 1}`;

  const metadata = {
    versao: version,
    evento: "adicao",
    usuario,
    timestamp: new Date().toISOString(),
    pacienteAdicionado: newPatient,
    fila: novaFila
  };

  // Cria transação TRANSFER vinculada à última transação
  const tx = BigchainDB.Transaction.makeTransferTransaction(
    [{ tx: lastTx, output_index: 0 }],
    [
      BigchainDB.Transaction.makeOutput(
        BigchainDB.Transaction.makeEd25519Condition(keyPair.publicKey)
      )
    ],
    metadata
  );

  const signed = BigchainDB.Transaction.signTransaction(tx, keyPair.privateKey);

  await conn.postTransactionCommit(signed);

  // Atualiza o cache com o novo tx_id
  lastTxCache[cacheKey(estado, orgao)] = signed.id;

  return signed.id;
}

// 4. CHAMAR PACIENTE PELA POSIÇÃO NA FILA
async function callPatientByPosition(estado, orgao, position, usuario) {
  const keyPair = getKeysForState(estado);
  if (!keyPair)
    throw new Error(`Chaves não encontradas para o estado ${estado}.`);

  const lastTx = await getLastTransaction(estado, orgao);
  const fila = lastTx.metadata?.fila ? [...lastTx.metadata.fila] : [];

  const index = position - 1;
  if (index < 0 || index >= fila.length)
    return { error: "Posição inválida" };

  // Remove o paciente chamado
  const chamado = fila.splice(index, 1)[0];

  // Reordenando a fila
  const novaFila = fila.map((p, i) => ({ ...p, posicao: i + 1 }));

  const lastVersionNum = parseInt(lastTx.metadata.versao.slice(1));
  const version = `v${lastVersionNum + 1}`;

  const metadata = {
    versao: version,
    evento: "transplante",
    usuario,
    timestamp: new Date().toISOString(),
    pacienteChamado: chamado,
    fila: novaFila
  };

  const tx = BigchainDB.Transaction.makeTransferTransaction(
    [{ tx: lastTx, output_index: 0 }],
    [
      BigchainDB.Transaction.makeOutput(
        BigchainDB.Transaction.makeEd25519Condition(keyPair.publicKey)
      )
    ],
    metadata
  );

  const signed = BigchainDB.Transaction.signTransaction(tx, keyPair.privateKey);

  await conn.postTransactionCommit(signed);

  // Atualiza o cache com o ID da nova versão
  lastTxCache[cacheKey(estado, orgao)] = signed.id;

  return { chamado, novaFila, txId: signed.id };
}

// 5. CHAMAR O PRÓXIMO PACIENTE (Atualiza a fila)
async function callNextPatient(estado, orgao, usuario) {
  const keyPair = getKeysForState(estado);
  if (!keyPair)
    throw new Error(`Chaves não encontradas para o estado ${estado}.`);

  const lastTx = await getLastTransaction(estado, orgao);
  const fila = lastTx.metadata?.fila ? [...lastTx.metadata.fila] : [];

  if (fila.length === 0)
    return { empty: true };

  // Removemos o primeiro paciente
  const chamado = fila.shift();

  // Reordenando
  const novaFila = fila.map((p, i) => ({ ...p, posicao: i + 1 }));

  const lastVersionNum = parseInt(lastTx.metadata.versao.slice(1));
  const version = `v${lastVersionNum + 1}`;

  const metadata = {
    versao: version,
    evento: "transplante",
    usuario,
    timestamp: new Date().toISOString(),
    pacienteChamado: chamado,
    fila: novaFila
  };

  const tx = BigchainDB.Transaction.makeTransferTransaction(
    [{ tx: lastTx, output_index: 0 }],
    [
      BigchainDB.Transaction.makeOutput(
        BigchainDB.Transaction.makeEd25519Condition(keyPair.publicKey)
      )
    ],
    metadata
  );

  const signed = BigchainDB.Transaction.signTransaction(tx, keyPair.privateKey);

  await conn.postTransactionCommit(signed);

  // Atualiza o cache
  lastTxCache[cacheKey(estado, orgao)] = signed.id;

  return { txId: signed.id };
}

module.exports = {
  createOrganAsset,
  findAssetByStateAndOrgan,
  getLastTransaction,
  addPatient,
  callPatientByPosition,
  callNextPatient
};
