express = require('express');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const startTime = new Date(); // Registra o tempo de início
const IP = process.env.IP || 'localhost';
const DN_ID = process.env.DN_ID || 0;
const dnStatus = {
    start_time: startTime,
    living_time: () => Math.floor((new Date() - startTime) / 1000)
};
let PORT = process.env.PORT || 0;
const baseDir = path.join(__dirname, '../../DB-data');

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

const configure = require('../../etc/configure.json');
const crypto = require("crypto");
// Variáveis de ambiente
const SERVER_ID = process.env.SERVER_ID || 0;

let stats = {
    create: 0,
    read: 0,
    update: 0,
    delete: 0
};

/**
 * Função para verificar a origem de um pedido
 */
const isRequestFromDN = (req) => {
    let requestIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const testClientIP = configure.test_client_ip;
    if (requestIP === '::1') {
        requestIP = '127.0.0.1';
    }
    return requestIP === testClientIP || configure.DNs.some(dn => dn.servers.some(server => server.host === requestIP));
};

/**
 * Middleware que serve para lidar com os erros que ocorrem durante o processamento dos pedidos HTTP.
 * Quando um erro é detectado, este middleware faz:
 * - o log do erro logger.error (err.stack)
 * - envia uma resposta ao cliente com o status HTTP 500 (Internal server error) e um objeto JSON com os detalhes do erro.
 */
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({ data: 0, error: { code: `eDN${DN_ID}500`, errno: 1, message: err.message } });
});

/**
 Middleware que serve para dar parse aoo corpo dos pedidos HTTP no formato JSON.
 Analisa esse JSON e disponibiliza-o no req.body da rota a ser processada.
 */
app.use(bodyParser.json());

app.get('/status', (req, res) => {
    res.json({
        data: {
            DN_ID,
            status: 'running',
            start_time: dnStatus.start_time,
            living_time: dnStatus.living_time()
        }, error: 0
    });
});

/**
 * Função que permite a eleição de um novo master
 */
app.get('/election', (req, res) => {
    if (!isRequestFromDN(req)) {
        return res.status(403).json({
            data: 0,
            error: {code: 'eDN010', errno: 10, message: 'Unauthorized'}
        });
    }
    const dn = configure.DNs.find(dn => dn.name === `DN${DN_ID}`);
    if (!dn) {
        return res.status(404).json({
            data: 0,
            error: {code: 'eDN011', errno: 11, message: 'DN not found'}
        });
    }

    if (dn.master_id === parseInt(SERVER_ID)) {
        return res.json({
            data: {
                message: 'This server is already the master'
            },
            error: 0
        });
    }

    //atribui a propriedade master_id ao menor id encontrado
    let minId = dn.servers.length > 0 ? dn.servers[0].id : undefined;
    for (let i = 1; i < dn.servers.length; i++) {
        if (dn.servers[i].id < minId) {
            minId = dn.servers[i].id;
        }
    }
    dn.master_id = minId;

    //informa o RP o novo master
    axios.get(`http://${configure.RP.host}:${config.RP.port}/set_master`, {
        params: {
            dnName: dn.name,
            masterId: newMasterId
        }
    }).then(response => {
        logger.info(`RP informed about new master of ${dn.name}: ${newMasterId}`);
    }).catch(error => {
        logger.error(`Error informing RP about new master: ${error.message}`);
    });

    res.json({
        data: {
            message: `New master elected: Server ${newMasterId}`
        },
        error: 0
    });
});

/**
 * Retorna os ficheiro dentro de uma determinada pasta
 */
const listFilesInDirectory = (dirPath) => {
    if (fs.existsSync(dirPath)) {
        return fs.readdirSync(dirPath);
    }
    return [];
};

/**
 * Copia os ficheiros enctre os vários subnodos
 * @param sourceDir
 * @param targetDir
 */
const copyFilesBetweenNodes = (sourceDir, targetDir) => {
    const files = listFilesInDirectory(sourceDir);
    files.forEach(file => {
        const sourceFilePath = path.join(sourceDir, file);
        const targetFilePath = path.join(targetDir, file);
        if (!fs.existsSync(targetFilePath)) {
            fs.copyFileSync(sourceFilePath, targetFilePath);
            logger.info(`Copied ${sourceFilePath} to ${targetFilePath}`);
        }
    });
};


/**
 * Responsável pela manutenção e sincronização de dados
 * USado como base o master de cada DN
 */
app.get('/maintenance', async (req, res) => {
    if (!isRequestFromDN(req)) {
        return res.status(403).json({
            data: 0,
            error: {code: 'eDN012', errno: 12, message: 'Unauthorized'}
        });
    }
    const dn = configure.DNs.find(dn => dn.name === `DN${DN_ID}`);

    try {
        const masterServer = dn.servers.find(server => server.id === dn.master_id);
        const masterDir = path.join(baseDir, `dn${DN_ID}`, `s0${masterServer.id}`);
        for (const server of dn.servers) {
            if (server.id !== dn.master_id) {
                const targetDir = path.join(baseDir, `dn${DN_ID}`, `s0${server.id}`);
                copyFilesBetweenNodes(masterDir, targetDir);
            }
        }
        res.json({
            data: {
                message: 'Maintenance completed'
            },
            error: 0
        });
    }
    catch (error) {
        logger.error(`Error during maintenance: ${error.message}`);
        res.json({
            data: 0,
            error: {code: 'eDN014', errno: 14, message: error.message}
        });
    }
});

