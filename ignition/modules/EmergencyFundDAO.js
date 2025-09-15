const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const EmergencyFundDAOModule = buildModule("EmergencyFundDAOModule", (m) => {
  
  const emergencyFundDAO = m.contract("EmergencyFundDAO");

  return { emergencyFundDAO };
});

module.exports = EmergencyFundDAOModule;