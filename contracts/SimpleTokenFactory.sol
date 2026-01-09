// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FactoryERC20.sol";

/**
 * @title SimpleTokenFactory
 * @author CCA Platform
 * @notice Factory contract for deploying ERC20 tokens on the CCA platform
 * @dev Allows users to deploy standard ERC20 tokens without external tools like Remix.
 *      Each deployment creates a new FactoryERC20 token with the specified parameters.
 */
contract SimpleTokenFactory {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emitted when a new token is deployed
     * @param tokenAddress The address of the newly deployed token
     * @param deployer The address that deployed the token
     * @param name The name of the token
     * @param symbol The symbol of the token
     * @param initialSupply The initial supply (in whole tokens, not wei)
     * @param recipient The address that received the initial supply
     */
    event TokenDeployed(
        address indexed tokenAddress,
        address indexed deployer,
        string name,
        string symbol,
        uint256 initialSupply,
        address indexed recipient
    );

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Array of all deployed token addresses
    address[] public deployedTokens;

    /// @notice Mapping from deployer address to their deployed token addresses
    mapping(address => address[]) public tokensByDeployer;

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deploy a new ERC20 token
     * @dev Creates a new FactoryERC20 token and transfers the initial supply to the recipient.
     *      The deployer does not need to be the recipient.
     * @param name The name of the token (e.g., "My Token")
     * @param symbol The symbol of the token (e.g., "MTK")
     * @param initialSupply The initial supply in whole tokens (will be multiplied by 10^18)
     * @param recipient The address that will receive the initial token supply
     * @return tokenAddress The address of the newly deployed token contract
     */
    function deployToken(
        string calldata name,
        string calldata symbol,
        uint256 initialSupply,
        address recipient
    ) external returns (address tokenAddress) {
        // Validate inputs
        require(bytes(name).length > 0, "SimpleTokenFactory: name required");
        require(bytes(symbol).length > 0, "SimpleTokenFactory: symbol required");
        require(recipient != address(0), "SimpleTokenFactory: zero recipient");

        // Deploy new token contract
        FactoryERC20 token = new FactoryERC20(name, symbol, initialSupply, recipient);
        tokenAddress = address(token);

        // Track deployment
        deployedTokens.push(tokenAddress);
        tokensByDeployer[msg.sender].push(tokenAddress);

        // Emit event
        emit TokenDeployed(
            tokenAddress,
            msg.sender,
            name,
            symbol,
            initialSupply,
            recipient
        );

        return tokenAddress;
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get the total number of tokens deployed through this factory
     * @return count The number of deployed tokens
     */
    function getDeployedTokenCount() external view returns (uint256 count) {
        return deployedTokens.length;
    }

    /**
     * @notice Get all tokens deployed through this factory
     * @return tokens Array of all deployed token addresses
     */
    function getDeployedTokens() external view returns (address[] memory tokens) {
        return deployedTokens;
    }

    /**
     * @notice Get the number of tokens deployed by a specific address
     * @param deployer The address to query
     * @return count The number of tokens deployed by the address
     */
    function getTokenCountByDeployer(address deployer) external view returns (uint256 count) {
        return tokensByDeployer[deployer].length;
    }

    /**
     * @notice Get all tokens deployed by a specific address
     * @param deployer The address to query
     * @return tokens Array of token addresses deployed by the address
     */
    function getTokensByDeployer(address deployer) external view returns (address[] memory tokens) {
        return tokensByDeployer[deployer];
    }
}
