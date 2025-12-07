// index.js

// Configuramos um servidor Express na porta 3000, com rotas para '/transplant' definidas em 'transplantRoutes.js'.

const express = require('express');
const cors = require('cors');

const app = express();

// Habilita CORS para aceitar requisições do front-end
app.use(cors());

app.use(express.json());

const transplantRoutes = require('./routes/transplantRoutes.js');

app.use('/transplant', transplantRoutes);

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});