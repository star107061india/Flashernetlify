// /netlify/functions/submitTransaction.js
const StellarSdk = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

const server = new StellarSdk.Server("https://api.mainnet.minepi.com", {
    httpClient: axios.create({ timeout: 30000 })
});

const createKeypairFromMnemonic = (mnemonic) => {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const derived = derivePath("m/44'/314159'/0'", seed.toString('hex'));
        return StellarSdk.Keypair.fromRawEd25519Seed(derived.key);
    } catch (e) {
        throw new Error("Invalid keyphrase format.");
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method Not Allowed' })};

    try {
        const params = JSON.parse(event.body);
        
        const senderKeypair = createKeypairFromMnemonic(params.senderMnemonic);
        let sponsorKeypair = null;
        if (params.feeType === 'SPONSOR_PAYS' && params.sponsorMnemonic) {
            sponsorKeypair = createKeypairFromMnemonic(params.sponsorMnemonic);
        }

        const feeSourceKeypair = sponsorKeypair || senderKeypair;
        const accountToLoad = await server.loadAccount(feeSourceKeypair.publicKey());
        
        let recordsPerAttempt = parseInt(params.recordsPerAttempt, 10) || 1;
        if (recordsPerAttempt < 1) recordsPerAttempt = 1;
        const totalOperations = 2 * recordsPerAttempt;

        let fee;
        if (params.feeMechanism === 'CUSTOM' && params.customFee) {
            fee = params.customFee;
        } else {
            const baseFee = await server.fetchBaseFee();
            if (params.feeMechanism === 'SPEED_HIGH') {
                fee = (baseFee * 10 * totalOperations).toString(); // 10x base fee per operation
            } else { // AUTOMATIC
                fee = (baseFee * totalOperations).toString();
            }
        }

        const txBuilder = new StellarSdk.TransactionBuilder(accountToLoad, {
            fee,
            networkPassphrase: "Pi Network",
        });
        
        // Add operations based on recordsPerAttempt
        for (let i = 0; i < recordsPerAttempt; i++) {
             txBuilder.addOperation(StellarSdk.Operation.claimClaimableBalance({
                balanceId: params.claimableId,
                source: senderKeypair.publicKey()
            }));
            
            txBuilder.addOperation(StellarSdk.Operation.payment({
                destination: params.receiverAddress,
                asset: StellarSdk.Asset.native(),
                amount: params.amount.toString(),
                source: senderKeypair.publicKey()
            }));
        }

        const transaction = txBuilder.setTimeout(60).build();

        transaction.sign(senderKeypair);
        if (sponsorKeypair) {
            transaction.sign(sponsorKeypair);
        }
        
        const result = await server.submitTransaction(transaction);
        return { statusCode: 200, body: JSON.stringify({ success: true, response: result }) };

    } catch (error) {
        let errorMessage = "An unknown error occurred.";
        if (error.response?.data?.extras?.result_codes) {
            errorMessage = `Pi Network Error: ${JSON.stringify(error.response.data.extras.result_codes)}`;
        } else if (error.request) {
            errorMessage = "Could not connect to Pi Network. The server may be busy or down.";
        } else {
            errorMessage = error.message;
        }
        return { statusCode: 500, body: JSON.stringify({ success: false, error: errorMessage }) };
    }
};