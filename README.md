# Sistema de Gestão de Fila de Transplantes de Orgãos com BigchainDB

Este sistema permite o gerenciamento de uma fila para transplantes por Estado e por Órgão. Através de comandos 'curl', você pode adicionar pacientes à fila, consultar a fila, chamar o próximo paciente e verificar o histórico de ações realizadas.

Cada combinação Estado + Órgão gera um Asset independente, com sua própria sequência de versões (v1, v2, v3…).

## 1. Iniciar o Servidor

Para iniciar o servidor, execute o seguinte comando:

node index.js

--------------------------------------------------------------------------

Em outro terminal (bash), siga os comandos abaixo, substituindo:

estado → exemplo: RJ, SP, MG, ES

orgao → exemplo: rim, figado, coracao

## 2. Criando fila

curl -X POST http://localhost:3000/transplant/RJ/rim/create \
     -H "Content-Type: application/json"

## 3. Adicionar Pacientes à Fila

- **Paciente 1**:
  
  curl -X POST http://localhost:3000/transplant/estado/orgao \
  -H "Content-Type: application/json" \
  -d '{"cpf":"11122233344","nome":"Carlos Aguiar","usuario":"admin-RJ"}'

- **Paciente 2**:

  curl -X POST http://localhost:3000/transplant/estado/orgao \
  -H "Content-Type: application/json" \
  -d '{"cpf":"55566677788","nome":"Maria Santos","usuario":"admin-RJ"}'

- **Paciente 3**:

  curl -X POST http://localhost:3000/transplant/estado/orgao \
  -H "Content-Type: application/json" \
  -d '{"cpf":"99988877766","nome":"João Almeida","usuario":"admin-RJ"}'

## 3. Consultar a Fila

Se a fila já foi criada, você pode consultar todos os pacientes na fila com o seguinte comando:

curl -X GET http://localhost:3000/transplant/estado/orgao

## 4. Chamar o Primeiro da Fila

Para chamar o primeiro paciente da fila, execute o comando abaixo:

curl -X POST http://localhost:3000/transplant/estado/orgao/next \
-H "Content-Type: application/json" \
-d '{"usuario":"admin-RJ"}'

## 5. Chamar Qualquer Posição da Fila

Para chamar um paciente de qualquer posição da fila, utilize o comando abaixo, substituindo 'position' pelo número da posição desejada (começa do 1):

curl -X POST http://localhost:3000/transplant/estado/orgao/next/position/2 \
-H "Content-Type: application/json" \
-d '{"usuario":"admin-RJ"}'

## 6. Consultar o Histórico Completo

Para consultar o histórico completo de ações realizadas na fila, execute o seguinte comando:

curl -X GET http://localhost:3000/transplant/estado/orgao/history

## 7. Consultar uma Versão Específica do Histórico

Para consultar uma versão específica do histórico, substitua 'v3' pela versão desejada:

curl -X GET http://localhost:3000/transplant/estado/orgao/history/v3


# Benchmark da Fila de Transplantes de Orgãos com BigchainDB

Este projeto inclui um script que realiza **testes de desempenho** chamando diretamente as rotas da API de transplantes.  

Cada fila de transplante de orgãos (asset) de um mesmo estado executa N transações, uma após a outra, enquanto outras filas de transplantes rodam em paralelo.
 
Isso simula um ambiente mais real, onde vários assets podem estar sendo atualizados ao mesmo tempo.

O objetivo é medir:

1. Tempo de criação da fila (CREATE) — milissegundos (ms)
2. Latências individuais de cada operação por fila — milissegundos (ms)
3. Médias de latência por fila — milissegundos (ms)
4. Throughput — transações por segundo (tx/s)

Quanto tempo o benchmark levou do início ao fim.

Tudo está sendo salvo automaticamente em arquivos `.json` para consulta posterior.

## Como rodar o benchmark

No terminal, execute:

node benchmark.js ESTADO QTD_FILAS TRANSACOES_POR_ORGAO

Se rodar somente:
node benchmark.js ESTADO 
(Assume 4 filas e 10 transações)

## Como as filas são escolhidas

Dependendo da quantidade de filas informada, o script usa:

Quantidade | Órgãos usados                
---------- | ---------------------------- 
1          | rim                          
2          | rim, figado                  
4          | rim, figado, coracao, pulmao 

## Os arquivos vão para essa pasta:

benchmark-results-api/

## Explicação das Métricas

### estado

Mostra qual estado (SP, RJ, MG, ES) foi testado.

---

### orgaos

Lista dos órgãos (filas) que participaram do teste.  
Cada órgão representa um asset separado dentro do BigchainDB.

---

### transacoes_por_orgao

**Quantidade de transações** (addPatient) feitas **em cada órgão**.  
Quanto maior esse número, maior a pressão colocada sobre a API no teste.

---

### tempo_total_seg

**Tempo total** que o benchmark levou do início ao fim, em **segundos (s)**.  
Útil para comparar testes diferentes e ver se a API está ficando mais lenta.

---

### total_transacoes

Quantidade **total de transações realizadas no teste**.  

Inclui:
- A criação da fila (CREATE), caso ela não exista  
- Todas as transações de atualização (TRANSFER)

---

### throughput_tx_s (Tx/s)

Quantas **transações por segundo** a API conseguiu processar.  

É uma medida de **desempenho geral**:  

-> Quanto maior o throughput, melhor a API está lidando com carga.

---

### latencia_media_transfer_ms_por_orgao

**Tempo médio das transações** de atualização (TRANSFER), que simulam entrada de pacientes, em **milissegundos (ms)**.

Mostra a velocidade real do sistema para atualizar filas já existentes.

---

### create_latencias_ms_por_orgao

Lista com os **tempo do CREATE**, em **milissegundos (ms)**.  

Como só cria uma vez por órgão, é um único valor ou `null`.

---

### transfer_latencias_ms_por_orgao

Lista com os **tempos de cada TRANSFER**, em **milissegundos (ms)**.  

---

### erros

Lista com quaisquer erros que aconteceram durante o teste.  
Se estiver vazia, significa que o teste rodou sem problemas.


