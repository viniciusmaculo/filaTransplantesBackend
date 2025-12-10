// routes/transplantRoutes.js

// Express para criar rotas HTTP
const express = require('express');
const router = express.Router();

const { conn } = require('../bigchain/connection');

const {
  createOrganAsset,
  findAssetByStateAndOrgan,
  getLastTransaction, 
  addPatient,
  callPatientByPosition,
  callNextPatient
} = require('../bigchain/transactions');

// ROTA PARA CRIAR A FILA SEM ADICIONAR PACIENTE
// Ex: POST /transplant/RJ/rim/create
router.post('/:estado/:orgao/create', async (req, res) => {
  const { estado, orgao } = req.params;

  try {
    // Verifica se já existe
    const existente = await findAssetByStateAndOrgan(estado, orgao);
    if (existente)
      return res.status(400).json({ error: "Fila já existe — não é possível recriar." });

    const txId = await createOrganAsset(estado, orgao);

    return res.json({
      success: true,
      message: "Fila criada com sucesso (sem pacientes).",
      txId
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA PARA CONSULTAR A FILA ATUAL (somente a última versão)
// Ex: GET /transplant/RJ/rim
router.get('/:estado/:orgao', async (req, res) => {
  const { estado, orgao } = req.params;

  try {
    const asset = await findAssetByStateAndOrgan(estado, orgao);

    if (!asset)
      return res.status(404).json({ error: "Fila não encontrada" });

    const lastTx = await getLastTransaction(estado, orgao);

    return res.json({
      estado,
      orgao,
      txId: lastTx.id,
      metadata: lastTx.metadata
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA PARA ADICIONAR PACIENTE NA FILA
// Ex: POST /transplant/RJ/rim  { cpf, nome, usuario }
router.post('/:estado/:orgao', async (req, res) => {
  const { estado, orgao } = req.params;
  const { cpf, nome, usuario } = req.body;

  if (!cpf || !nome || !usuario)
    return res.status(400).json({ error: "CPF, nome e usuario são obrigatórios" });

  try {
    // Se não existir o asset, a função addPatient cria internamente (ela chama createOrganAsset)
    const txId = await addPatient(estado, orgao, cpf, nome, usuario);

    // Busca o estado atualizado
    const lastTx = await getLastTransaction(estado, orgao);

    return res.json({
      success: true,
      txId,
      metadata: lastTx.metadata
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA PARA CHAMAR UM PACIENTE PELA POSIÇÃO NA FILA
// Ex: POST /transplant/RJ/rim/next/position/3  { usuario }
router.post('/:estado/:orgao/next/position/:pos', async (req, res) => {
  const { estado, orgao, pos } = req.params;
  const { usuario } = req.body;

  if (!usuario) return res.status(400).json({ error: "usuario é obrigatório" });

  try {
    const asset = await findAssetByStateAndOrgan(estado, orgao);
    if (!asset) return res.status(404).json({ error: "Órgão não encontrado" });

    const result = await callPatientByPosition(estado, orgao, Number(pos), usuario);

    if (result.error) return res.status(400).json({ error: result.error });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA PARA CHAMAR O PRÓXIMO PACIENTE DA FILA
// Ex: POST /transplant/RJ/rim/next { usuario }
router.post('/:estado/:orgao/next', async (req, res) => {
  const { estado, orgao } = req.params;
  const { usuario } = req.body;

  if (!usuario) return res.status(400).json({ error: "usuario é obrigatório" });

  try {
    const asset = await findAssetByStateAndOrgan(estado, orgao);
    if (!asset) return res.status(404).json({ error: "Asset não encontrado" });

    const txId = await callNextPatient(estado, orgao, usuario);

    // Busca o estado após a atualização
    const lastTx = await getLastTransaction(estado, orgao);

    return res.json({
      success: true,
      txId,
      metadata: lastTx.metadata
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA - HISTÓRICO COMPLETO DO ASSET (mostrar todas versões)
// Ex: GET /transplant/RJ/rim/history
router.get('/:estado/:orgao/history', async (req, res) => {
  const { estado, orgao } = req.params;

  try {
    const asset = await findAssetByStateAndOrgan(estado, orgao);

    if (!asset) return res.status(404).json({ error: "Órgão não encontrado" });

    const assetId = asset.id;
    const txList = await conn.listTransactions(assetId);

    const historico = txList.map((tx, index) => ({
      versao: tx.metadata?.versao || `v${index + 1}`,
      evento: tx.metadata?.evento || "desconhecido",
      timestamp: tx.metadata?.timestamp || null,
      pacienteChamado: tx.metadata?.pacienteChamado || null,
      pacienteAdicionado: tx.metadata?.pacienteAdicionado || null,
      fila: tx.metadata?.fila || [],
      txId: tx.id
    }));

    return res.json({
      estado,
      orgao,
      totalVersoes: historico.length,
      historico
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ROTA PARA VER APENAS UMA VERSÃO ESPECÍFICA DO HISTÓRICO
// Ex: GET /transplant/RJ/rim/history/v3
router.get('/:estado/:orgao/history/:version', async (req, res) => {
  const { estado, orgao } = req.params;
  const versionToFind = req.params.version;

  try {
    const asset = await findAssetByStateAndOrgan(estado, orgao);

    if (!asset) return res.status(404).json({ error: "Órgão não encontrado" });

    const assetId = asset.id;
    const txList = await conn.listTransactions(assetId);

    const tx = txList.find(t => t.metadata?.versao === versionToFind);

    if (!tx) return res.status(404).json({ error: "Versão não encontrada" });

    return res.json({
      estado,
      orgao,
      versao: versionToFind,
      metadata: {
        ...tx.metadata,
        pacienteChamado: tx.metadata?.pacienteChamado || null,
        pacienteAdicionado: tx.metadata?.pacienteAdicionado || null
      },
      txId: tx.id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;