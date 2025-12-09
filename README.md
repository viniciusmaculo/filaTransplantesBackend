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

Cada fila de transplantes (um asset no BigchainDB) executa uma sequência de operações INSERT (adição de pacientes) e depois CALL (chamada do próximo paciente), enquanto outras filas são atualizadas em paralelo, simulando um ambiente real onde vários hospitais/estados realizam operações ao mesmo tempo.

O objetivo é medir:

1. Tempo de criação da fila (CREATE) - milissegundos (ms)
2. Latências individuais de cada operação - milissegundos (ms)
3. Médias e desvios padrão por tipo de operação - milissegundos (ms)
4. Tempo médio total por fila - milissegundos (ms)
5. Métricas globais considerando todas as filas - milissegundos (ms)
6. Throughput - Transações por segundo (Tx/s)
7. Tempo total do benchmark - segundos (s)

Tudo está sendo salvo automaticamente em arquivos `.json` para consulta posterior.

## Como rodar o benchmark

No terminal, execute:

node benchmark.js ESTADO QTD_FILAS QTD_INSERTS QTD_CALLS

Se rodar somente:
node benchmark.js ESTADO 
(Assume 4 filas, 10 adicções e 0 chamadas)

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

### insercoes_por_orgao (INSERTs)

Quantidade de pacientes adicionados em cada fila.

---

### calls_por_orgao (CALLs)

Quantidade de chamadas de “próximo paciente” por órgão, simulando uso real da fila.

---

### tempo_total_seg

Tempo total (em segundos) que o benchmark levou para rodar do início ao fim.

Inclui todas as filas rodando em paralelo.

---

### total_transacoes

Total de transações executadas no teste:

Inclui:

CREATE (se necessário)
Todos os INSERTs
Todos os CALLs

---

### throughput_tx_s (Tx/s)

Quantas **transações por segundo** a API conseguiu processar.  

É uma medida de **desempenho geral**:  

-> Quanto maior o throughput, melhor a API está lidando com carga.

---

## Métricas por tipo de operação (por órgão)

Essas métricas analisam separadamente INSERTs e CALLs.

---

### insert_media_ms_por_orgao

Tempo médio, em milissegundos, de cada operação INSERT por fila.

Mostra o tempo típico para adicionar um novo paciente no BigchainDB.

---

### insert_desvio_ms_por_orgao

Mostra a variação dos tempos de INSERT.

Quanto maior o desvio padrão, mais instável está a fila.

---

### call_media_ms_por_orgao

Tempo médio das operações CALL por fila.

CALL representa "chamar o próximo paciente".

---

### call_desvio_ms_por_orgao

Desvio padrão das operações CALL.

Indica estabilidade da fila durante operações de remoção.

---

### call_media_ms_por_orgao

Tempo médio das operações CALL por fila.

CALL representa "chamar o próximo paciente".

---

## Métricas totais por fila (INSERT + CALL)

Essas métricas combinam todas as operações de uma mesma fila, permitindo avaliar o desempenho como um todo.

---

### total_media_ms_por_orgao

Tempo médio geral da fila (única média combinando INSERT + CALL).

Boa para comparar qual fila (qual órgão) é mais lenta no sistema.

### total_desvio_ms_por_orgao

Desvio padrão geral da fila inteira.

Mostra o quanto os tempos de resposta variam dentro de cada órgão.

---

## Métricas globais (todas as filas desse estado juntas)

São métricas que calculam a média e o desvio padrão de todas as latências (INSERT + CALL) registradas no teste inteiro, considerando todas as filas deste estado nesta máquina.

---

### total_media_ms_global

Média de todas as operações de todas as filas.

Resumo estatístico geral do teste.

### total_desvio_ms_global

Desvio padrão global de todas as latências.

Quanto mais baixo, mais estável o sistema como um todo.

---

## Latências completas

Além das médias, o arquivo também traz todas as latências individuais:

### create_latencias_ms_por_orgao

### insert_latencias_ms_por_orgao

### call_latencias_ms_por_orgao

## erros

Lista com quaisquer erros que aconteceram durante o teste.  
Se estiver vazia, significa que o teste rodou sem problemas.

## TESTE PRÁTICO PARA TRABALHO


Comandos Benchmark

Estado: RJ

1 Fila
node benchmark.js RJ 1 64 64
node benchmark.js RJ 1 128 128
node benchmark.js RJ 1 256 256

2 Filas
node benchmark.js RJ 2 64 64
node benchmark.js RJ 2 128 128
node benchmark.js RJ 2 256 256

4 Filas
node benchmark.js RJ 4 64 64
node benchmark.js RJ 4 128 128
node benchmark.js RJ 4 256 256

---

Estado: SP

1 Fila
node benchmark.js SP 1 64 64
node benchmark.js SP 1 128 128
node benchmark.js SP 1 256 256

2 Filas
node benchmark.js SP 2 64 64
node benchmark.js SP 2 128 128
node benchmark.js SP 2 256 256

4 Filas
node benchmark.js SP 4 64 64
node benchmark.js SP 4 128 128
node benchmark.js SP 4 256 256

---

Estado: MG

1 Fila
node benchmark.js MG 1 64 64
node benchmark.js MG 1 128 128
node benchmark.js MG 1 256 256

2 Filas
node benchmark.js MG 2 64 64
node benchmark.js MG 2 128 128
node benchmark.js MG 2 256 256

4 Filas
node benchmark.js MG 4 64 64
node benchmark.js MG 4 128 128
node benchmark.js MG 4 256 256

---

Estado: ES

1 Fila
node benchmark.js ES 1 64 64
node benchmark.js ES 1 128 128
node benchmark.js ES 1 256 256

2 Filas
node benchmark.js ES 2 64 64
node benchmark.js ES 2 128 128
node benchmark.js ES 2 256 256

4 Filas
node benchmark.js ES 4 64 64
node benchmark.js ES 4 128 128
node benchmark.js ES 4 256 256