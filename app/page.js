import Header from '@/components/Header';
import WithdrawalTabs from '@/components/WithdrawalTabs';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <Header />
        <WithdrawalTabs />
      </div>
    </main>
  );
}
