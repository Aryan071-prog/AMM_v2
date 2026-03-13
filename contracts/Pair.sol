// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


contract Pair is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Tokens
    address public immutable token0;
    address public immutable token1;

    // Reserves
    uint256 public reserve0;
    uint256 public reserve1;

    // LP Token
    string public constant name = "AMM V2 LP Token";
    string public constant symbol = "AMM-LP";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    // Fee: 3% (30 out of 1000)
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public fee = 30;

    // Factory and Router
    address public factory;
    address public router;
    address public owner;

    // Minimum liquidity locked
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    constructor(address _token0, address _token1) {
        require(_token0 != _token1, "Identical tokens");
        require(_token0 != address(0) && _token1 != address(0), "Zero address");
        token0 = _token0;
        token1 = _token1;
        factory = msg.sender;
        router = msg.sender;
        owner = msg.sender;
    }


    function setRouter(address _router) external {
        require(msg.sender == factory || msg.sender == owner, "Not authorized");
        router = _router;
    }


    function _update(uint256 _reserve0, uint256 _reserve1) internal {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
        emit Sync(reserve0, reserve1);
    }


    function getReserves() external view returns (uint256 r0, uint256 r1) {
        return (reserve0, reserve1);
    }


    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        view
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Zero amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        uint256 feeAmount = (amountIn * fee) / FEE_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - feeAmount;
        amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
    }

    /**
     * @dev Get amount out - determines reserves based on token addresses
     * @param amountIn Input amount
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     */
    function getAmountOutByTokens(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        require(tokenIn == token0 || tokenIn == token1, "Invalid tokenIn");
        require(tokenOut == token0 || tokenOut == token1, "Invalid tokenOut");
        require(tokenIn != tokenOut, "Same token");

        // Determine which reserve is which based on token addresses
        (uint256 reserveIn, uint256 reserveOut) = tokenIn == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);

        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
    }


    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 amount0, uint256 amount1) = _getBalances();

        uint256 _totalSupply = totalSupply;

        if (_totalSupply == 0) {
            // Initial liquidity
            liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            require(liquidity > 0, "Insufficient liquidity");
            _mint(address(1), MINIMUM_LIQUIDITY); // Lock minimum
        } else {
            // Proportional liquidity
            uint256 liquidity0 = (amount0 * _totalSupply) / reserve0;
            uint256 liquidity1 = (amount1 * _totalSupply) / reserve1;
            liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        }

        require(liquidity > 0, "Insufficient liquidity minted");
        _mint(to, liquidity);

        _update(amount0, amount1);
        emit Mint(msg.sender, amount0, amount1);
    }


    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity = balanceOf[msg.sender];
        require(liquidity > 0, "Zero liquidity");

        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * reserve0) / _totalSupply;
        amount1 = (liquidity * reserve1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "Insufficient amounts");

        _burn(msg.sender, liquidity);

        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        (uint256 r0, uint256 r1) = _getBalances();
        _update(r0, r1);
        emit Burn(msg.sender, amount0, amount1, to);
    }


    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "Zero output");
        require(to != address(this), "Invalid recipient");

        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        require(amount0Out < r0 && amount1Out < r1, "Insufficient liquidity");

        // Transfer output tokens FIRST (flash loan pattern)
        if (amount0Out > 0) {
            IERC20(token0).safeTransfer(to, amount0Out);
        }
        if (amount1Out > 0) {
            IERC20(token1).safeTransfer(to, amount1Out);
        }

        // Calculate input amounts based on balance changes AFTER transfer
        // Input tokens should have been sent to pair before swap (by Router)
        uint256 balance0 = _getBalance(token0);
        uint256 balance1 = _getBalance(token1);

        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;

        require(amount0In > 0 || amount1In > 0, "Zero input");

        // Update reserves with new balances
        _update(balance0, balance1);

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }


    function _getBalances() internal view returns (uint256 amount0, uint256 amount1) {
        amount0 = _getBalance(token0);
        amount1 = _getBalance(token1);
    }

    function _getBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }


    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    mapping(address => mapping(address => uint256)) public allowance;

    function _transfer(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "Insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "Insufficient balance");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }


    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
