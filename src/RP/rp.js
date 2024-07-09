const express = require('express');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 4000;
const crypto= require('crypto');
const configure = require('../../etc/configure.json');

// Logger setup
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'log/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'log/info.log', level: 'info' }),
    ],
});

let stats = {
    requests: 0,
    create: 0,
    read: 0,
    update: 0,
    delete: 0
};

/**
 * Middleware que serve para lidar com os erros que ocorrem durante o processamento dos pedidos HTTP.
 * Quando um erro é detectado, este middleware faz:
 * - o log do erro logger.error (err.stack)
 * - envia uma resposta ao cliente com o status HTTP 500 (Internal server error) e um objeto JSON com os detalhes do erro.
 */
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({
        data: 0,
        error: {
        code: 'eRP500',
            errno: 1,
            message: err.message
        }
    });
});

/**
 Middleware que serve para dar parse aoo corpo dos pedidos HTTP no formato JSON.
 Analisa esse JSON e disponibiliza-o no req.body da rota a ser processada.
 */
app.use(express.json());


/**
 Função responsável por escolher o DN com base na chave
 Aqui o correto seria usar o Raft
 */
const chooseDN = (key) => {
  const hash = crypto.createHash('md5').update(key).digest('hex');
  const dnIndex = parseInt(hash, 16) % configure.DNs.length;
  return configure.DNs[dnIndex];
};

/**
 * Função que gere um md5 com base na key recebida
 */
function generatehash(key) {
  return crypto.createHash('md5').update(key).digest('hex');
}

const isRequestFromTestClientDn = (req, dn) => {
  const testClientIP = configure.test_client_ip;
  let requestIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  // Handle IPv6 loopback
  if (requestIP === '::1') {
    requestIP = '127.0.0.1'; //localhost
  }
  return requestIP === testClientIP || dn.host !== requestIP;
};

/**
 * Função que recebe uma chave e devolve o Valor
 * Para isso faz um pedido a cada DN para perceber se a chave se encontra
 */
const findKeyInDNs = async (key) => {
  for (const dn of configure.DNs) {
    //for (const server of dn.servers) {
    let masterServer = dn.servers.find(s => s.id === dn.master_id);
      try {
        const response = await axios.get(`http://${masterServer.host}:${masterServer.port}/db/r`, {
          params: { key }
        });
        if (response.data.data !== 0) {
          return response.data;
        }
      } catch (error) {
        logger.error(`Error querying DN${dn.name} server ${server.id}`, error);
      }
    //}
  }
  return null;
};

/**
 * Função que recebe uma chave e devolve o DN onde essa chave se encontra
 * Para isso faz um pedido a cada DN para perceber se a chave se encontra
 */
const findDnsByKey = async (key) => {
  for (const dn of configure.DNs) {
    for (const server of dn.servers) {
      try {
        const response = await axios.get(`http://${server.host}:${server.port}/db/r`, {
          params: { key }
        });
        if (response.data.data !== 0) {
          return dn;
        }
      } catch (error) {
        logger.error(`Error querying DN${dn.name} server ${server.id}`, error);
      }
    }
  }
  return null;
};

/**
 * Retorna o status de todos os DNs master
 * Percorre todos os DNs e para cada master, faz um pedido (usando o axios) para obter o status.
 * No final junta cada resposta num array e retorna o array com todos os status
 */
app.get('/status', async (req, res) => {
  try {
    let statusArr = [];
    for (const dn of configure.DNs) {
      let masterServer = dn.servers.find(s => s.id === dn.master_id);
      let response = await axios.get(`http://${masterServer.host}:${masterServer.port}/status`);
      statusArr.push(response.data);
    }
    res.json({ data: statusArr, error: 0 });
  }
  catch (error) {
    res.json({ data: 0, error: { code: 'eRPStatus', errno: 2, message: error.message } });
  }
});

/**
 * Função responsável por fornecer estatisticas do RP
 */
app.get('/stats', (req, res) => {
  res.json({
    data: stats,
    error: 0
  });
});

/**
 * Função que adiciona a um DN (Escolhido aleatoriamente) um novo par key:value
 * O correto seria aqui seria usar raft
 */
