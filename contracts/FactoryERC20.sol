// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FactoryERC20
 * @author CCA Platform
 * @notice Standard ERC20 token deployed by SimpleTokenFactory
 * @dev A minimal, gas-efficient ERC20 implementation with fixed supply.
 *      - 18 decimals (standard)
 *      - No mint function after deployment
 *      - No burn function
 *      - No pause functionality
 *      - Initial supply sent to specified recipient
 */
contract FactoryERC20 {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emitted when tokens are transferred
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount transferred
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @notice Emitted when allowance is set
     * @param owner The token owner
     * @param spender The approved spender
     * @param value The approved amount
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Token name
    string public name;

    /// @notice Token symbol
    string public symbol;

    /// @notice Token decimals (always 18)
    uint8 public constant decimals = 18;

    /// @notice Total token supply
    uint256 public totalSupply;

    /// @notice Token balances
    mapping(address => uint256) public balanceOf;

    /// @notice Token allowances
    mapping(address => mapping(address => uint256)) public allowance;

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deploy a new ERC20 token
     * @dev The initial supply is multiplied by 10^18 to account for decimals.
     *      All tokens are minted to the recipient address.
     * @param _name The token name
     * @param _symbol The token symbol
     * @param _initialSupply The initial supply in whole tokens (not wei)
     * @param _recipient The address that receives the initial supply
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _recipient
    ) {
        require(_recipient != address(0), "FactoryERC20: zero recipient");

        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply * 10 ** decimals;
        balanceOf[_recipient] = totalSupply;

        emit Transfer(address(0), _recipient, totalSupply);
    }

    /*//////////////////////////////////////////////////////////////
                            TRANSFER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Transfer tokens to a recipient
     * @dev Reverts if sender has insufficient balance
     * @param to The recipient address
     * @param value The amount to transfer
     * @return success True if transfer succeeds
     */
    function transfer(address to, uint256 value) external returns (bool success) {
        require(to != address(0), "FactoryERC20: zero recipient");
        require(balanceOf[msg.sender] >= value, "FactoryERC20: insufficient balance");

        unchecked {
            balanceOf[msg.sender] -= value;
            balanceOf[to] += value;
        }

        emit Transfer(msg.sender, to, value);
        return true;
    }

    /**
     * @notice Transfer tokens from one address to another using allowance
     * @dev Reverts if sender has insufficient balance or allowance
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount to transfer
     * @return success True if transfer succeeds
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool success) {
        require(to != address(0), "FactoryERC20: zero recipient");
        require(balanceOf[from] >= value, "FactoryERC20: insufficient balance");

        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= value, "FactoryERC20: insufficient allowance");

        unchecked {
            allowance[from][msg.sender] = currentAllowance - value;
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }

        emit Transfer(from, to, value);
        return true;
    }

    /*//////////////////////////////////////////////////////////////
                            APPROVAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Approve a spender to transfer tokens on behalf of the caller
     * @dev Sets the allowance to the specified value (overwrites previous value)
     * @param spender The address allowed to spend tokens
     * @param value The amount of tokens to approve
     * @return success True if approval succeeds
     */
    function approve(address spender, uint256 value) external returns (bool success) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
}
