// /netlify/functions/getClaimableBalances.js
const StellarSdk = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');

const server = new StellarSdk.Server('https://api.mainnet.minepi.com');

const createKeypairFromMnemonic = (mnemonic) => {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const derived = derivePath("m/44'/314159'/0'", seed.toString('hex'));
        return StellarSdk.Keypair.fromRawEd25519Seed(derived.key);
    } catch (e) {
        throw new Error("Invalid keyphrase.");
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
    }

    try {
        const { mnemonic } = JSON.parse(event.body);
        const keypair = createKeypairFromMnemonic(mnemonic);
        const publicKey = keypair.publicKey();

        const response = await server.claimableBalances().claimant(publicKey).limit(200).call();
        
        const balances = response.records.map(record => ({
            id: record.id,
            amount: record.amount,
            asset: "PI" 
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, balances: balances })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};```

**2. `netlify/functions/submit-batch-transactions.js`** (यह वही है जो पहले था)

```javascript
// /netlify/functions/submit-batch-transactions.js
// ... (पिछले जवाब से पूरा कोड यहाँ पेस्ट करें)
const StellarSdk = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

const server = new StellarSdk.Server("https://api.mainnet.minepi.com", {
    httpClient: axios.create({ timeout: 60000 })
});

const createKeypairFromMnemonic = (mnemonic) => {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const derivedSeed = derivePath("m/44'/314159'/0'", seed.toString('hex'));
        return StellarSdk.Keypair.fromRawEd25519Seed(derivedSeed.key);
    } catch (e) {
        throw new Error("Invalid keyphrase.");
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
    }

    try {
        const { senderMnemonic, receiverAddress, amount, count = 1 } = JSON.parse(event.body);
        if (!senderMnemonic || !receiverAddress || !amount || !count) {
             return { statusCode: 400, body: JSON.stringify({ success: false, error: "Missing required parameters." }) };
        }
        if (count > 100) {
             return { statusCode: 400, body: JSON.stringify({ success: false, error: "Cannot process more than 100 transactions." }) };
        }

        const senderKeypair = createKeypairFromMnemonic(senderMnemonic);
        const sourceAccount = await server.loadAccount(senderKeypair.publicKey());
        const fee = await server.fetchBaseFee();
        
        const transactionPromises = [];
        for (let i = 0; i < count; i++) {
            const sequenceForThisTx = (BigInt(sourceAccount.sequence) + BigInt(i + 1)).toString();
            const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
                fee,
                networkPassphrase: "Pi Network",
            })
            .addOperation(StellarSdk.Operation.payment({
                destination: receiverAddress,
                asset: StellarSdk.Asset.native(),
                amount: amount.toString(),
            }))
            .setSequence(sequenceForThisTx)
            .setTimeout(60)
            .build();
            
            tx.sign(senderKeypair);
            transactionPromises.push(server.submitTransaction(tx));
        }

        const results = await Promise.allSettled(transactionPromises);
        const successful_transactions = [];
        const failed_transactions = [];

        results.forEach((result, index) => {
            const sequence = (BigInt(sourceAccount.sequence) + BigInt(index + 1)).toString();
            if (result.status === 'fulfilled') {
                successful_transactions.push({ sequence, hash: result.value.hash });
            } else {
                let errorMessage = "Transaction failed.";
                if (result.reason?.response?.data?.extras?.result_codes) {
                    errorMessage = JSON.stringify(result.reason.response.data.extras.result_codes);
                } else if (result.reason?.message) {
                    errorMessage = result.reason.message;
                }
                failed_transactions.push({ sequence, error: errorMessage });
            }
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: `Batch complete. ${successful_transactions.length} succeeded, ${failed_transactions.length} failed.`,
                successful_transactions,
                failed_transactions
            })
        };
    } catch (error) {
        let errorMessage = error.message;
        if (error.response && error.response.data) {
             errorMessage = error.response.data.title || error.response.data.detail || errorMessage;
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: errorMessage })
        };
    }
};