app.post('/db/c', async (req, res) => {
  try {
    const { key, value } = req.body;
    const dn = chooseDN(key);
    //const randomServer = dnSelected.servers[Math.floor(Math.random() * dnSelected.servers.length)];
    req.body.hash = generatehash(key);
    const response = await axios.post(`http://${dn.servers[dn.master_id].host}:${dn.servers[dn.master_id].port}/db/c`, req.body);
    res.json(response.data);
  }
  catch (error) {
    logger.error('Error creating key-value pair', error);
    res.json({
      data: 0,
      error: { code: 'eRP02', errno: error.errno, message: error.message}
    });
  }
})

/**
 * Função que retorna o valor associado a uma chave, retornando um objeto json com detalhes em caso de erro (chave nao encontrada ou erro no processamento)
 */
app.get('/db/r', async (req, res) => {
  try {
    const { key } = req.query;
    const dnSelected = await findKeyInDNs(key);
    if (dnSelected) {
      stats.read++;
      res.json(dnSelected);
    }
    else {
      res.json({
        data: 0,
        error: { code: 'eRP03', errno: 3, message: 'Key not found' }
      });
    }
  }
  catch (error) {
    logger.error('Error reading key:value pair', error);
    res.json({
      data: 0,
      error: { code: 'eRP03', errno: error.errno, message: error.message }
    });
  }
});

/**
 * Responsável por atualizar o valor dada uma chave
 * Permite também eliminar certas propriedades do valor
 */
app.post('/db/u', async (req, res) => {
  try {
    const { key, value } = req.body;
    const dn = await findDnsByKey(key);
    if(dn) {
      //const randomServer = dnSelected.servers[Math.floor(Math.random() * dnSelected.servers.length)];
      const response = await axios.post(`http://${dn.servers[dn.master_id].host}:${dn.servers[dn.master_id].port}/db/u`, req.body);
      stats.update++;
      res.json(response.data);
    }
  }
  catch (error) {
    logger.error('Error updating key-value pair', error);
    res.json({
      data: 0,
      error: {code: 'eRP04', errno: error.errno, message: error.message }
    });
  }
});

/**
 * responsável por eliminar um par chave-valor.
 * Recebe como param a key a eliminar
 */
app.get('/db/d', async (req, res) => {
  try {
    const { key } = req.query;
    const dn = await findDnsByKey(key);
    if (dn) {

      //const randomServer = dnSelected.servers[Math.floor(Math.random() * dnSelected.servers.length)];
      const response = await axios.get(`http://${dn.servers[dn.master_id].host}:${dn.servers[dn.master_id].port}/db/d`, {
        params: { key }
      });
      stats.delete++;
      res.json(response.data);
    }
    else {
      res.json({
        data: 0,
        error: { code: 'eRP03', errno: 3, message: 'Key not found' }
      });
    }
  }
  catch (error) {
    logger.error('Error deleting key:value pair', error);
    res.json({
      data: 0,
      error: { code: 'eRP05', errno: error.errno, message: error.message }
    });
  }
});

/**
 * Atualiza o master de um determinada DN
 * Apenas o novo host master pode atualizar ou o test_client definido no configure.json
 */
app.get('/set_master', (req, res) => {
  const { dn_name, master_id } = req.query;
  if (!dn_name || master_id === undefined) {
    return res.status(400).json({
      data: 0,
      error: { code: 'eRP06', errno: 6, message: 'dn_name and master_id are required'}
    });
  }
  const dn = configure.DNs.find(dn => dn.name === dn_name);
  if (!dn || !isRequestFromTestClientDn(req, dn)) {
    return res.status(404).json({
      data: 0,
      error: { code: 'eRP07', errno: 7, message: 'DN not found'}
    });
  }

  dn.master_id = parseInt(master_id, 10);
  fs.writeFileSync("etc/configure.json", JSON.stringify(configure, null, 2), 'utf8');
  logger.info(`Master of ${dn_name} set to server ${master_id}`);

  res.json({
    data: {
      message: `Master of ${dn_name} set to server ${master_id}`
    },
    error: 0
  });
});

app.listen(PORT, () => {
  logger.info(`RP server is running on port ${PORT}`);
});