// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Factory.sol";
import "./Pair.sol";

/**
 * @title Router - Main User Interface for AMM
 * @dev Delegates all operations to Factory and Pair contracts (Uniswap v2 style)
 */
contract Router {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public owner;

    // Events
    event Swap(
        address indexed sender,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address to
    );
    event LiquidityAdded(
        address indexed user,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed user,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _factory) {
        factory = _factory;
        owner = msg.sender;
    }

    /**
     * @dev Get pair address from Factory
     */
    function getPair(address tokenA, address tokenB) public view returns (address pair) {
        pair = Factory(factory).getPair(tokenA, tokenB);
    }

    /**
     * @dev Add liquidity (delegates minting to Pair)
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // Get or create pair via Factory
        address pair = getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = Factory(factory).createPair(tokenA, tokenB);
        }

        // Calculate optimal amounts
        (amountA, amountB) = _calculateOptimalAmountsForPair(
            pair,
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired
        );

        // Check slippage
        require(amountA >= amountAMin && amountB >= amountBMin, "Slippage exceeded");

        // Transfer tokens to pair
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);

        // Delegate LP token minting to Pair
        liquidity = Pair(pair).mint(to);

        emit LiquidityAdded(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    /**
     * @dev Calculate optimal amounts for a pair
     */
    function _calculateOptimalAmountsForPair(
        address pair,
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserve0, uint256 reserve1) = Pair(pair).getReserves();
        
        if (reserve0 == 0 && reserve1 == 0) {
            return (amountADesired, amountBDesired);
        }

        address token0 = tokenA < tokenB ? tokenA : tokenB;
        uint256 reserveA = tokenA == token0 ? reserve0 : reserve1;
        uint256 reserveB = tokenB == token0 ? reserve0 : reserve1;

        return _calculateOptimalAmounts(
            amountADesired,
            amountBDesired,
            reserveA,
            reserveB
        );
    }

    /**
     * @dev Calculate optimal deposit amounts based on current reserve ratio
     */
    function _calculateOptimalAmounts(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (reserveA == 0 && reserveB == 0) {
            // Initial liquidity
            return (amountADesired, amountBDesired);
        }

        uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
        if (amountBOptimal <= amountBDesired) {
            return (amountADesired, amountBOptimal);
        } else {
            uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
            return (amountAOptimal, amountBDesired);
        }
    }

    /**
     * @dev Remove liquidity (delegates burning to Pair)
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external returns (uint256 amountA, uint256 amountB) {
        address pair = getPair(tokenA, tokenB);
        require(pair != address(0), "Pair does not exist");

        // Transfer LP tokens from user to router
        IERC20(pair).safeTransferFrom(msg.sender, address(this), liquidity);

        // Approve pair to spend LP tokens
        IERC20(pair).approve(pair, liquidity);

        // Delegate burning to Pair - it will send underlying tokens to 'to'
        (amountA, amountB) = Pair(pair).burn(to);

        // Check slippage
        require(amountA >= amountAMin, "Slippage exceeded");
        require(amountB >= amountBMin, "Slippage exceeded");

        emit LiquidityRemoved(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    // ============================================================
    // Price Calculator Functions (delegates to Pair)
    // ============================================================

    /**
     * @dev Get amount out - delegates to Pair's calculation
     * @param pair The pair address (to read fee and calculate)
     * @param amountIn Input amount
     * @param reserveIn Reserve of input token
     * @param reserveOut Reserve of output token
     */
    function getAmountOut(address pair, uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        view
        returns (uint256 amountOut)
    {
        require(pair != address(0), "Invalid pair");
        require(amountIn > 0, "Zero amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        
        // Delegate to Pair's getAmountOut function
        amountOut = Pair(pair).getAmountOut(amountIn, reserveIn, reserveOut);
    }

    /**
     * @dev Get amount out for a specific pair (delegates to Pair.getAmountOutByTokens)
     * @param pair The pair address
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Input amount
     */
    function getAmountOutForPair(address pair, address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        require(pair != address(0), "Invalid pair");
        amountOut = Pair(pair).getAmountOutByTokens(tokenIn, tokenOut, amountIn);
    }

    /**
     * @dev Get quote - delegates to Pair's calculation logic
     * @dev Simple ratio calculation: (amountA * reserveB) / reserveA
     * @param pair The pair address (to fetch reserves)
     * @param amountA Amount of token A
     * @param tokenA Token A address (to determine which reserve)
     * @param tokenB Token B address
     */
    function quote(address pair, address tokenA, address tokenB, uint256 amountA)
        external
        view
        returns (uint256 amountB)
    {
        require(pair != address(0), "Invalid pair");
        require(amountA > 0, "Zero amount");

        (uint256 reserveA, uint256 reserveB) = _getReservesForTokens(pair, tokenA, tokenB);
        require(reserveA > 0 && reserveB > 0, "Insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @dev Get reserves for given tokens
     */
    function _getReservesForTokens(address pair, address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (uint256 reserve0, uint256 reserve1)=Pair(pair).getReserves();
        (address token0, ) = tokenA < tokenB ?(tokenA,tokenB):(tokenB,tokenA);
        reserveA= tokenA==token0 ? reserve0:reserve1;
        reserveB = tokenB==token0 ? reserve0:reserve1;
    }

    // ============================================================
    // Swap Functions (single-hop, delegates to Pair)
    // ============================================================

    /**
     * @dev Swap exact tokens for tokens (single-hop, delegates to Pair)
     * @param amountIn Exact input amount
     * @param amountOutMin Minimum output amount (slippage protection)
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param to Recipient address
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address tokenIn,
        address tokenOut,
        address to
    ) external returns (uint256 amountOut) {
        address pair = getPair(tokenIn, tokenOut);
        require(pair != address(0), "Pair does not exist");

        // Calculate output using Pair's logic
        amountOut = Pair(pair).getAmountOutByTokens(tokenIn, tokenOut, amountIn);
        require(amountOut >= amountOutMin, "Slippage exceeded");

        // Transfer input tokens from user to pair
        IERC20(tokenIn).safeTransferFrom(msg.sender, pair, amountIn);

        // Execute swap via Pair
        _executeSwap(pair, tokenIn, tokenOut, amountOut, to);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
    }

    /**
     * @dev Swap tokens for exact tokens (single-hop, delegates to Pair)
     * @param amountOut Exact desired output amount
     * @param amountInMax Maximum input amount (slippage protection)
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param to Recipient address
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address tokenIn,
        address tokenOut,
        address to
    ) external returns (uint256 amountIn) {
        address pair = getPair(tokenIn, tokenOut);
        require(pair != address(0), "Pair does not exist");

        // Calculate required input using reverse calculation
        amountIn = _getAmountIn(amountOut, pair, tokenIn, tokenOut);
        require(amountIn <= amountInMax, "Exceeds maximum input");

        // Transfer input tokens from user to pair
        IERC20(tokenIn).safeTransferFrom(msg.sender, pair, amountIn);

        // Execute swap via Pair
        _executeSwap(pair, tokenIn, tokenOut, amountOut, to);

        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
    }

    /**
     * @dev Execute swap on Pair contract
     */
    function _executeSwap(
        address pair,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        address to
    ) internal {
        (address token0, ) = tokenIn < tokenOut ? (tokenIn, tokenOut) : (tokenOut, tokenIn);
        (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0
            ? (uint256(0), amountOut)
            : (amountOut, uint256(0));
        Pair(pair).swap(amount0Out, amount1Out, to);
    }

    /**
     * @dev Calculate input amount required for desired output (reverse calculation)
     * @dev Delegates to Pair's fee structure
     * @param amountOut Desired output amount
     * @param pair The pair address
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     */
    function _getAmountIn(uint256 amountOut, address pair, address tokenIn, address tokenOut)
        internal
        view
        returns (uint256 amountIn)
    {
        require(amountOut > 0, "Zero output");

        // Get reserves from Pair
        (uint256 reserve0, uint256 reserve1) = Pair(pair).getReserves();
        (address token0, ) = tokenIn < tokenOut ? (tokenIn, tokenOut) : (tokenOut, tokenIn);

        uint256 reserveIn = tokenIn == token0 ? reserve0 : reserve1;
        uint256 reserveOut = tokenIn == token0 ? reserve1 : reserve0;

        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        require(amountOut < reserveOut, "Insufficient reserve");

        // Reverse calculation matching Pair's 3% fee
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 970;
        amountIn = (numerator / denominator) + 1;
    }

}
