// File: /netlify/functions/submit-batch-transactions.js

const StellarSdk = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// सर्वर कॉन्फ़िगरेशन
const server = new StellarSdk.Server("https://api.mainnet.minepi.com", {
    httpClient: axios.create({ timeout: 60000 })
});

// मेमोनिक से कीपेयर बनाने का हेल्पर फंक्शन
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
    // केवल POST रिक्वेस्ट को स्वीकार करें
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
    }

    try {
        const { senderMnemonic, receiverAddress, amount, count = 1 } = JSON.parse(event.body);

        // इनपुट का वैलिडेशन
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

        // लूप चलाकर सभी ट्रांजैक्शन तैयार करें
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

        // सभी को एक साथ भेजें
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
            statusCode: 500, // सर्वर एरर के लिए 500 कोड का उपयोग करें
            body: JSON.stringify({ success: false, error: errorMessage })
        };
    }
};```

---

### कदम 3: डिप्लॉय करें

1.  **निर्भरताएँ (Dependencies):** सुनिश्चित करें कि आपकी `package.json` फ़ाइल में ये निर्भरताएँ हैं। अपने टर्मिनल में चलाएँ:
    ```bash
    npm install stellar-sdk bip39 ed25519-hd-key axios
    ```

2.  **नेटलिफाई सेटिंग्स:** अपनी नेटलिफाई साइट की **Build settings** में जाएँ और सुनिश्चित करें कि:
    *   **Build command:** इसे **खाली छोड़ दें** (क्योंकि हमें कुछ भी बिल्ड नहीं करना है)।
    *   **Publish directory:** इसे **`.`** (सिर्फ एक डॉट) पर सेट करें या उस फोल्डर का नाम दें जिसमें आपकी `index.html` है।

3.  **डिप्लॉय:** अपने कोड को GitHub पर पुश करें और नेटलिफाई पर डिप्लॉय करें।

अब आपकी साइट पर एक सरल, तेज और बिना किसी एरर वाला बॉट होगा जो एक साथ कई ट्रांजैक्शन भेज सकता है।