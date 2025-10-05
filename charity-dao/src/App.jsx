import './App.css'
import WalletConnect from "./components/WalletConnect";
import DonateETH from "./components/DonateETH";
import CreateProposal from "./components/CreateProposal";
import ProposalList from "./components/ProposalList";
import VerifyNGO from "./components/VerifyNGO";
import AdminPanel from "./components/AdminPanel";

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <WalletConnect />
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-4">Charity DAO Demo</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DonateETH />
          <VerifyNGO />
          <CreateProposal />
          <AdminPanel />
        </div>
        <ProposalList />
      </div>
    </div>
  );
}

export default App
