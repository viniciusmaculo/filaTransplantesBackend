// bigchain/keys.js

// Biblioteca para ler e escrever arquivos no sistema
const fs = require('fs');
const path = require('path');

const { BigchainDB } = require('./connection');

// Caminho onde vamos salvar as chaves de cada ESTADO (antes estávamos usando organKeys.json)
const KEYS_FILE = path.join(__dirname, '../stateKeys.json');

let stateKeys = {};

// Se o arquivo de chaves já existe, carregamos ele para a memória
if (fs.existsSync(KEYS_FILE)) {
  try {
    stateKeys = JSON.parse(fs.readFileSync(KEYS_FILE));
  } catch (err) {
    console.error('Erro ao ler stateKeys.json, iniciando com objeto vazio.', err);
    stateKeys = {};
  }
}

// Função para salvar as chaves no arquivo stateKeys.json
function saveKeys() {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(stateKeys, null, 2));
}

/**
 * Cria um par de chaves para um ESTADO (UF) e salva em stateKeys.json
 * Ex: createKeysForState('RJ')
 */
function createKeysForState(stateUF) {
  // Gera chave privada e pública com a biblioteca do bigchain
  const keyPair = new BigchainDB.Ed25519Keypair();

  stateKeys[stateUF] = {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };

  saveKeys();

  return keyPair;
}

/**
 * Recupera as chaves de um ESTADO previamente criado.
 * Retorna null se não existir.
 */
function getKeysForState(stateUF) {
  const data = stateKeys[stateUF];
  if (!data) return null;

  // Reconstruímos o par de chaves no formato do BigchainDB
  const keyPair = new BigchainDB.Ed25519Keypair();
  keyPair.publicKey = data.publicKey;
  keyPair.privateKey = data.privateKey;

  return keyPair;
}

module.exports = {
  createKeysForState,
  getKeysForState
};
