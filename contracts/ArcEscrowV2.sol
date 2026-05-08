// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ArcEscrowV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable usdc;
    address public aiOracle;
    uint256 public platformFee    = 250;   // basis points — 250 = 2.5%
    address public platformWallet;

    // Milestone status sentinels
    uint8 public constant MS_PENDING   = 0;
    uint8 public constant MS_COMPLETED = 1;
    uint8 public constant MS_DISPUTED  = 2;
    uint8 public constant MS_RESOLVED  = 3;

    enum Mode   { Service, Simple, Milestone }
    enum Status { Pending, Active, Completed, Disputed, Resolved }

    struct Escrow {
        bytes32   id;
        address   buyer;
        address   seller;
        uint256   amount;                    // total USDC (6 decimals)
        Mode      mode;
        Status    status;
        bool      buyerApproved;
        bool      sellerApproved;
        bytes32   deliverableHash;           // seller proof (non-milestone)
        bytes32   initialEvidenceHash;       // buyer pre-evidence
        bytes32   disputeEvidenceHash;       // opener's dispute evidence
        bytes32   defenseEvidenceHash;       // other party's defense
        address   disputeInitiator;
        uint256[] milestoneAmounts;
        uint8[]   milestoneStatuses;
        bytes32[] milestoneDeliverableHashes;
        bytes32[] milestoneDisputeEvidence;
        address[] milestoneDisputeInitiators;
        bytes32[] milestoneDefenseHashes;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => bool)   public escrowExists;

    // ── Events ───────────────────────────────────────────────────────────────

    // V1 (kept for ABI compatibility)
    event EscrowCreated  (bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, Mode mode);
    event Deposited      (bytes32 indexed id, address indexed buyer,  uint256 amount);
    event Approved       (bytes32 indexed id, address indexed party,  bool buyerApproved, bool sellerApproved);
    event Released       (bytes32 indexed id, address indexed seller, uint256 amount);
    event Disputed       (bytes32 indexed id, address indexed initiator);
    event Resolved       (bytes32 indexed id, address indexed winner, uint256 amount);
    event AiOracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ERC-8183
    event DeliverableSubmitted(bytes32 indexed id, bytes32 deliverableHash);
    event JobCompleted        (bytes32 indexed id, address indexed seller, uint256 amount);
    event JobRejected         (bytes32 indexed id, address indexed buyer,  uint256 amount);

    // Milestone
    event MilestoneDeliverableSubmitted(bytes32 indexed id, uint256 index, bytes32 deliverableHash);
    event MilestoneReleased(bytes32 indexed id, uint256 index, address indexed seller, uint256 amount);
    event MilestoneDisputed(bytes32 indexed id, uint256 index, address indexed initiator);
    event MilestoneResolved(bytes32 indexed id, uint256 index, address indexed winner,  uint256 amount);

    // Platform
    event PlatformFeeUpdated   (uint256 oldFee,            uint256 newFee);
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // Evidence
    event InitialEvidenceSubmitted (bytes32 indexed id, bytes32 evidenceHash);
    event DefenseSubmitted         (bytes32 indexed id, address indexed party, bytes32 defenseHash);
    event MilestoneDefenseSubmitted(bytes32 indexed id, uint256 index, bytes32 defenseHash);

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier exists(bytes32 id) {
        require(escrowExists[id], "Escrow not found");
        _;
    }

    modifier onlyParty(bytes32 id) {
        require(
            msg.sender == escrows[id].buyer || msg.sender == escrows[id].seller,
            "Not a party"
        );
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == aiOracle || msg.sender == owner(), "Not authorized");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(address _usdc, address _aiOracle, address _platformWallet) Ownable(msg.sender) {
        require(_usdc           != address(0), "Invalid USDC");
        require(_platformWallet != address(0), "Invalid platform wallet");
        usdc           = IERC20(_usdc);
        aiOracle       = _aiOracle;
        platformWallet = _platformWallet;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setAiOracle(address _aiOracle) external onlyOwner {
        emit AiOracleUpdated(aiOracle, _aiOracle);
        aiOracle = _aiOracle;
    }

    function setPlatformWallet(address _wallet) external onlyOwner {
        require(_wallet != address(0), "Invalid wallet");
        emit PlatformWalletUpdated(platformWallet, _wallet);
        platformWallet = _wallet;
    }

    function setPlatformFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee exceeds 10%");
        emit PlatformFeeUpdated(platformFee, _fee);
        platformFee = _fee;
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    function createEscrow(
        bytes32            id,
        address            buyer,
        address            seller,
        uint256            amount,
        Mode               mode,
        uint256[] calldata milestoneAmounts
    ) external {
        require(
            msg.sender == owner() || msg.sender == aiOracle || msg.sender == buyer,
            "Not authorized"
        );
        require(!escrowExists[id],    "ID already used");
        require(buyer  != address(0), "Invalid buyer");
        require(seller != address(0), "Invalid seller");
        require(seller != buyer,      "Buyer cannot be seller");
        require(amount > 0,           "Amount must be positive");

        if (mode == Mode.Milestone) {
            require(milestoneAmounts.length > 0, "No milestones provided");
            uint256 total;
            for (uint256 i; i < milestoneAmounts.length; ++i) {
                require(milestoneAmounts[i] > 0, "Zero milestone amount");
                total += milestoneAmounts[i];
            }
            require(total == amount, "Milestone amounts must sum to total");
        } else {
            require(milestoneAmounts.length == 0, "Milestones only for Milestone mode");
        }

        escrowExists[id] = true;
        Escrow storage e = escrows[id];
        e.id     = id;
        e.buyer  = buyer;
        e.seller = seller;
        e.amount = amount;
        e.mode   = mode;
        e.status = Status.Pending;

        for (uint256 i; i < milestoneAmounts.length; ++i) {
            e.milestoneAmounts.push(milestoneAmounts[i]);
            e.milestoneStatuses.push(MS_PENDING);
            e.milestoneDeliverableHashes.push(bytes32(0));
            e.milestoneDisputeEvidence.push(bytes32(0));
            e.milestoneDisputeInitiators.push(address(0));
            e.milestoneDefenseHashes.push(bytes32(0));
        }

        emit EscrowCreated(id, buyer, seller, amount, mode);
    }

    function deposit(bytes32 id) external exists(id) nonReentrant {
        Escrow storage e = escrows[id];
        require(msg.sender == e.buyer,      "Only buyer can deposit");
        require(e.status == Status.Pending, "Not pending");

        usdc.safeTransferFrom(msg.sender, address(this), e.amount);
        e.status = Status.Active;

        emit Deposited(id, msg.sender, e.amount);
    }

    // ── Standard approval — Service / Simple ─────────────────────────────────

    function approve(bytes32 id) external exists(id) onlyParty(id) nonReentrant {
        Escrow storage e = escrows[id];
        require(e.mode != Mode.Milestone, "Use milestone functions");
        require(e.status == Status.Active, "Not active");

        if (msg.sender == e.buyer) {
            if (e.buyerApproved) return;
            e.buyerApproved = true;
        } else {
            if (e.sellerApproved) return;
            e.sellerApproved = true;
        }

        emit Approved(id, msg.sender, e.buyerApproved, e.sellerApproved);

        if (e.buyerApproved && e.sellerApproved) {
            e.status = Status.Completed;
            _releaseToSeller(e.seller, e.amount);
            emit Released(id, e.seller, e.amount);
        }
    }

    function dispute(bytes32 id, bytes32 disputeEvidenceHash) external exists(id) onlyParty(id) {
        Escrow storage e = escrows[id];
        require(e.mode != Mode.Milestone,          "Use disputeMilestone");
        require(e.status == Status.Active,         "Not active");
        require(disputeEvidenceHash != bytes32(0), "Dispute evidence required");

        e.status              = Status.Disputed;
        e.disputeEvidenceHash = disputeEvidenceHash;
        e.disputeInitiator    = msg.sender;
        emit Disputed(id, msg.sender);
    }

    function resolve(bytes32 id, address winner) external exists(id) onlyOracle nonReentrant {
        Escrow storage e = escrows[id];
        require(e.mode != Mode.Milestone,                "Use resolveMilestone");
        require(e.status == Status.Disputed,             "Not disputed");
        require(winner == e.buyer || winner == e.seller, "Invalid winner");
        require(e.deliverableHash != bytes32(0),         "No proof submitted");

        e.status = Status.Resolved;
        if (winner == e.seller) {
            _releaseToSeller(e.seller, e.amount);
        } else {
            usdc.safeTransfer(e.buyer, e.amount);
        }
        emit Resolved(id, winner, e.amount);
    }

    // ── ERC-8183 ─────────────────────────────────────────────────────────────

    function submitDeliverable(bytes32 id, bytes32 deliverableHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(msg.sender == e.seller,                                   "Only seller");
        require(e.status == Status.Active || e.status == Status.Disputed, "Invalid status");
        require(e.deliverableHash == bytes32(0),                              "Already submitted");

        e.deliverableHash = deliverableHash;
        emit DeliverableSubmitted(id, deliverableHash);
    }

    function completeJob(bytes32 id) external exists(id) onlyOracle nonReentrant {
        Escrow storage e = escrows[id];
        require(e.mode != Mode.Milestone,        "Use releaseMilestone");
        require(e.status == Status.Active,       "Not active");
        require(e.deliverableHash != bytes32(0), "No proof submitted");

        e.status = Status.Completed;
        _releaseToSeller(e.seller, e.amount);
        emit JobCompleted(id, e.seller, e.amount);
    }

    function rejectJob(bytes32 id) external exists(id) onlyOracle nonReentrant {
        Escrow storage e = escrows[id];
        require(e.mode != Mode.Milestone, "Use milestone functions");
        require(e.status == Status.Active, "Not active");

        e.status = Status.Resolved;
        usdc.safeTransfer(e.buyer, e.amount);
        emit JobRejected(id, e.buyer, e.amount);
    }

    // ── Evidence ─────────────────────────────────────────────────────────────

    function submitInitialEvidence(bytes32 id, bytes32 evidenceHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(msg.sender == e.buyer,                                        "Only buyer");
        require(e.status == Status.Pending || e.status == Status.Active,      "Invalid status");
        require(e.initialEvidenceHash == bytes32(0),                          "Already submitted");

        e.initialEvidenceHash = evidenceHash;
        emit InitialEvidenceSubmitted(id, evidenceHash);
    }

    function submitDefense(bytes32 id, bytes32 defenseHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(e.status == Status.Disputed,                     "Not disputed");
        require(msg.sender != e.disputeInitiator,                "Cannot be dispute initiator");
        require(msg.sender == e.buyer || msg.sender == e.seller, "Not a party");
        require(e.defenseEvidenceHash == bytes32(0),             "Already submitted");

        e.defenseEvidenceHash = defenseHash;
        emit DefenseSubmitted(id, msg.sender, defenseHash);
    }

    function submitMilestoneDefense(bytes32 id, uint256 index, bytes32 defenseHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(e.mode == Mode.Milestone,                           "Not milestone escrow");
        require(index < e.milestoneAmounts.length,                  "Invalid index");
        require(e.milestoneStatuses[index] == MS_DISPUTED,          "Not disputed");
        require(msg.sender != e.milestoneDisputeInitiators[index],  "Cannot be dispute initiator");
        require(msg.sender == e.buyer || msg.sender == e.seller,    "Not a party");
        require(e.milestoneDefenseHashes[index] == bytes32(0),      "Already submitted");

        e.milestoneDefenseHashes[index] = defenseHash;
        emit MilestoneDefenseSubmitted(id, index, defenseHash);
    }

    // ── Milestone ────────────────────────────────────────────────────────────

    function submitMilestoneDeliverable(bytes32 id, uint256 index, bytes32 deliverableHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(msg.sender == e.seller,               "Only seller");
        require(e.mode == Mode.Milestone,             "Not milestone escrow");
        require(e.status == Status.Active,            "Not active");
        require(index < e.milestoneAmounts.length,    "Invalid index");
        require(e.milestoneStatuses[index] == MS_PENDING, "Not pending");
        require(deliverableHash != bytes32(0),        "Hash cannot be zero");

        e.milestoneDeliverableHashes[index] = deliverableHash;
        emit MilestoneDeliverableSubmitted(id, index, deliverableHash);
    }

    function releaseMilestone(bytes32 id, uint256 index) external exists(id) onlyOracle nonReentrant {
        Escrow storage e = escrows[id];
        require(e.mode == Mode.Milestone,                 "Not milestone escrow");
        require(e.status == Status.Active,                "Not active");
        require(index < e.milestoneAmounts.length,        "Invalid index");
        require(e.milestoneStatuses[index] == MS_PENDING, "Not pending");

        e.milestoneStatuses[index] = MS_COMPLETED;
        uint256 mAmt = e.milestoneAmounts[index];
        _releaseToSeller(e.seller, mAmt);
        emit MilestoneReleased(id, index, e.seller, mAmt);
    }

    function disputeMilestone(bytes32 id, uint256 index, bytes32 disputeEvidenceHash) external exists(id) {
        Escrow storage e = escrows[id];
        require(msg.sender == e.buyer,                    "Only buyer");
        require(e.mode == Mode.Milestone,                 "Not milestone escrow");
        require(e.status == Status.Active,                "Not active");
        require(index < e.milestoneAmounts.length,        "Invalid index");
        require(e.milestoneStatuses[index] == MS_PENDING, "Not pending");
        require(disputeEvidenceHash != bytes32(0),        "Dispute evidence required");

        e.milestoneStatuses[index]          = MS_DISPUTED;
        e.milestoneDisputeEvidence[index]   = disputeEvidenceHash;
        e.milestoneDisputeInitiators[index] = msg.sender;
        emit MilestoneDisputed(id, index, msg.sender);
    }

    function resolveMilestone(bytes32 id, uint256 index, address winner)
        external exists(id) onlyOracle nonReentrant
    {
        Escrow storage e = escrows[id];
        require(e.mode == Mode.Milestone,                   "Not milestone escrow");
        require(index < e.milestoneAmounts.length,          "Invalid index");
        require(e.milestoneStatuses[index] == MS_DISPUTED,  "Not disputed");
        require(winner == e.buyer || winner == e.seller,    "Invalid winner");

        e.milestoneStatuses[index] = MS_RESOLVED;
        uint256 mAmt = e.milestoneAmounts[index];
        if (winner == e.seller) {
            _releaseToSeller(e.seller, mAmt);
        } else {
            usdc.safeTransfer(e.buyer, mAmt);
        }
        emit MilestoneResolved(id, index, winner, mAmt);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getEscrow(bytes32 id) external view returns (Escrow memory) {
        return escrows[id];
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _releaseToSeller(address seller, uint256 gross) internal {
        uint256 fee = (gross * platformFee) / 10000;
        usdc.safeTransfer(seller, gross - fee);
        if (fee > 0) usdc.safeTransfer(platformWallet, fee);
    }
}
