// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Pair.sol";


contract Factory {
    address public owner;
    address public router;

    // All pairs created
    address[] public allPairs;

    // Mapping: token0 => token1 => pair address
    mapping(address => mapping(address => address)) public getPair;

    // Events
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 pairCount
    );
    event RouterSet(address indexed router);
    event OwnerChanged(address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");

        // Sort tokens
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
        require(getPair[token0][token1] == address(0), "Pair exists");

        // Deploy new pair
        pair = deployPair(token0, token1);

        // Store pair in BOTH directions for easy lookup
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

   
    function deployPair(address token0, address token1) internal returns (address) {
        Pair pair = new Pair(token0, token1);
        return address(pair);
    }

    
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    
    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterSet(_router);
    }

    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
