// /netlify/functions/submitTransaction.js
const { Keypair, Horizon, Operation, TransactionBuilder, Asset } = require('stellar-sdk');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

const server = new Horizon.Server("https://api.mainnet.minepi.com");

const createKeypairFromMnemonic = (mnemonic) => {
    try {
        const seed = mnemonicToSeedSync(mnemonic);
        const derived = derivePath("m/44'/314159'/0'", seed.toString('hex'));
        return Keypair.fromRawEd25519Seed(derived.key);
    } catch (e) {
        throw new Error("Invalid keyphrase.");
    }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const params = JSON.parse(event.body);
        const senderKeypair = createKeypairFromMnemonic(params.senderMnemonic);
        let sponsorKeypair = null;
        if (params.feeType === 'SPONSOR_PAYS' && params.sponsorMnemonic) {
            sponsorKeypair = createKeypairFromMnemonic(params.sponsorMnemonic);
        }

        const sourceAccountKeypair = (params.feeType === 'SPONSOR_PAYS' && sponsorKeypair) ? sponsorKeypair : senderKeypair;
        const accountToLoad = await server.loadAccount(sourceAccountKeypair.publicKey());
        const fee = await server.fetchBaseFee();
        
        const txBuilder = new TransactionBuilder(accountToLoad, {
            fee,
            networkPassphrase: "Pi Network",
        });

        if (params.operation === 'claim_and_transfer') {
            txBuilder.addOperation(Operation.claimClaimableBalance({
                balanceId: params.claimableId,
                source: senderKeypair.publicKey()
            }));
        }
        
        txBuilder.addOperation(Operation.payment({
            destination: params.receiverAddress,
            asset: Asset.native(),
            amount: params.amount.toString(),
            source: senderKeypair.publicKey()
        }));

        const transaction = txBuilder.setTimeout(60).build();
        transaction.sign(senderKeypair);
        if (params.feeType === 'SPONSOR_PAYS' && sponsorKeypair) {
            transaction.sign(sponsorKeypair);
        }
        
        const result = await server.submitTransaction(transaction);

        return { statusCode: 200, body: JSON.stringify({ success: true, response: result }) };

    } catch (error) {
        let detailedError = "An unknown error occurred.";
        if (error.response && error.response.data && error.response.data.extras && error.response.data.extras.result_codes) {
            detailedError = "Transaction Failed: " + JSON.stringify(error.response.data.extras.result_codes);
        } else {
            detailedError = error.message;
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: detailedError })
        };
    }
};