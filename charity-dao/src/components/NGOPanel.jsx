import { useState } from "react";
import CreateProposal from "./CreateProposal";
import UploadProof from "./UploadProof";

function NGOPanel({ isNGO, isAdmin, statusLoading }) {
  const [activeTab, setActiveTab] = useState("create");

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Tab Navigation */}
      <div className="bg-white rounded-t-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 px-6 py-4 font-medium transition-all duration-200 ${
              activeTab === "create"
                ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {/* Show CreateProposal only for verified NGOs */}
            <div className="flex items-center justify-center space-x-2">
              <span className="text-xl">📝</span>
              <span>Create Proposal</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 px-6 py-4 font-medium transition-all duration-200 ${
              activeTab === "upload"
                ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <span className="text-xl">📋</span>
              <span>Upload Proof</span>
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-b-xl shadow-lg border-x border-b border-gray-100">
        {activeTab === "create" ? (
          <div className="p-6">
            <CreateProposal />
          </div>
        ) : (
          <div className="p-6">
            <UploadProof onUploadComplete={(url) => console.log("Proof uploaded:", url)}/>
          </div>
        )}
      </div>
    </div>
  );
}

export default NGOPanel;