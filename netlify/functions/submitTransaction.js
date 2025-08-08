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
        
        // 1. भेजने वाले और (यदि दिया गया हो तो) स्पॉन्सर के कीपेयर बनाएँ
        const senderKeypair = createKeypairFromMnemonic(params.senderMnemonic);
        let sponsorKeypair = null;
        if (params.feeType === 'SPONSOR_PAYS' && params.sponsorMnemonic) {
            sponsorKeypair = createKeypairFromMnemonic(params.sponsorMnemonic);
        }

        // 2. तय करें कि फीस कौन देगा और उसका अकाउंट लोड करें
        const feeSourceAccountKeypair = sponsorKeypair || senderKeypair;
        const accountToLoad = await server.loadAccount(feeSourceAccountKeypair.publicKey());
        
        const txBuilder = new StellarSdk.TransactionBuilder(accountToLoad, {
            fee: (await server.fetchBaseFee() * 2).toString(), // Unlock + Transfer के लिए 2 ऑपरेशन की फीस
            networkPassphrase: "Pi Network",
        });

        // 3. ऑपरेशन जोड़ें
        txBuilder.addOperation(StellarSdk.Operation.claimClaimableBalance({
            balanceId: params.claimableId,
            source: senderKeypair.publicKey() // यह हमेशा भेजने वाले के अकाउंट से होता है
        }));
        
        txBuilder.addOperation(StellarSdk.Operation.payment({
            destination: params.receiverAddress,
            asset: StellarSdk.Asset.native(),
            amount: params.amount.toString(),
            source: senderKeypair.publicKey() // यह भी भेजने वाले के अकाउंट से होता है
        }));

        const transaction = txBuilder.setTimeout(60).build();

        // 4. ट्रांजैक्शन पर हस्ताक्षर करें
        transaction.sign(senderKeypair);
        if (sponsorKeypair) {
            // यदि स्पॉन्सर है, तो वह भी हस्ताक्षर करेगा (फीस के लिए)
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
