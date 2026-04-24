// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ArcEscrow is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public aiOracle;

    enum Mode    { Service, Milestone, NftSwap, Simple }
    enum Status  { Pending, Active, Completed, Disputed, Resolved }

    struct Escrow {
        bytes32 id;
        address buyer;
        address seller;
        uint256 amount;       // USDC, 6 decimals
        Mode    mode;
        Status  status;
        bool    buyerApproved;
        bool    sellerApproved;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => bool)   public escrowExists;

    event EscrowCreated(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, Mode mode);
    event Deposited    (bytes32 indexed id, address indexed buyer,  uint256 amount);
    event Approved     (bytes32 indexed id, address indexed party,  bool buyerApproved, bool sellerApproved);
    event Released     (bytes32 indexed id, address indexed seller, uint256 amount);
    event Disputed     (bytes32 indexed id, address indexed initiator);
    event Resolved     (bytes32 indexed id, address indexed winner, uint256 amount);
    event AiOracleUpdated(address indexed oldOracle, address indexed newOracle);

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

    constructor(address _usdc, address _aiOracle) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc      = IERC20(_usdc);
        aiOracle  = _aiOracle;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setAiOracle(address _aiOracle) external onlyOwner {
        emit AiOracleUpdated(aiOracle, _aiOracle);
        aiOracle = _aiOracle;
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    function createEscrow(
        bytes32 id,
        address buyer,
        address seller,
        uint256 amount,
        Mode    mode
    ) external {
        require(
            msg.sender == owner() || msg.sender == aiOracle || msg.sender == buyer,
            "Not authorized"
        );
        require(!escrowExists[id],       "ID already used");
        require(buyer  != address(0),    "Invalid buyer");
        require(seller != address(0),    "Invalid seller");
        require(seller != buyer,         "Buyer cannot be seller");
        require(amount > 0,              "Amount must be positive");

        escrows[id] = Escrow({
            id:             id,
            buyer:          buyer,
            seller:         seller,
            amount:         amount,
            mode:           mode,
            status:         Status.Pending,
            buyerApproved:  false,
            sellerApproved: false
        });
        escrowExists[id] = true;

        emit EscrowCreated(id, buyer, seller, amount, mode);
    }

    function deposit(bytes32 id) external exists(id) {
        Escrow storage e = escrows[id];
        require(msg.sender == e.buyer,      "Only buyer can deposit");
        require(e.status == Status.Pending, "Not pending");

        usdc.safeTransferFrom(msg.sender, address(this), e.amount);
        e.status = Status.Active;

        emit Deposited(id, msg.sender, e.amount);
    }

    function approve(bytes32 id) external exists(id) onlyParty(id) {
        Escrow storage e = escrows[id];
        require(e.status == Status.Active, "Not active");

        // Idempotent: re-calling after already approved is a no-op, not a revert.
        // This handles the case where a tx was mined but the client missed the receipt.
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
            usdc.safeTransfer(e.seller, e.amount);
            emit Released(id, e.seller, e.amount);
        }
    }

    function dispute(bytes32 id) external exists(id) onlyParty(id) {
        Escrow storage e = escrows[id];
        require(e.status == Status.Active, "Not active");

        e.status = Status.Disputed;
        emit Disputed(id, msg.sender);
    }

    function resolve(bytes32 id, address winner) external exists(id) {
        require(msg.sender == aiOracle || msg.sender == owner(), "Not authorized");
        Escrow storage e = escrows[id];
        require(e.status == Status.Disputed,                    "Not disputed");
        require(winner == e.buyer || winner == e.seller,        "Invalid winner");

        e.status = Status.Resolved;
        usdc.safeTransfer(winner, e.amount);
        emit Resolved(id, winner, e.amount);
    }

    // ── View ─────────────────────────────────────────────────────────────────

    function getEscrow(bytes32 id) external view returns (Escrow memory) {
        return escrows[id];
    }
}
