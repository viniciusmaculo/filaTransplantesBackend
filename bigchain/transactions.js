// bigchain/transactions.js

const { conn, BigchainDB } = require('./connection');
const { createKeysForState, getKeysForState } = require('./keys');
const { createPatient } = require('../utils/masking');


  // Busca um asset que corresponda exatamente ao estado + orgao
  // Retorna null se não encontrar.

async function findAssetByStateAndOrgan(estado, orgao) {
  // Busca por estado (query) e filtra localmente para garantir correspondência exata
  const assets = await conn.searchAssets(estado);

  // assets pode conter itens onde qualquer campo contém a string 'estado'
  // filtramos para encontrar exatamente o asset com asset.data.estado === estado e asset.data.orgao === orgao
  const found = assets.find(a =>
    a.data &&
    a.data.tipo === 'fila-transplantes' &&
    a.data.estado === estado &&
    a.data.orgao === orgao
  );

  return found || null;
}


 // 1. CRIAMOS O PRIMEIRO ASSET DO ÓRGÃO NO ESTADO (primeira versão da fila)
 // Recebe dois parâmetros: estado (UF) e orgao (ex: 'rim')
async function createOrganAsset(estado, orgao) {

  // Gera ou recupera o par de chaves do ESTADO (só o estado tem a private key)
  // Se não existir chave para o estado, criamos uma
  let keyPair = getKeysForState(estado);
  
  if (!keyPair) {
    console.log(`➡ Criando par de chaves para o estado ${estado}...`);
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

  return signed.id;
}


 // 2. BUSCAR A ÚLTIMA TRANSAÇÃO DO ASSET (estado+orgao)
async function getLastTransaction(estado, orgao) {

  // 1. Encontrar o asset da fila
  const asset = await findAssetByStateAndOrgan(estado, orgao);
  if (!asset) return null;

  const assetId = asset.id;

  // 2. Buscar todas as transações do asset
  const txs = await conn.listTransactions(assetId);
  if (!txs || txs.length === 0) return null;

  // 3. Retornar a transação mais recente (última posição do array)
  return txs[txs.length - 1];
}


 // 3. ADICIONAR PACIENTE NA FILA
async function addPatient(estado, orgao, cpf, nome, usuario) {
  // Recupera as chaves do Estado (somente quem tem a private key do estado pode alterar filas daquele estado)
  let keyPair = getKeysForState(estado);

  if (!keyPair) {
    console.log(`➡ Não havia chaves para ${estado}. Criando automaticamente...`);
    keyPair = createKeysForState(estado);
  }

  // Busca o asset correspondente (estado + orgao)
  let asset = await findAssetByStateAndOrgan(estado, orgao);

  // Buscar última versão da fila
  const lastTx = await getLastTransaction(estado, orgao);

  const fila = lastTx.metadata?.fila || [];

  const newPatient = createPatient(cpf, nome, fila.length + 1);

  const novaFila = [...fila, newPatient];

  // Gera a nova versão (v2, v3...)
  const lastVersionNum = lastTx.metadata?.versao ? parseInt(String(lastTx.metadata.versao).slice(1)) : 1;
  const version = `v${(lastVersionNum || 1) + 1}`;

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

  return signed.id;
}

// 4. CHAMAR PACIENTE PELA POSIÇÃO NA FILA
async function callPatientByPosition(estado, orgao, position, usuario) {
  const keyPair = getKeysForState(estado);

  if (!keyPair)
    throw new Error(`Chaves não encontradas para o estado ${estado}.`);

  const asset = await findAssetByStateAndOrgan(estado, orgao);
  if (!asset) return { error: "Asset não encontrado" };

  const lastTx = await getLastTransaction(estado, orgao);

  const fila = lastTx.metadata?.fila ? [...lastTx.metadata.fila] : [];

  const index = position - 1;
  if (index < 0 || index >= fila.length) {
    return { error: "Posição inválida" };
  }

  // Remove o paciente chamado
  const chamado = fila.splice(index, 1)[0];

  // Reordenando a fila
  const novaFila = fila.map((p, i) => ({ ...p, posicao: i + 1 }));

  const lastVersionNum = lastTx.metadata?.versao ? parseInt(String(lastTx.metadata.versao).slice(1)) : 1;
  const version = `v${(lastVersionNum || 1) + 1}`;

  const metadata = {
    versao: version,
    evento: `transplante`,
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

  return {
    chamado,
    novaFila,
    txId: signed.id
  };
}

// 5. CHAMAR O PRÓXIMO PACIENTE (Atualiza a fila)
async function callNextPatient(estado, orgao, usuario) {
  const keyPair = getKeysForState(estado);

  if (!keyPair)
    throw new Error(`Chaves não encontradas para o estado ${estado}.`);

  const asset = await findAssetByStateAndOrgan(estado, orgao);
  if (!asset) return { error: "Asset não encontrado" };

  const lastTx = await getLastTransaction(estado, orgao);

  const fila = lastTx.metadata?.fila ? [...lastTx.metadata.fila] : [];

  if (fila.length === 0)
    return { empty: true };

  // Removemos o primeiro paciente
  const chamado = fila.shift();

  // Reordenando
  const novaFila = fila.map((p, i) => ({ ...p, posicao: i + 1 }));

  const lastVersionNum = lastTx.metadata?.versao ? parseInt(String(lastTx.metadata.versao).slice(1)) : 1;
  const version = `v${(lastVersionNum || 1) + 1}`;

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