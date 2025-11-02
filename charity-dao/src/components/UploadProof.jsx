import { useState, useRef } from "react";
import { getContracts } from "../utils/contracts";
import { useWallet } from "../context/WalletContext";

function UploadProof({ proposalId, milestoneIndex, onUploadComplete }) {
  const { account } = useWallet();

  const [file, setFile] = useState(null);
  const [pastedIpfsUrl, setPastedIpfsUrl] = useState("");
  const [useExistingLink, setUseExistingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ipfsUrl, setIpfsUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const timeoutRef = useRef(null); // Create a ref to store the timeout ID

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "❌ File too large (max 10MB)"});
      return;
    }
    setFile(selected);
    setPastedIpfsUrl("");
    setMessage(null);
  };

  const uploadToPinata = async () => {
    if (!file) {
      setMessage({ type: "error", text: "Please select a file first" });
      return;
    }

    setUploading(true);
    setMessage({ type: "info", text: "Uploading to Pinata via IPFS..."});

    try {
      const { Pinata_API_Key, Pinata_Secret_Key, Pinata_Group_ID } = await getContracts();

      if (!Pinata_API_Key || !Pinata_Secret_Key) {
        throw new Error("Pinata API keys not configured");
      }

      const formData = new FormData();
      formData.append("file", file);

      const metadata = {
        name: `Proof-Proposal${proposalId}-Milestone${Number(milestoneIndex) + 1}`,
        keyvalues: {
          proposalId,
          milestoneIndex,
          uploader: account,
          timestamp: new Date().toISOString(),
        },
      };

      const options = {
        cidVersion: 1,
        ...(Pinata_Group_ID && { groupId: Pinata_Group_ID }),
      };

      formData.append("pinataMetadata", JSON.stringify(metadata));
      formData.append("pinataOptions", JSON.stringify(options));

      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          pinata_api_key: Pinata_API_Key,
          pinata_secret_api_key: Pinata_Secret_Key,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      const url = `ipfs://${data.IpfsHash}`;
      setIpfsUrl(url);
      setMessage({ type: "success", text: `Uploaded successfully!` });
    } catch (err) {
      console.error("Pinata upload error:", err);
      setMessage({ type: "error", text: `❌ Upload failed: ${err.message}`});
    } finally {
      setUploading(false);
    }
  };

  const submitProof = async () => {
    if (!ipfsUrl) {
      setMessage({ type: "error", text: "Please upload or paste a valid IPFS URL first" });
      return;
    }

    try {
      setSubmitting(true);
      setMessage({ type: "info", text: "Submitting proof..." });

      const { proofOracle } = await getContracts();
      const tx = await proofOracle.submitProof(proposalId, milestoneIndex, ipfsUrl);
      await tx.wait();

      setMessage({
        type: "success",
        text: "Proof submitted successfully! Awaiting admin verification.",
      });
      
      // Reset form
      setFile(null);
      setPastedIpfsUrl("");
      setIpfsUrl("");
      
      // Inform that proof has been uploaded and needs verification
      onUploadComplete?.({ ipfsUrl });
    } catch (err) {
      console.error("submitProof error:", err);

      // Extract the revert reason if available
      let errorMessage = "Transaction failed: Unknown error";
      if (err.reason) {
        // For contract reverts (e.g., "Duplicate submission")
        errorMessage = `Transaction failed: ${err.reason}`;
      } else if (err.message.includes("execution reverted")) {
        // Fallback: Extract message from revert error
        const match = err.message.match(/execution reverted: "([^"]+)"/);
        if (match && match[1]) {
          errorMessage = `Transaction failed: ${match[1]}`;
        }
      }
      
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setSubmitting(false);
    }
  };

  const usePastedLink = () => {
    if (!pastedIpfsUrl.startsWith("ipfs://")) {
      setMessage({ type: "error", text: "Invalid link – must start with ipfs://" });
      return;
    }
    setIpfsUrl(pastedIpfsUrl);
    setMessage({ type: "success", text: `Using existing IPFS URL` });
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      {/* Upload Selection */}
      {!ipfsUrl && (
      <>
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              checked={!useExistingLink} 
              onChange={() => {
                setUseExistingLink(false);
                setMessage(null);
              }}
              className="w-4 h-4 text-orange-600"
            />
            <span className="text-sm font-medium text-gray-700">Upload New File</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              checked={useExistingLink} 
              onChange={() => {
                setUseExistingLink(true);
                setMessage(null);
              }}
              className="w-4 h-4 text-orange-600"
            />
            <span className="text-sm font-medium text-gray-700">Use Existing IPFS Link</span>
          </label>
        </div>

        {/* Conditional Upload UI */}
        {!useExistingLink ? (
          <>
            <div className="mb-3">
              <input
                key="upload-file"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className="w-full border border-gray-300 p-2 rounded-md text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              {file && (
                <p className="text-sm text-gray-600 mt-2 flex items-center">
                  <span className="mr-2">📄</span> {file.name}
                </p>
              )}
            </div>
            <button
              onClick={uploadToPinata}
              disabled={uploading || !file}
              className={`w-full py-2 rounded-lg font-medium transition-colors ${
                uploading || !file
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              }`}
            >
              {uploading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Uploading...
                </span>
              ) : (
                "Upload to IPFS"
              )}
            </button>
          </>
        ) : (
          <>
            <div className="mb-3">
              <input
                key="existing-link"
                type="text"
                placeholder="ipfs://Qm..."
                value={pastedIpfsUrl}
                onChange={(e) => setPastedIpfsUrl(e.target.value)}
                className="w-full border border-gray-300 p-2 rounded-md text-sm font-mono"
              />
            </div>
            <button
              onClick={usePastedLink}
              disabled={!pastedIpfsUrl}
              className={`w-full py-2 rounded-lg font-medium transition-colors ${
                !pastedIpfsUrl
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              }`}
            >
              Use This Link
            </button>
          </>
        )}
      </>
    )}

      {/* After upload/paste */}
      {ipfsUrl && (
        <div className="mt-4 p-4 bg-blue-50 rounded-md border border-blue-200">
          <p className="text-sm text-blue-800 mb-2 flex items-center">
            <strong>IPFS URL Ready:</strong>
          </p>

          <div className="relative mb-3">
            <code className="text-sm text-blue-700 break-all block bg-white p-2 pr-16 rounded border border-blue-200">
              {ipfsUrl}
            </code>
            <button
              onClick={() => {
                // Clear any existing timeout
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                }

                // Copy to clipboard
                navigator.clipboard.writeText(ipfsUrl);
                setMessage({ type: "success", text: "📋 Copied IPFS URL to clipboard!" });

                // Set new timeout and store its ID
                timeoutRef.current = setTimeout(() => {
                  setMessage(null);
                  timeoutRef.current = null; // Clear ref after timeout completes
                }, 1500);
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-blue-600 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded"
            >
              Copy
            </button>
          </div>

          <p className="text-sm text-blue-600 mb-3">
            View proof on Pinata:{" "}
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsUrl.replace("ipfs://", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-800 font-medium"
            >
              Open in New Tab
            </a>
          </p>
          <button
            onClick={submitProof}
            disabled={submitting}
            className={`w-full py-2 rounded-lg font-medium transition-colors ${
              submitting
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-green-500 to-lime-500 hover:from-green-600 hover:to-lime-600 text-white shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting to Blockchain...
              </span>
            ) : (
              "Submit Proof to Blockchain"
            )}
          </button>
        </div>
      )}

      {/* Message Box */}
      {message && (
        <div className={`mt-4 p-3 rounded-md border ${
          message.type === "error" 
            ? "bg-red-50 border-red-200 text-red-700"
            : message.type === "success"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-blue-50 border-blue-200 text-blue-700"
        }`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
        <p className="text-xs text-gray-600">
          <strong>💡 Accepted formats:</strong> PDF, PNG, JPG, JPEG, DOC, DOCX (max 10MB)
        </p>
      </div>
    </div>
  );
}

export default UploadProof;
