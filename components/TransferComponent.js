// /components/TransferComponent.js
import { useState } from 'react';

// यह कंपोनेंट किसी बाहरी UI लाइब्रेरी पर निर्भर नहीं करता है ताकि कोई और समस्या न हो
export default function TransferComponent() {
    const [senderMnemonic, setSenderMnemonic] = useState('');
    const [withdrawalAmount, setWithdrawalAmount] = useState('0.1');
    const [transactionCount, setTransactionCount] = useState(50);
    const [isProcessing, setIsProcessing] = useState(false);
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState('');

    const handleStartBatchWithdrawal = async () => {
        if (!senderMnemonic || !withdrawalAmount || !transactionCount) {
            setError("Please fill all fields.");
            return;
        }
        setIsProcessing(true);
        setLogs([]);
        setError('');

        try {
            const response = await fetch('/.netlify/functions/submit-batch-transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderMnemonic: senderMnemonic,
                    receiverAddress: 'GC6W3TUI5AOWIUDXECX6NHAZOKMORN7ENTNOVIUROPIYFGNVWUIMK4M3',
                    amount: withdrawalAmount.toString(),
                    count: parseInt(transactionCount, 10)
                })
            });
            const result = await response.json();

            if (result.success) {
                const successfulLogs = result.successful_transactions.map(tx => `SUCCESS (Seq: ${tx.sequence}): Hash ${tx.hash.substring(0, 10)}...`);
                const failedLogs = result.failed_transactions.map(tx => `FAILED (Seq: ${tx.sequence}): ${tx.error}`);
                setLogs([...successfulLogs, ...failedLogs]);
            } else {
                setError(result.error || "An unknown error occurred during batch submission.");
            }
        } catch (err) {
            setError("Network Error: " + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // बेसिक स्टाइलिंग ताकि यह काम करे
    const inputStyle = { backgroundColor: '#334155', color: 'white', border: '1px solid #475569', padding: '8px', borderRadius: '4px', width: '100%' };
    const labelStyle = { color: 'white', marginBottom: '4px', display: 'block' };
    const buttonStyle = { backgroundColor: '#7c3aed', color: 'white', padding: '10px', borderRadius: '4px', border: 'none', width: '100%', cursor: 'pointer' };

    return (
        <div style={{ width: '100%', maxWidth: '450px', margin: 'auto', padding: '24px', backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid #475569', borderRadius: '8px' }}>
            <h2 style={{ textAlign: 'center', color: '#a78bfa', fontSize: '24px' }}>Parallel Transfer Bot</h2>
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>Sender Wallet Phrase</label>
                    <input type="password" value={senderMnemonic} onChange={(e) => setSenderMnemonic(e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle}>Amount Per Transaction</label>
                    <input type="number" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle}>Number of Transactions (1-100)</label>
                    <input type="number" value={transactionCount} onChange={(e) => setTransactionCount(e.target.value)} style={inputStyle} />
                </div>
            </div>
            <button onClick={handleStartBatchWithdrawal} disabled={isProcessing} style={{ ...buttonStyle, marginTop: '24px' }}>
                {isProcessing ? 'Processing...' : `Initiate Transfers`}
            </button>
            {error && <p style={{ color: '#f87171', marginTop: '16px' }}>Error: {error}</p>}
            {logs.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                    <h3 style={{ color: 'white' }}>Results:</h3>
                    <div style={{ backgroundColor: '#0f172a', padding: '8px', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                        {logs.map((log, index) => <p key={index} style={{ color: log.startsWith('SUCCESS') ? '#4ade80' : '#f87171', margin: 0, fontFamily: 'monospace', fontSize: '12px' }}>{log}</p>)}
                    </div>
                </div>
            )}
        </div>
    );
}```

#### कदम 4: मुख्य पेज को बदलें

1.  अपने प्रोजेक्ट में `pages/index.js` (या `app/page.js`) फ़ाइल खोलें।
2.  उसका **सारा पुराना कोड डिलीट कर दें** और उसे नीचे दिए गए कोड से बदल दें।

```javascript
// pages/index.js
import TransferComponent from '../components/TransferComponent'; // ध्यान दें, पाथ बदला है

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #1e293b, #4c1d95, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <TransferComponent />
    </main>
  );
}
