const axios = require('axios');
const fs = require('fs');
const path = require('path');

const visitedNodes = new Set();
const healthyNodes = {
    rpc: [],
    rest: []
};
const timeout = 3000; // Timeout for requests in milliseconds

async function fetchNetInfo(url) {
    try {
        const response = await axios.get(url, { timeout });
        return response.data.result;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

async function fetchStatus(url) {
    try {
        const response = await axios.get(url, { timeout });
        return response.data.result;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

async function fetchChainInfo(chainName) {
    const url = `https://raw.githubusercontent.com/cosmos/chain-registry/master/${chainName}/chain.json`;
    try {
        const response = await axios.get(url, { timeout });
        return response.data;
    } catch (error) {
        console.error(`Error fetching chain info for ${chainName}:`, error.message);
        return null;
    }
}

async function checkRestEndpoint(url) {
    try {
        const response = await axios.get(url, { timeout });
        const latestBlockTime = response.data.block.header.time;
        const currentTime = new Date().toISOString();
        return new Date(currentTime) - new Date(latestBlockTime) < 600000; // Check if the latest block is within the last 10 minutes
    } catch (error) {
        console.error(`Error checking REST endpoint at ${url}:`, error.message);
        return false;
    }
}

function generateRestUrls(url) {
    const restUrls = [];
    if (url.includes('rpc')) {
        restUrls.push(url.replace('rpc', 'rest'));
        restUrls.push(url.replace('rpc', 'lcd'));
        restUrls.push(url.replace('rpc', 'api'));
    } else {
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
        restUrls.push(`http://${urlObj.hostname}:1317`);
        restUrls.push(`https://${urlObj.hostname}:443`);
    }
    return restUrls.map(baseUrl => `${baseUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`);
}

async function crawlNetwork(url, maxDepth, currentDepth = 0) {
    if (currentDepth > maxDepth) {
        return;
    }

    const netInfo = await fetchNetInfo(url);
    if (!netInfo) {
        return;
    }

    const statusUrl = url.replace('/net_info', '/status');
    const statusInfo = await fetchStatus(statusUrl);
    if (statusInfo) {
        const earliestBlockHeight = statusInfo.sync_info.earliest_block_height;
        const earliestBlockTime = statusInfo.sync_info.earliest_block_time;
        console.log(`Node: ${url}`);
        console.log(`Earliest Block Height: ${earliestBlockHeight}`);
        console.log(`Earliest Block Time: ${earliestBlockTime}`);
        healthyNodes.rpc.push(url.replace('/net_info', '')); // Add to healthy nodes
    }

    const peers = netInfo.peers;
    const crawlPromises = peers.map(async (peer) => {
        const remoteIp = peer.remote_ip;
        const rpcAddress = peer.node_info.other.rpc_address.replace('tcp://', 'http://').replace('0.0.0.0', remoteIp);

        if (!visitedNodes.has(rpcAddress)) {
            visitedNodes.add(rpcAddress);
            console.log(`Crawling: ${rpcAddress}`);
            await crawlNetwork(`${rpcAddress}/net_info`, maxDepth, currentDepth + 1);
        }
    });

    await Promise.all(crawlPromises);
}

async function findRestEndpoints() {
    for (const rpcUrl of healthyNodes.rpc) {
        const restUrls = generateRestUrls(rpcUrl);
        for (const restUrl of restUrls) {
            const restHealthy = await checkRestEndpoint(restUrl);
            if (restHealthy) {
                healthyNodes.rest.push(restUrl.replace('/cosmos/base/tendermint/v1beta1/blocks/latest', ''));
                break;
            }
        }
    }
}

async function initializeLoadBalancer(chainName, maxDepth) {
    const chainInfo = await fetchChainInfo(chainName);
    if (!chainInfo) {
        console.error(`No chain info found for ${chainName}`);
        return;
    }
    const initialUrls = chainInfo.apis.rpc.map(api => api.address);
    for (const url of initialUrls) {
        await crawlNetwork(`${url}/net_info`, maxDepth);
    }

    // Find REST endpoints
    await findRestEndpoints();

    console.log('Crawling complete. Healthy nodes:', healthyNodes);

    const output = {
        chains: {
            [chainName]: {
                endpoints: healthyNodes
            }
        }
    };

    const outputPath = path.join(__dirname, 'endpoints.json');
    if (fs.existsSync(outputPath)) {
        const existingData = JSON.parse(fs.readFileSync(outputPath));
        existingData.chains[chainName] = output.chains[chainName];
        fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2));
    } else {
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    }
}

function getNextHealthyNode(type) {
    if (healthyNodes[type].length === 0) {
        throw new Error(`No healthy ${type} nodes available.`);
    }
    const node = healthyNodes[type].shift();
    healthyNodes[type].push(node);
    return node;
}

const args = process.argv.slice(2);
const chains = [];
let maxDepth = 3;

args.forEach(arg => {
    if (arg.startsWith('--chain=')) {
        chains.push(arg.split('=')[1]);
    } else if (arg.startsWith('--depth=')) {
        maxDepth = parseInt(arg.split('=')[1], 10);
    }
});

if (chains.length === 0) {
    console.error('No chains specified. Use --chain=<chain-name> to specify chains.');
    process.exit(1);
}

(async () => {
    for (const chain of chains) {
        await initializeLoadBalancer(chain, maxDepth);
    }
    console.log('Network crawling complete.');
})();
