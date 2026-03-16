require("dotenv").config();

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Deployer:", signer.address);

  const balance = await hre.ethers.provider.getBalance(signer.address);
  if (balance === 0n) {
    console.error("Error: No ETH balance. Get Sepolia testnet ETH from faucet.");
    process.exit(1);
  }
  console.log("ETH Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy Token A
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const tokenA = await TokenA.deploy();
  await tokenA.waitForDeployment();
  const tokenAAddress = await tokenA.getAddress();
  console.log("TokenA deployed:", tokenAAddress);

  // Deploy Token B
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const tokenB = await TokenB.deploy();
  await tokenB.waitForDeployment();
  const tokenBAddress = await tokenB.getAddress();
  console.log("TokenB deployed:", tokenBAddress);

  // Deploy Factory
  const Factory = await hre.ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Factory deployed:", factoryAddress);

  // Deploy Router
  const Router = await hre.ethers.getContractFactory("Router");
  const router = await Router.deploy(factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("Router deployed:", routerAddress);

  // Set Router in Factory
  await (await factory.setRouter(routerAddress)).wait();

  // Create Pair
  await (await factory.createPair(tokenAAddress, tokenBAddress)).wait();
  const pairAddress = await factory.getPair(tokenAAddress, tokenBAddress);
  console.log("Pair created:", pairAddress);

  const pair = await hre.ethers.getContractAt("Pair", pairAddress);

  // Add Liquidity
  const liquidityAWei = hre.ethers.parseEther("1000");
  const liquidityBWei = hre.ethers.parseEther("1000");

  await (await tokenA.approve(routerAddress, liquidityAWei)).wait();
  await (await tokenB.approve(routerAddress, liquidityBWei)).wait();

  const addLiqTx = await router.addLiquidity(
    tokenAAddress,
    tokenBAddress,
    liquidityAWei,
    liquidityBWei,
    0,
    0,
    signer.address
  );
  await addLiqTx.wait();
  console.log("\nLiquidity added (1000 TokenA + 1000 TokenB)");

  const lpBalance = await pair.balanceOf(signer.address);
  console.log("LP Token Balance:", hre.ethers.formatEther(lpBalance));

  // Swap Token A for Token B
  const swapAmountIn = hre.ethers.parseEther("100");
  const expectedOut = await router.getAmountOutForPair(pairAddress, tokenAAddress, tokenBAddress, swapAmountIn);
  const minOut = (expectedOut * 9950n) / 10000n; // 0.5% slippage

  await (await tokenA.approve(routerAddress, swapAmountIn)).wait();

  const swapTx = await router.swapExactTokensForTokens(
    swapAmountIn,
    minOut,
    tokenAAddress,
    tokenBAddress,
    signer.address
  );
  await swapTx.wait();
  console.log("\nSwap completed: 100 TokenA →", hre.ethers.formatEther(expectedOut), "TokenB");

  // Final balances
  const finalTokenA = await tokenA.balanceOf(signer.address);
  const finalTokenB = await tokenB.balanceOf(signer.address);
  console.log("\nFinal Balances:");
  console.log("  TokenA:", hre.ethers.formatEther(finalTokenA));
  console.log("  TokenB:", hre.ethers.formatEther(finalTokenB));
  console.log("  LP Tokens:", hre.ethers.formatEther(lpBalance));

  // Burn LP Tokens (remove liquidity)
  const burnAmount = lpBalance / 2n; // Burn 50% of LP tokens
  console.log("\nBurning LP Tokens:", hre.ethers.formatEther(burnAmount));

  await (await pair.approve(routerAddress, burnAmount)).wait();

  const removeLiqTx = await router.removeLiquidity(
    tokenAAddress,
    tokenBAddress,
    burnAmount,
    0,
    0,
    signer.address
  );
  await removeLiqTx.wait();
  console.log("LP tokens burned successfully!");

  // Balances after burning
  const afterBurnTokenA = await tokenA.balanceOf(signer.address);
  const afterBurnTokenB = await tokenB.balanceOf(signer.address);
  const afterBurnLP = await pair.balanceOf(signer.address);

  console.log("\nBalances After Burning:");
  console.log("  TokenA:", hre.ethers.formatEther(afterBurnTokenA));
  console.log("  TokenB:", hre.ethers.formatEther(afterBurnTokenB));
  console.log("  LP Tokens:", hre.ethers.formatEther(afterBurnLP));

  console.log("\n=== Contract Addresses ===");
  console.log("Factory:", factoryAddress);
  console.log("Router:", routerAddress);
  console.log("Pair:", pairAddress);
  console.log("TokenA:", tokenAAddress);
  console.log("TokenB:", tokenBAddress);
  console.log("\nView on Etherscan: https://sepolia.etherscan.io/address/" + signer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
