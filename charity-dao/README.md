# Charity DAO Frontend

This guide explains how to set up and test the frontend for the Charity DAO application, built with React, Vite, Hardhat, and Tailwind CSS v4 on Windows. The frontend interacts with a smart contract deployed on a local Hardhat network, allowing users to create, view, and approve proposals.

## Prerequisites
- **Node.js**: Install Node.js (v18 or later) from [nodejs.org](https://nodejs.org/).
- **MetaMask**: Install the MetaMask browser extension (see below).
- **Windows**: Commands are tailored for Windows PowerShell.

## Setup Instructions

### 1. Clone the Repository
Clone the Charity DAO repository to your local machine:
```powershell
git clone <repository-url>
```

### 2. Install Dependencies
Install the required Node.js packages for the project:
```powershell
cd .\charity-dao
npm install
```
This installs dependencies like `ethers`, `react`, `vite`, `tailwindcss`, and Hardhat.

### 3. Install and Configure MetaMask
MetaMask is required to interact with the blockchain via the frontend.

1. **Install MetaMask**:
   - Download and install the MetaMask extension for your browser (e.g. Chrome) from [metamask.io](https://metamask.io/).
   - Follow the setup wizard to create a new wallet or import an existing one. Securely store your seed phrase.

2. **Add Hardhat Network**:
   - Open MetaMask, click the network dropdown (e.g. "Ethereum Mainnet"), and select "Add Network".
   - Add a new network with the following details:
     - **Network Name**: Hardhat
     - **New RPC URL**: `http://127.0.0.1:8545`
     - **Chain ID**: `31337`
     - **Currency Symbol**: ETH
   - Save the network.

3. **Import Accounts**:
   - After running `npx hardhat node` (see below), import the following accounts using their private keys (displayed in the Hardhat console output):
     - **Deployer (Admin) Account**: Account #0 (e.g. `0xf39Fd6e51...`). This account has the `DAO_ADMIN` role and can approve proposals.
     - **NGO Wallet**: One of the funded NGO accounts (e.g. `0x123456789...`, private key `0xabcdef123...`) for creating proposals.
   - To import: In MetaMask, click the account icon, select "Import Account", and paste the private key.

**Important**: Every time you stop and restart `npx hardhat node`, you **must delete and re-add the Hardhat network** in MetaMask. This is because Hardhat resets its blockchain state (nonces, accounts, and chain ID) on restart, which can cause MetaMask to cache outdated nonces or state, leading to transaction failures (e.g. "nonce too low" errors or "invalid chain ID"). To delete the network:
- Go to MetaMask > Networks.
- Select "Hardhat" and click "Delete".
- Re-add the network as described above and re-import accounts.

### 4. Run the Hardhat Node
Start a local Hardhat node to simulate an Ethereum blockchain:
```powershell
cd .\IS4302Proj
npx hardhat node
```
- This starts a local blockchain at `http://127.0.0.1:8545` (Chain ID: 31337).
- The console displays 20 accounts with private keys and 10,000 ETH each. Note:
  - **Account #0** (e.g. `0xf39Fd6e51...`) is the deployer and has the `DAO_ADMIN` role, allowing it to approve proposals in `AdminPanel.jsx`.
  - Other accounts (e.g. `0x123456789...`) are funded with 100 ETH by `deploy.js` for NGO use.

> **Why Account #0 is the Admin**: The `deploy.js` script deploys the `Treasury` contract with the constructor argument `admin` set to the Hardhat node’s first account (account #0). The `Treasury.sol` constructor grants the `DAO_ADMIN` role to this address (`_grantRole(DAO_ADMIN, admin)`), enabling it to call `approveProposal`.

### 5. Deploy Contracts
Deploy the smart contracts to the Hardhat network:
```powershell
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```
- This compiles `Treasury.sol`, `Proposal.sol`, `GovernanceToken.sol`, and `NGOOracle.sol` and deploys them.
- The `deploy.js` script:
  - Deploys the contracts.
  - Funds NGO wallets (e.g. `0x123456789...`) with 100 ETH.
  - Outputs contract addresses (e.g. `GovernanceToken`, `Treasury`, `NGOOracle`).
  - Updates `.env` with the new addresses:
    ```plaintext
    VITE_GOVTOKEN_ADDRESS=NEW_GOVERNANCE_TOKEN_ADDRESS
    VITE_TREASURY_ADDRESS=NEW_TREASURY_ADDRESS
    VITE_NGO_ORACLE_ADDRESS=NEW_NGOORACLE_ADDRESS
    ```

### 6. Start the Frontend
Run the Vite development server to start the frontend:
```powershell
npm run dev
```
- The frontend is now accessible at `http://localhost:5173`.
- Keep the Hardhat node running in a separate terminal.

## Testing Instructions

### 1. Access the Application
- Open `http://localhost:5173` in a browser with MetaMask installed.

### 2. Test Without Wallet
1. Disconnect MetaMask (set to "Not connected").
2. Navigate to the Proposal List page.
3. **Expected**: Displays "Please connect wallet to view proposals."

### 3. Test Proposal Creation
1. **Connect NGO Wallet**:
   - In MetaMask, select the NGO wallet (e.g. `0x123456789...`, private key from `deploy.js`).
   - Click "Connect Wallet" at the top of the page.
   - **Expected**: Shows `Connected: 0x123456789...`, `GOV Balance: 0 GOV`.
2. **Create Proposal**:
   - Select the text field.
   - Enter:
     - Total Funds: `10`
     - Milestone 1: `Build School, 5`
     - Click on "Add Milestone" button
     - Milestone 2: `Train Teachers, 5`
   - Click "Submit Proposal" and confirm the transaction in MetaMask.
   - **Expected**: Alert "Proposal created!".
3. **Verify Proposal List**:
   - Scroll down to see the list of proposals.
   - **Expected**: Displays "Proposal ID: 1, NGO: 0x123456789..., Total Funds: 10 ETH, Approved: No" with milestones.
   - Console (F12): `proposalSubmitted event received`, `Proposal IDs: ["1"]`.

### 4. Test Proposal Approval
1. **Connect Admin Wallet**:
   - In MetaMask, select the deployer wallet (account #0, e.g. `0xf39Fd6e51...`).
   - It should automatically connect the wallet. If not, click "Connect Wallet".
2. **Approve Proposal**:
   - Enter `1` for Proposal ID.
   - Click "Approve Proposal" and confirm the transaction.
   - **Expected**: Alert "Proposal approved!".
   - Console: `proposalApproved event received`.
3. **Verify Proposal List**:
   - Scroll down to see the list of proposals.
   - **Expected**: Shows "Approved: Yes" for Proposal ID 1.

### 5. Test Non-NGO Wallet
1. Import another Hardhat account (e.g. account #1, `0x70997970C...`, private key `0x59c6995e9...`).
2. It should automatically connect the wallet. If not, click "Connect Wallet".
3. **Expected**: Shows the same proposal list (e.g. Proposal ID 1).

## Troubleshooting
- **Hardhat Network Issues**:
  - If transactions fail (e.g. "nonce too low" or "invalid chain ID"), delete and re-add the Hardhat network in MetaMask, then re-import accounts. This resets MetaMask’s cached state to match the fresh Hardhat blockchain.
- **No Proposals Shown**:
  - Verify `getAllProposals`:
    ```javascript
    const { ethers } = require("hardhat");
    const treasury = await ethers.getContractAt("Treasury", "NEW_TREASURY_ADDRESS");
    console.log(await proposalManager.getAllProjects());
    ```
  - Check `nextProposalId`: `console.log(await treasury.nextProposalId())`.
- **Approval Fails**:
  - Ensure the admin wallet (account #0) is connected:
    ```javascript
    console.log(await treasury.hasRole(await treasury.DAO_ADMIN(), "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"));
    ```
  - Check F12 console for `Submission error:` or `Approval error:`.
- **No Updates**:
  - Verify `proposalSubmitted` and `proposalApproved` events in F12 console.
- **MetaMask Connection**:
  - Ensure network is set to `http://127.0.0.1:8545`, Chain ID: 31337.
