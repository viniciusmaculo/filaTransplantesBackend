// Conexão com BigchainDB
const BigchainDB = require('bigchaindb-driver');

const API_URL = 'http://bsi.cefet-rj.br:9984/api/v1/';
const conn = new BigchainDB.Connection(API_URL);

module.exports = { conn, BigchainDB };