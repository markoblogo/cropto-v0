// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CroptOptionNFT
 * @dev NFT contract for Cropto options - each option can be minted as an NFT
 * @notice Mints NFTs representing options contracts with unique metadata
 */
contract CroptOptionNFT is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    uint256 private _tokenIdCounter;
    
    // Mapping from optionId (UUID string) to NFT tokenId
    mapping(string => uint256) public optionIdToTokenId;
    
    // Mapping from tokenId to optionId
    mapping(uint256 => string) public tokenIdToOptionId;
    
    // Events
    event OptionNFTMinted(
        address indexed to,
        uint256 indexed tokenId,
        string optionId,
        string tokenURI
    );

    constructor() ERC721("Cropto Option NFT", "CROPTNFT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        // Start counter at 1 to avoid conflict with default mapping value of 0
        _tokenIdCounter = 1;
    }

    /**
     * @dev Mints an NFT for a specific option
     * @param to Address to receive the NFT
     * @param optionId UUID of the option (from database)
     * @param uri Metadata URI for the NFT
     * @return tokenId The minted token ID
     */
    function safeMint(
        address to,
        string memory optionId,
        string memory uri
    ) public onlyRole(MINTER_ROLE) returns (uint256) {
        require(bytes(optionId).length > 0, "Option ID cannot be empty");
        require(optionIdToTokenId[optionId] == 0, "Option already minted");
        
        uint256 tokenId = _tokenIdCounter++;  // Post-increment: use current value, then increment
        
        // Store mappings
        optionIdToTokenId[optionId] = tokenId;
        tokenIdToOptionId[tokenId] = optionId;
        
        // Mint NFT
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        
        emit OptionNFTMinted(to, tokenId, optionId, uri);
        
        return tokenId;
    }

    /**
     * @dev Check if an option has been minted as NFT
     * @param optionId UUID of the option
     * @return bool True if minted, false otherwise
     */
    function isOptionMinted(string memory optionId) public view returns (bool) {
        return optionIdToTokenId[optionId] != 0;
    }

    /**
     * @dev Get token ID for a given option ID
     * @param optionId UUID of the option
     * @return tokenId The NFT token ID (0 if not minted)
     */
    function getTokenIdByOptionId(string memory optionId) public view returns (uint256) {
        return optionIdToTokenId[optionId];
    }

    /**
     * @dev Get option ID for a given token ID
     * @param tokenId The NFT token ID
     * @return optionId The option UUID
     */
    function getOptionIdByTokenId(uint256 tokenId) public view returns (string memory) {
        return tokenIdToOptionId[tokenId];
    }

    // Required overrides
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
