// File: netlify/functions/submit-batch-transactions.js

const { Keypair, Horizon, Operation, TransactionBuilder, Asset } = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// सर्वर कॉन्फ़िगरेशन, टाइमआउट बढ़ाया गया
const server = new Horizon.Server("https://api.mainnet.minepi.com", {
    httpClient: axios.create({ timeout: 60000 }) // बैच के लिए टाइमआउट 60 सेकंड कर दिया है
});

// मेमोनिक से कीपेयर बनाने का हेल्पर फंक्शन
const createKeypairFromMnemonic = (mnemonic) => {
    try {
        return Keypair.fromRawEd25519Seed(derivePath("m/44'/314159'/0'", mnemonicToSeedSync(mnemonic).toString('hex')).key);
    } catch (e) {
        throw new Error("Invalid keyphrase. Please check for typos or extra spaces.");
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        // नया: अब हम 'count' भी लेंगे, यानी कितने ट्रांजैक्शन करने हैं
        const { senderMnemonic, receiverAddress, amount, count = 1 } = JSON.parse(event.body);

        if (count > 100) { // एक सीमा निर्धारित करें
             throw new Error("Cannot process more than 100 transactions at a time.");
        }

        const senderKeypair = createKeypairFromMnemonic(senderMnemonic);

        // >> मुख्य लॉजिक यहाँ से शुरू होता है <<

        // 1. भेजने वाले का अकाउंट सिर्फ एक बार लोड करें
        const sourceAccount = await server.loadAccount(senderKeypair.publicKey());
        const fee = await server.fetchBaseFee();
        
        const transactionPromises = [];

        // 2. लूप चलाकर सभी ट्रांजैक्शन तैयार करें
        for (let i = 0; i < count; i++) {
            // 3. हर ट्रांजैक्शन के लिए सीक्वेंस नंबर को 1 से बढ़ाएं
            // BigInt का उपयोग करना सुरक्षित है ताकि बड़ी संख्याओं में कोई समस्या न हो
            const sequenceForThisTx = (BigInt(sourceAccount.sequence) + BigInt(i + 1)).toString();

            const tx = new TransactionBuilder(sourceAccount, {
                fee,
                networkPassphrase: "Pi Network",
            })
            .addOperation(Operation.payment({
                destination: receiverAddress,
                asset: Asset.native(),
                amount: amount.toString(), // हर ट्रांजैक्शन के लिए राशि
            }))
            .setSequence(sequenceForThisTx) // <<< यह बहुत महत्वपूर्ण है
            .setTimeout(60)
            .build();

            tx.sign(senderKeypair);
            
            // ट्रांजैक्शन को सबमिट करने का प्रॉमिस बनाएं और ऐरे में डालें
            transactionPromises.push(server.submitTransaction(tx));
        }

        console.log(`Submitting a batch of ${count} transactions...`);

        // 4. Promise.allSettled से सभी को एक साथ भेजें
        const results = await Promise.allSettled(transactionPromises);

        // परिणामों को प्रोसेस करें
        const successful_transactions = [];
        const failed_transactions = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successful_transactions.push({
                    sequence: (BigInt(sourceAccount.sequence) + BigInt(index + 1)).toString(),
                    hash: result.value.hash,
                    response: result.value
                });
            } else {
                let errorMessage = result.reason.message;
                if (result.reason.response && result.reason.response.data && result.reason.response.data.extras) {
                    errorMessage = JSON.stringify(result.reason.response.data.extras.result_codes);
                }
                failed_transactions.push({
                    sequence: (BigInt(sourceAccount.sequence) + BigInt(index + 1)).toString(),
                    error: errorMessage
                });
            }
        });
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: `Batch processing complete. ${successful_transactions.length} succeeded, ${failed_transactions.length} failed.`,
                successful_transactions,
                failed_transactions
            })
        };

    } catch (error) {
        console.error("Error in batch transaction:", error);
        return {
            statusCode: 200, // फ्रंटएंड पर एरर को ठीक से दिखाने के लिए 200 भेजें
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};