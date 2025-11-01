import './App.css'
import WalletConnect from "./components/WalletConnect";
import DonateETH from "./components/DonateETH";
import ProposalList from "./components/ProposalList";
import VerifyNGO from "./components/VerifyNGO";
import NGOPanel from "./components/NGOPanel";
import { useNGOStatus } from "./context/useNGOStatus";
import { useWallet } from "./context/WalletContext";
// import AdminPanel from "./components/AdminPanel";

function App() {
  const { account } = useWallet();
  const { isNGO, isAdmin, loading } = useNGOStatus();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b w-full">
        <WalletConnect />
      </div>
      
      {/* Main Content */}
      <div className="w-full px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4 leading-tight">
            Charity DAO
          </h1>
          <p className="text-xl text-gray-600 max-w-4xl mx-auto">
            Decentralized charity platform where transparency meets impact. 
            Donate ETH, earn governance tokens, and vote on meaningful projects.
          </p>
          
          {/* User Status Indicator */}
          {account && !loading && (
            <div className="mt-4 flex justify-center">
              <div className="bg-white rounded-lg shadow-md px-4 py-2 flex items-center space-x-2">
                {isAdmin && (
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                    🔑 Admin
                  </span>
                )}
                {isNGO && (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                    ✅ Verified NGO
                  </span>
                )}
                {!isNGO && !isAdmin && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                    👤 Donor
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Cards Grid - Conditional rendering based on user type */}
        <div className="flex flex-wrap justify-center gap-6 mb-12 max-w-7xl mx-auto">
          {/* Show donation only for regular users (not NGOs or admins) */}
          {!isNGO && !isAdmin && (
            <div className="w-full sm:w-96 max-w-md">
              <DonateETH isNGO={isNGO} isAdmin={isAdmin} loading={loading} />
            </div>
          )}
          
          {/* Show VerifyNGO only for admins */}
          {isAdmin && (
            <div className="w-full sm:w-96 max-w-md">
              <VerifyNGO />
            </div>
          )}

          {/* Show NGO Panel only for verified NGOs */}
          {isNGO && (
            <div className="w-full sm:w-182 max-w-4xl">
              <NGOPanel />
            </div>
          )}
          
          {/* Info cards for regular users */}
          {!isNGO && !isAdmin && account && (
            <>
              <div className="w-full sm:w-96 max-w-md">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold">🗳️</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Vote on Proposals</h2>
                      <p className="text-gray-600 text-sm">Use your GOV tokens to vote on charity projects</p>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    As a donor, you can vote on active charity proposals using your GOV tokens. 
                    Your votes help determine which projects get funded!
                  </p>
                </div>
              </div>
              
              <div className="w-full sm:w-96 max-w-md">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold">📋</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Create Proposals?</h2>
                      <p className="text-gray-600 text-sm">Get verified as an NGO to submit projects</p>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    To create funding proposals, you need to be a verified NGO. 
                    Contact an admin to get your organization verified.
                  </p>
                </div>
              </div>
            </>
          )}
          
          {/* Info cards for NGOs */}
          {isNGO && !isAdmin && (
              <div className="w-full sm:w-96 max-w-md space-y-6">
                <div className="w-full">
                  <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-lg flex items-center justify-center mr-3">
                        <span className="text-white font-bold">👁️</span>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-800">View Your Proposals</h2>
                        <p className="text-gray-600 text-sm">Track your charity project proposals</p>
                      </div>
                    </div>
                    <p className="text-justify text-gray-600">
                      As a verified NGO, you can view and manage your own charity proposals. 
                      Users will vote on your projects to help them get funded.
                    </p>
                  </div>
                </div>
              
              <div className="w-full">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold">ℹ️</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">NGO Restrictions</h2>
                      <p className="text-gray-600 text-sm">What you can and cannot do</p>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    As an NGO, you can create and view your proposals, but you cannot donate ETH or vote on proposals. 
                    Only regular users can participate in voting and donations.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Info cards for Admins */}
          {isAdmin && (
            <>
              <div className="w-full sm:w-96 max-w-md">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-red-400 to-pink-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold">👑</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Admin Oversight</h2>
                      <p className="text-gray-600 text-sm">Monitor all platform activity</p>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    As an admin, you can view all proposals, verify NGOs, and oversee the platform. 
                    You cannot donate or vote to maintain neutrality.
                  </p>
                </div>
              </div>
              
              <div className="w-full sm:w-96 max-w-md">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-blue-500 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-white font-bold">📊</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Platform Management</h2>
                      <p className="text-gray-600 text-sm">Manage NGOs and platform settings</p>
                    </div>
                  </div>
                  <p className="text-gray-600">
                    Use the NGO verification tools to approve new organizations. 
                    Monitor proposal activity and ensure platform integrity.
                  </p>
                </div>
              </div>
            </>
          )}          {/* <AdminPanel /> */}
        </div>

        {/* Proposals Section */}
        <ProposalList isNGO={isNGO} isAdmin={isAdmin} loading={loading} />
      </div>
    </div>
  );
}

export default App
