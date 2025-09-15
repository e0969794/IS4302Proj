const { ethers } = require("hardhat");

async function main() {
  console.log("=== EmergencyFundDAO Demo Scenario ===\n");

  // Deploy the contract
  console.log("📋 Deploying EmergencyFundDAO...");
  const EmergencyFundDAO = await ethers.getContractFactory("EmergencyFundDAO");
  const dao = await EmergencyFundDAO.deploy();
  await dao.waitForDeployment();

  const daoAddress = await dao.getAddress();
  console.log("✅ DAO deployed to:", daoAddress);
  console.log("💰 Min contribution:", ethers.formatEther(await dao.MIN_CONTRIBUTION()), "ETH");

  // Get signers to simulate different community members
  const [deployer, alice, bob, charlie, beneficiary] = await ethers.getSigners();

  console.log("\n🏘️  Community Members:");
  console.log("👩 Alice:", alice.address);
  console.log("👨 Bob:", bob.address); 
  console.log("👤 Charlie:", charlie.address);
  console.log("🎯 Beneficiary:", beneficiary.address);

  // Step 1: Members join the DAO
  console.log("\n=== Step 1: Community Members Join DAO ===");
  
  console.log("👩 Alice joining with 1.0 ETH...");
  await dao.connect(alice).registerMember({ value: ethers.parseEther("1.0") });
  
  console.log("👨 Bob joining with 0.5 ETH...");
  await dao.connect(bob).registerMember({ value: ethers.parseEther("0.5") });
  
  console.log("👤 Charlie joining with 0.3 ETH...");
  await dao.connect(charlie).registerMember({ value: ethers.parseEther("0.3") });

  let stats = await dao.getDAOStats();
  console.log("📊 DAO Stats after registration:");
  console.log("   💰 Total Fund:", ethers.formatEther(stats[0]), "ETH");
  console.log("   👥 Total Members:", stats[1].toString());
  console.log("   📝 Proposals:", stats[2].toString());

  // Step 2: Additional contributions
  console.log("\n=== Step 2: Additional Contributions ===");
  
  console.log("👩 Alice contributing additional 0.2 ETH...");
  await dao.connect(alice).contribute({ value: ethers.parseEther("0.2") });
  
  stats = await dao.getDAOStats();
  console.log("📊 Total fund after additional contribution:", ethers.formatEther(stats[0]), "ETH");

  // Step 3: Emergency occurs - create proposal
  console.log("\n=== Step 3: Emergency Situation - Flood Disaster ===");
  console.log("🌊 EMERGENCY: Major flood hits the region!");
  console.log("👩 Alice creates emergency proposal...");
  
  const proposalTx = await dao.connect(alice).createProposal(
    "Emergency flood relief for 50 affected families. Funds needed for temporary shelter, food supplies, and clean water.",
    "Flood",
    ethers.parseEther("1.0"),
    beneficiary.address
  );
  
  console.log("📝 Proposal created! Proposal ID: 0");
  console.log("💰 Amount requested:", ethers.formatEther(ethers.parseEther("1.0")), "ETH");
  console.log("🎯 Beneficiary:", beneficiary.address);

  // Step 4: Community votes
  console.log("\n=== Step 4: Community Democratic Voting ===");
  console.log("🗳️  Voting period: 3 days");
  
  console.log("👩 Alice votes YES (in favor)");
  await dao.connect(alice).vote(0, true);
  
  console.log("👨 Bob votes YES (in favor)");
  await dao.connect(bob).vote(0, true);
  
  console.log("👤 Charlie votes YES (in favor)");
  await dao.connect(charlie).vote(0, true);

  const proposal = await dao.getProposal(0);
  console.log("📊 Voting results:");
  console.log("   ✅ Votes for:", proposal.votesFor.toString());
  console.log("   ❌ Votes against:", proposal.votesAgainst.toString());
  console.log("   📈 Approval rate: 100% (3/3 votes)");

  // Step 5: Fast forward time (simulate voting period end)
  console.log("\n=== Step 5: Voting Period Ends ===");
  console.log("⏳ Fast forwarding 3 days...");
  
  // Increase time by 3 days + 1 hour
  await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 3600]);
  await ethers.provider.send("evm_mine");

  console.log("✅ Voting period ended");

  // Step 6: Check if proposal can be executed
  console.log("\n=== Step 6: Proposal Execution Check ===");
  const canExecute = await dao.canExecuteProposal(0);
  console.log("🔍 Can execute proposal:", canExecute);

  if (canExecute) {
    console.log("✅ All requirements met:");
    console.log("   ✓ Voting period ended");
    console.log("   ✓ Quorum reached (100% > 51%)");
    console.log("   ✓ Approval threshold met (100% > 60%)");
    console.log("   ✓ Sufficient funds available");
  }

  // Step 7: Execute proposal and release emergency funds
  console.log("\n=== Step 7: Emergency Fund Release ===");
  console.log("🚨 EXECUTING EMERGENCY FUND RELEASE...");
  
  const beneficiaryBalanceBefore = await ethers.provider.getBalance(beneficiary.address);
  console.log("💰 Beneficiary balance before:", ethers.formatEther(beneficiaryBalanceBefore), "ETH");

  await dao.executeProposal(0);
  
  const beneficiaryBalanceAfter = await ethers.provider.getBalance(beneficiary.address);
  console.log("💰 Beneficiary balance after:", ethers.formatEther(beneficiaryBalanceAfter), "ETH");
  console.log("💸 Funds transferred:", ethers.formatEther(beneficiaryBalanceAfter - beneficiaryBalanceBefore), "ETH");

  // Final stats
  console.log("\n=== Final DAO Status ===");
  const finalStats = await dao.getDAOStats();
  console.log("📊 Final DAO statistics:");
  console.log("   💰 Remaining fund:", ethers.formatEther(finalStats[0]), "ETH");
  console.log("   👥 Total members:", finalStats[1].toString());
  console.log("   📝 Total proposals:", finalStats[2].toString());

  const finalProposal = await dao.getProposal(0);
  console.log("📝 Proposal status:");
  console.log("   ✅ Executed:", finalProposal.executed);
  console.log("   🔒 Active:", finalProposal.active);

  console.log("\n🎉 DEMO COMPLETE: Emergency funds successfully deployed to help flood victims!");
  console.log("🌟 The DAO has demonstrated democratic, transparent, and efficient disaster response funding.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });