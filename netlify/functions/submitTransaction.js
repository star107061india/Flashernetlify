// File: netlify/functions/submitTransaction.js (Optimized for Speed)

const { Keypair, Horizon, Operation, TransactionBuilder, Asset } = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

const server = new Horizon.Server("https://api.mainnet.minepi.com", {
    httpClient: axios.create({ timeout: 30000 }) // टाइमआउट 30 सेकंड
});

const createKeypairFromMnemonic = (mnemonic) => {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const derived = derivePath("m/44'/314159'/0'", seed.toString('hex'));
        return Keypair.fromRawEd25519Seed(derived.key);
    } catch (e) {
        throw new Error("Invalid keyphrase. Please check for typos or extra spaces.");
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
        
        // --- Speed Optimization Logic ---
        let recordsPerAttempt = parseInt(params.recordsPerAttempt, 10) || 1;
        if (recordsPerAttempt < 1) recordsPerAttempt = 1;
        // कुल ऑपरेशन की संख्या = (1 क्लेम + 1 पेमेंट) * रिकॉर्ड्स की संख्या
        const totalOperations = 2 * recordsPerAttempt;

        let fee;
        if (params.feeMechanism === 'CUSTOM' && params.customFee) {
            // 1. कस्टम फीस का उपयोग करें
            fee = params.customFee;
        } else {
            const baseFee = await server.fetchBaseFee();
            if (params.feeMechanism === 'SPEED_HIGH') {
                // 2. स्पीड के लिए 10 गुना फीस
                fee = (baseFee * 10 * totalOperations).toString();
            } else { // AUTOMATIC
                // 3. स्वचालित सामान्य फीस
                fee = (baseFee * totalOperations).toString();
            }
        }
        // --- End of Speed Optimization Logic ---

        const txBuilder = new TransactionBuilder(accountToLoad, {
            fee, // यहाँ ऑप्टिमाइज़ की गई फीस का उपयोग किया जा रहा है
            networkPassphrase: "Pi Network",
        });
        
        // एक ही ट्रांजैक्शन में कई ऑपरेशन जोड़ें
        for (let i = 0; i < recordsPerAttempt; i++) {
             txBuilder.addOperation(Operation.claimClaimableBalance({
                balanceId: params.claimableId,
                source: senderKeypair.publicKey()
            }));
            
            txBuilder.addOperation(Operation.payment({
                destination: params.receiverAddress,
                asset: Asset.native(),
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

        if (result && result.hash) {
             return { statusCode: 200, body: JSON.stringify({ success: true, response: result }) };
        } else {
            throw new Error("Transaction was submitted but no hash was returned.");
        }

    } catch (error) {
        console.error("Error in submitTransaction:", error);
        let detailedError = "An unknown error occurred during transaction.";
        
        if (error.response?.data?.extras?.result_codes) {
            detailedError = `Pi Network Error: ${JSON.stringify(error.response.data.extras.result_codes)}`;
        } else if (error.response?.status === 404) {
            detailedError = "The sender or sponsor account was not found on the Pi network.";
        } else if (error.message.toLowerCase().includes('timeout')) {
            detailedError = "Request to Pi network timed out. The network may be busy. Please try again.";
        } else {
            detailedError = error.message;
        }

        return {
            statusCode: 500, // सर्वर एरर के लिए 500 कोड बेहतर है
            body: JSON.stringify({ success: false, error: detailedError })
        };
    }
};