/**
 * Função para guardar um par key:value num ficheiro
 */
const saveToFile = (dbKey, data) => {
    const dir = path.join(baseDir, `dn${DN_ID}`, `s0${SERVER_ID}`);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, dbKey);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
};

// Função para replicar dados para outros nodos do mesmo DN
const replicateData = async (dbKey, data) => {
    const dn = configure.DNs.find(dn => dn.name === `DN${DN_ID}`);
    if (dn) {
        for (const server of dn.servers) {
            if (server.id !== parseInt(SERVER_ID)) {
                try {
                    await axios.post(`http://${server.host}:${server.port}/db/replicate`, {
                        DB_key: dbKey,
                        data: data
                    });
                } catch (error) {
                    logger.error(`Error replicating data to s${server.id} of DN${DN_ID}`, error);
                }
            }
        }
    }
};

/**
 * Função que gere um md5 com base na key recebida
 */
function generateHash(key) {
    return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Função para ler um par key:value de um ficheiro
 */
const readFromFile = (dbKey) => {
    const filePath = path.join(baseDir, `dn${DN_ID}`, `s0${SERVER_ID}`, dbKey);
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    return null;
};


/**
 * Função que retorna o valor associado a uma chave, retornando um objeto json com detalhes em caso de erro (chave nao encontrada ou erro no processamento)
 */
app.get('/db/r', (req, res) => {
    const { key } = req.query;
    const DB_key = generateHash(key);
    const data = readFromFile(DB_key);
    if (data === null) {
        return res.json({
            data: 0,
            error: {code: 'eDN03', errno: 3, message: 'Key not found'}
        });
    }

    res.json({
        data: {DB_key, DN_id: DN_ID, tuple: data},
        error: 0
    });
});

/**
 * Função que permite replicar dados entre nodos do mesmo DN
 */
app.post('/db/replicate', (req, res) => {
    const { DB_key, data } = req.body;
    if (data) {
        saveToFile(DB_key, data);
    }
    else {
        const filePath = path.join(baseDir, `dn${DN_ID}`, `s0${SERVER_ID}`, DB_key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    res.json({
        data: {
            message: 'Data replicated'
        },
        error: 0
    });
});


/**
 * Função que adiciona um novo par key:value
 */
app.post('/db/c', async (req, res) => {
    const { key, value } = req.body;
    stats.create++;

    const DB_key = req.body.hash;
    const data = {
        key,
        value
    };
    saveToFile(DB_key, data);

    // Replicar dados para outros nodos do mesmo DN
    await replicateData(DB_key, data);
    logger.info("Criado por "+DN_ID+" IP: "+IP+" Port: "+PORT);
    res.json({
        data: { DB_key, DN_id: DN_ID, tuple: data },
        error: 0
    });
});


app.get('/stats', (req, res) => {
    res.json({
        data: stats,
        error: 0
    });
});

/**
 * responsável por eliminar um par chave-valor.
 * Recebe como param a key a eliminar
 */
app.get('/db/d', async (req, res) => {
    const { key } = req.query;
    const DB_key = generateHash(key);
    const filePath = path.join(baseDir, `dn${DN_ID}`, `s0${SERVER_ID}`, DB_key);
    if (!fs.existsSync(filePath)) {
        return res.json({
            data: 0,
            error: {
                code: 'eDN08', errno: 8, message: 'Key not found'
            }
        });
    }
    fs.unlinkSync(filePath);

    //replica para os restantes nodos a eliminação, null indica à função de replicação que é para eliminação
    await replicateData(DB_key, null);

    res.json({
        data: {
            message: 'Key-value pair deleted successfully'
        },
        error: 0
    });
});

/**
 * Responsável por atualizar o valor dada uma chave
 * Permite também eliminar certas propriedades do valor
 */
app.post('/db/u', async (req, res) => {
    const { key, value } = req.body;
    const DB_key = generateHash(key);
    const existingData = readFromFile(DB_key);
    if (existingData === null) {
        return res.json({
            data: 0,
            error: { code: 'eDN08', errno: 8, message: 'Key not found'}
        });
    }
    // Atualizar o objeto existente
    for (const member in value) {
        if (value[member] === '--delete--' || value[member] === '\-\-delete\-\-') {
            delete existingData.value[member];
        }
        else {
            existingData.value[member] = value[member];
        }
    }
    saveToFile(DB_key, existingData);

    // Replica a atualização os restantes nodos do DN
    await replicateData(DB_key, existingData);

    res.json({
        data: { DB_key, DN_id: DN_ID, tuple: existingData },
        error: 0
    });
});

const isRequestFromRPOrTestHost = (req) => {
    const rpHost = configure.RP.host;
    const testClientIP = configure.test_client_ip;
    let requestIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (requestIP === '::1') {
        requestIP = '127.0.0.1';
    }
    return requestIP === rpHost || requestIP === testClientIP;
};

/**
 * Permite parar um determinado NO
 * O esboço da função seria este mas nao está a funcionar
 */
app.get('/stop', (req, res) => {
    if (!isRequestFromRPOrTestHost(req)) {
        return res.status(403).json({
            data: 0,
            error: { code: 'eDN09', errno: 9, message: 'Unauthorized' }
        });
    }
    process.exit(0);
    logger.info('Stopping node as requested by RP or test client');
});

app.listen(PORT, IP, () => {
    logger.info(`DN server ${DN_ID} is running on ${IP}:${PORT}`);
});