// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EmergencyFundDAO
 * @dev A decentralized autonomous organization for managing community emergency funds
 * Community members can contribute to a shared fund that can be deployed through democratic voting during disasters
 */
contract EmergencyFundDAO {
    struct Member {
        bool isRegistered;
        uint256 totalContributions;
        uint256 joinedAt;
        bool hasVotingRights;
    }
    
    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        string disasterType;
        uint256 amountRequested;
        address payable beneficiary;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 createdAt;
        uint256 votingDeadline;
        bool executed;
        bool active;
        mapping(address => bool) hasVoted;
    }
    
    // State variables
    mapping(address => Member) public members;
    mapping(uint256 => Proposal) public proposals;
    
    address[] public memberList;
    uint256 public proposalCount;
    uint256 public totalFund;
    uint256 public totalMembers;
    
    // DAO parameters
    uint256 public constant VOTING_PERIOD = 3 days;
    uint256 public constant MIN_CONTRIBUTION = 0.01 ether;
    uint256 public constant QUORUM_PERCENTAGE = 51; // 51% for quorum
    uint256 public constant APPROVAL_THRESHOLD = 60; // 60% approval required
    
    // Events
    event MemberRegistered(address indexed member, uint256 timestamp);
    event ContributionMade(address indexed member, uint256 amount, uint256 timestamp);
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string description,
        uint256 amountRequested,
        address beneficiary
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 timestamp);
    event ProposalExecuted(uint256 indexed proposalId, uint256 amount, address beneficiary);
    event EmergencyFundsReleased(uint256 indexed proposalId, uint256 amount, string disasterType);
    
    // Modifiers
    modifier onlyMember() {
        require(members[msg.sender].isRegistered, "Not a registered member");
        _;
    }
    
    modifier onlyVotingMember() {
        require(members[msg.sender].isRegistered, "Not a registered member");
        require(members[msg.sender].hasVotingRights, "No voting rights");
        _;
    }
    
    modifier proposalExists(uint256 _proposalId) {
        require(_proposalId < proposalCount, "Proposal does not exist");
        _;
    }
    
    modifier proposalActive(uint256 _proposalId) {
        require(proposals[_proposalId].active, "Proposal not active");
        require(block.timestamp <= proposals[_proposalId].votingDeadline, "Voting period ended");
        _;
    }
    
    /**
     * @dev Register as a member of the DAO
     */
    function registerMember() external payable {
        require(!members[msg.sender].isRegistered, "Already registered");
        require(msg.value >= MIN_CONTRIBUTION, "Minimum contribution required");
        
        members[msg.sender] = Member({
            isRegistered: true,
            totalContributions: msg.value,
            joinedAt: block.timestamp,
            hasVotingRights: true
        });
        
        memberList.push(msg.sender);
        totalFund += msg.value;
        totalMembers++;
        
        emit MemberRegistered(msg.sender, block.timestamp);
        emit ContributionMade(msg.sender, msg.value, block.timestamp);
    }
    
    /**
     * @dev Contribute additional funds to the emergency fund
     */
    function contribute() external payable onlyMember {
        require(msg.value > 0, "Contribution must be greater than 0");
        
        members[msg.sender].totalContributions += msg.value;
        totalFund += msg.value;
        
        emit ContributionMade(msg.sender, msg.value, block.timestamp);
    }
    
    /**
     * @dev Create a proposal to release emergency funds
     * @param _description Description of the emergency situation
     * @param _disasterType Type of disaster (flood, earthquake, fire, etc.)
     * @param _amountRequested Amount of funds requested
     * @param _beneficiary Address to receive the funds
     */
    function createProposal(
        string memory _description,
        string memory _disasterType,
        uint256 _amountRequested,
        address payable _beneficiary
    ) external onlyVotingMember {
        require(_amountRequested > 0, "Amount must be greater than 0");
        require(_amountRequested <= totalFund, "Insufficient funds");
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(bytes(_description).length > 0, "Description required");
        require(bytes(_disasterType).length > 0, "Disaster type required");
        
        uint256 proposalId = proposalCount++;
        
        Proposal storage newProposal = proposals[proposalId];
        newProposal.id = proposalId;
        newProposal.proposer = msg.sender;
        newProposal.description = _description;
        newProposal.disasterType = _disasterType;
        newProposal.amountRequested = _amountRequested;
        newProposal.beneficiary = _beneficiary;
        newProposal.createdAt = block.timestamp;
        newProposal.votingDeadline = block.timestamp + VOTING_PERIOD;
        newProposal.active = true;
        newProposal.executed = false;
        newProposal.votesFor = 0;
        newProposal.votesAgainst = 0;
        
        emit ProposalCreated(
            proposalId,
            msg.sender,
            _description,
            _amountRequested,
            _beneficiary
        );
    }
    
    /**
     * @dev Vote on a proposal
     * @param _proposalId The proposal to vote on
     * @param _support True for yes, false for no
     */
    function vote(uint256 _proposalId, bool _support) 
        external 
        onlyVotingMember 
        proposalExists(_proposalId) 
        proposalActive(_proposalId) 
    {
        Proposal storage proposal = proposals[_proposalId];
        require(!proposal.hasVoted[msg.sender], "Already voted");
        
        proposal.hasVoted[msg.sender] = true;
        
        if (_support) {
            proposal.votesFor++;
        } else {
            proposal.votesAgainst++;
        }
        
        emit VoteCast(_proposalId, msg.sender, _support, block.timestamp);
    }
    
    /**
     * @dev Execute a proposal if it has passed
     * @param _proposalId The proposal to execute
     */
    function executeProposal(uint256 _proposalId) 
        external 
        proposalExists(_proposalId) 
    {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp > proposal.votingDeadline, "Voting still ongoing");
        require(!proposal.executed, "Proposal already executed");
        require(proposal.active, "Proposal not active");
        
        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 quorum = (totalMembers * QUORUM_PERCENTAGE) / 100;
        
        require(totalVotes >= quorum, "Quorum not reached");
        
        uint256 approvalPercentage = (proposal.votesFor * 100) / totalVotes;
        require(approvalPercentage >= APPROVAL_THRESHOLD, "Proposal not approved");
        
        require(proposal.amountRequested <= address(this).balance, "Insufficient contract balance");
        
        proposal.executed = true;
        proposal.active = false;
        totalFund -= proposal.amountRequested;
        
        // Transfer funds to beneficiary
        proposal.beneficiary.transfer(proposal.amountRequested);
        
        emit ProposalExecuted(_proposalId, proposal.amountRequested, proposal.beneficiary);
        emit EmergencyFundsReleased(_proposalId, proposal.amountRequested, proposal.disasterType);
    }
    
    /**
     * @dev Get proposal details
     * @param _proposalId The proposal ID
     * @return Basic proposal information
     */
    function getProposal(uint256 _proposalId) 
        external 
        view 
        proposalExists(_proposalId) 
        returns (
            address proposer,
            string memory description,
            string memory disasterType,
            uint256 amountRequested,
            address beneficiary,
            uint256 votesFor,
            uint256 votesAgainst,
            uint256 createdAt,
            uint256 votingDeadline,
            bool executed,
            bool active
        ) 
    {
        Proposal storage proposal = proposals[_proposalId];
        return (
            proposal.proposer,
            proposal.description,
            proposal.disasterType,
            proposal.amountRequested,
            proposal.beneficiary,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.createdAt,
            proposal.votingDeadline,
            proposal.executed,
            proposal.active
        );
    }
    
    /**
     * @dev Check if an address has voted on a proposal
     * @param _proposalId The proposal ID
     * @param _voter The voter address
     * @return Whether the address has voted
     */
    function hasVoted(uint256 _proposalId, address _voter) 
        external 
        view 
        proposalExists(_proposalId) 
        returns (bool) 
    {
        return proposals[_proposalId].hasVoted[_voter];
    }
    
    /**
     * @dev Get member information
     * @param _member The member address
     * @return Member details
     */
    function getMember(address _member) 
        external 
        view 
        returns (
            bool isRegistered,
            uint256 totalContributions,
            uint256 joinedAt,
            bool hasVotingRights
        ) 
    {
        Member storage member = members[_member];
        return (
            member.isRegistered,
            member.totalContributions,
            member.joinedAt,
            member.hasVotingRights
        );
    }
    
    /**
     * @dev Get contract statistics
     * @return totalFund, totalMembers, proposalCount
     */
    function getDAOStats() external view returns (uint256, uint256, uint256) {
        return (totalFund, totalMembers, proposalCount);
    }
    
    /**
     * @dev Get all members (for frontend integration)
     * @return Array of member addresses
     */
    function getAllMembers() external view returns (address[] memory) {
        return memberList;
    }
    
    /**
     * @dev Emergency function to check if proposal meets execution criteria
     * @param _proposalId The proposal ID
     * @return Whether the proposal can be executed
     */
    function canExecuteProposal(uint256 _proposalId) 
        external 
        view 
        proposalExists(_proposalId) 
        returns (bool) 
    {
        Proposal storage proposal = proposals[_proposalId];
        
        if (proposal.executed || !proposal.active) {
            return false;
        }
        
        if (block.timestamp <= proposal.votingDeadline) {
            return false;
        }
        
        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 quorum = (totalMembers * QUORUM_PERCENTAGE) / 100;
        
        if (totalVotes < quorum) {
            return false;
        }
        
        uint256 approvalPercentage = (proposal.votesFor * 100) / totalVotes;
        if (approvalPercentage < APPROVAL_THRESHOLD) {
            return false;
        }
        
        if (proposal.amountRequested > address(this).balance) {
            return false;
        }
        
        return true;
    }
    
    // Receive function to accept direct donations
    receive() external payable {
        totalFund += msg.value;
    }
    
    // Fallback function
    fallback() external payable {
        totalFund += msg.value;
    }
}