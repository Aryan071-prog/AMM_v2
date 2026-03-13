const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying AMM V2 Protocol - Multi-User Demo\n");

  // Get accounts
  const [deployer, user1, user2, user3] = await hre.ethers.getSigners();
  console.log("📋 Accounts Available:");
  console.log("  Deployer:", deployer.address);
  console.log("  User1:   ", user1.address);
  console.log("  User2:   ", user2.address);
  console.log("  User3:   ", user3.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("\n💰 Deployer ETH Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // ============================================================
  // DEPLOY CONTRACTS
  // ============================================================
  console.log("📝 DEPLOYING CONTRACTS...");

  console.log("\n  Deploying TokenA...");
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const tokenA = await TokenA.deploy();
  await tokenA.waitForDeployment();
  console.log("  ✅ TokenA:", await tokenA.getAddress());

  console.log("\n  Deploying TokenB...");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const tokenB = await TokenB.deploy();
  await tokenB.waitForDeployment();
  console.log("  ✅ TokenB:", await tokenB.getAddress());

  console.log("\n  Deploying Factory...");
  const Factory = await hre.ethers.getContractFactory("Factory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("  ✅ Factory:", await factory.getAddress());

  console.log("\n  Deploying Router...");
  const Router = await hre.ethers.getContractFactory("Router");
  const router = await Router.deploy(await factory.getAddress());
  await router.waitForDeployment();
  console.log("  ✅ Router:", await router.getAddress());

  console.log("\n  Setting Router in Factory...");
  await (await factory.setRouter(await router.getAddress())).wait();
  console.log("  ✅ Router configured");

  console.log("\n  Creating TokenA/TokenB Pair...");
  await (await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress())).wait();
  const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
  console.log("  ✅ Pair:", pairAddress);

  const Pair = await hre.ethers.getContractFactory("Pair");
  const pairContract = Pair.attach(pairAddress);

  // ============================================================
  // ADD INITIAL LIQUIDITY (50:5000 ratio)
  // ============================================================
  console.log("\n💰 ADDING INITIAL LIQUIDITY (50:5000 ratio)...");

  const tokenAAmount = hre.ethers.parseEther("50");
  const tokenBAmount = hre.ethers.parseEther("5000");

  await (await tokenA.mint(deployer.address, tokenAAmount)).wait();
  await (await tokenB.mint(deployer.address, tokenBAmount)).wait();

  await (await tokenA.approve(await router.getAddress(), tokenAAmount)).wait();
  await (await tokenB.approve(await router.getAddress(), tokenBAmount)).wait();

  await (await router.addLiquidity(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    tokenAAmount,
    tokenBAmount,
    0,
    0,
    deployer.address
  )).wait();

  console.log("  ✅ Liquidity added by Deployer");
  console.log(`  Pool: 50 TokenA + 5000 TokenB (1 TokenA = 100 TokenB)`);

  let reserves = await pairContract.getReserves();
  console.log(`  Reserves - TokenA: ${hre.ethers.formatEther(reserves[0])} | TokenB: ${hre.ethers.formatEther(reserves[1])}`);

  // ============================================================
  // DISTRIBUTE TOKENS TO USERS
  // ============================================================
  console.log("\n💸 DISTRIBUTING TOKENS TO USERS...");

  const users = [
    { signer: user1, name: "User1", tokenAAmount: hre.ethers.parseEther("500"), tokenBAmount: hre.ethers.parseEther("10000") },
    { signer: user2, name: "User2", tokenAAmount: hre.ethers.parseEther("1000"), tokenBAmount: hre.ethers.parseEther("5000") },
    { signer: user3, name: "User3", tokenAAmount: hre.ethers.parseEther("200"), tokenBAmount: hre.ethers.parseEther("20000") }
  ];

  for (const user of users) {
    await (await tokenA.mint(user.signer.address, user.tokenAAmount)).wait();
    await (await tokenB.mint(user.signer.address, user.tokenBAmount)).wait();
    console.log(`  ✅ ${user.name}: ${hre.ethers.formatEther(user.tokenAAmount)} TokenA + ${hre.ethers.formatEther(user.tokenBAmount)} TokenB`);
  }

  // ============================================================
  // MULTI-USER SWAP DEMO
  // ============================================================
  console.log("\n🔄 MULTI-USER SWAP DEMONSTRATION...");
  console.log("=".repeat(60));

  const slippageBps = 50n; // 0.5%

  // --- User1: Swap TokenA → TokenB ---
  console.log("\n👤 USER1: Swapping TokenA → TokenB");
  console.log("-".repeat(60));
  
  const user1SwapAmount = hre.ethers.parseEther("50");
  const routerUser1 = router.connect(user1);
  const tokenAUser1 = tokenA.connect(user1);

  await (await tokenAUser1.approve(await router.getAddress(), user1SwapAmount)).wait();

  const user1ExpectedOut = await router.getAmountOutForPair(
    await pairContract.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user1SwapAmount
  );
  const user1MinOut = (user1ExpectedOut * (10000n - slippageBps)) / 10000n;

  console.log(`  Input:  ${hre.ethers.formatEther(user1SwapAmount)} TokenA`);
  console.log(`  Expected Output: ${hre.ethers.formatEther(user1ExpectedOut)} TokenB`);
  console.log(`  Minimum Output (with slippage): ${hre.ethers.formatEther(user1MinOut)} TokenB`);

  await (await routerUser1.swapExactTokensForTokens(
    user1SwapAmount,
    user1MinOut,
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user1.address
  )).wait();

  console.log("  ✅ Swap completed!");

  let user1TokenA = await tokenA.balanceOf(user1.address);
  let user1TokenB = await tokenB.balanceOf(user1.address);
  console.log(`  User1 Balance: ${hre.ethers.formatEther(user1TokenA)} TokenA | ${hre.ethers.formatEther(user1TokenB)} TokenB`);

  reserves = await pairContract.getReserves();
  console.log(`  Pool: TokenA ${hre.ethers.formatEther(reserves[0])} | TokenB ${hre.ethers.formatEther(reserves[1])}`);

  // --- User2: Swap TokenB → TokenA ---
  console.log("\n👤 USER2: Swapping TokenB → TokenA");
  console.log("-".repeat(60));

  const user2SwapAmount = hre.ethers.parseEther("500");
  const routerUser2 = router.connect(user2);
  const tokenBUser2 = tokenB.connect(user2);

  await (await tokenBUser2.approve(await router.getAddress(), user2SwapAmount)).wait();

  const user2ExpectedOut = await router.getAmountOutForPair(
    await pairContract.getAddress(),
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    user2SwapAmount
  );
  const user2MinOut = (user2ExpectedOut * (10000n - slippageBps)) / 10000n;

  console.log(`  Input:  ${hre.ethers.formatEther(user2SwapAmount)} TokenB`);
  console.log(`  Expected Output: ${hre.ethers.formatEther(user2ExpectedOut)} TokenA`);
  console.log(`  Minimum Output (with slippage): ${hre.ethers.formatEther(user2MinOut)} TokenA`);

  await (await routerUser2.swapExactTokensForTokens(
    user2SwapAmount,
    user2MinOut,
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    user2.address
  )).wait();

  console.log("  ✅ Swap completed!");

  let user2TokenA = await tokenA.balanceOf(user2.address);
  let user2TokenB = await tokenB.balanceOf(user2.address);
  console.log(`  User2 Balance: ${hre.ethers.formatEther(user2TokenA)} TokenA | ${hre.ethers.formatEther(user2TokenB)} TokenB`);

  reserves = await pairContract.getReserves();
  console.log(`  Pool: TokenA ${hre.ethers.formatEther(reserves[0])} | TokenB ${hre.ethers.formatEther(reserves[1])}`);

  // --- User3: Swap TokenA → TokenB (Large Trade) ---
  console.log("\n👤 USER3: Swapping TokenA → TokenB (Large Trade)");
  console.log("-".repeat(60));

  const user3SwapAmount = hre.ethers.parseEther("100");
  const routerUser3 = router.connect(user3);
  const tokenAUser3 = tokenA.connect(user3);

  await (await tokenAUser3.approve(await router.getAddress(), user3SwapAmount)).wait();

  const user3ExpectedOut = await router.getAmountOutForPair(
    await pairContract.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user3SwapAmount
  );
  const user3MinOut = (user3ExpectedOut * (10000n - slippageBps)) / 10000n;

  console.log(`  Input:  ${hre.ethers.formatEther(user3SwapAmount)} TokenA`);
  console.log(`  Expected Output: ${hre.ethers.formatEther(user3ExpectedOut)} TokenB`);
  console.log(`  Minimum Output (with slippage): ${hre.ethers.formatEther(user3MinOut)} TokenB`);

  await (await routerUser3.swapExactTokensForTokens(
    user3SwapAmount,
    user3MinOut,
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user3.address
  )).wait();

  console.log("  ✅ Swap completed!");

  let user3TokenA = await tokenA.balanceOf(user3.address);
  let user3TokenB = await tokenB.balanceOf(user3.address);
  console.log(`  User3 Balance: ${hre.ethers.formatEther(user3TokenA)} TokenA | ${hre.ethers.formatEther(user3TokenB)} TokenB`);

  reserves = await pairContract.getReserves();
  console.log(`  Pool: TokenA ${hre.ethers.formatEther(reserves[0])} | TokenB ${hre.ethers.formatEther(reserves[1])}`);

  // --- User1: Swap TokenB → TokenA (Reverse) ---
  console.log("\n👤 USER1: Swapping TokenB → TokenA (Reverse)");
  console.log("-".repeat(60));

  const user1ReverseAmount = hre.ethers.parseEther("1000");
  const tokenBUser1 = tokenB.connect(user1);

  await (await tokenBUser1.approve(await router.getAddress(), user1ReverseAmount)).wait();

  const user1ReverseExpected = await router.getAmountOutForPair(
    await pairContract.getAddress(),
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    user1ReverseAmount
  );
  const user1ReverseMin = (user1ReverseExpected * (10000n - slippageBps)) / 10000n;

  console.log(`  Input:  ${hre.ethers.formatEther(user1ReverseAmount)} TokenB`);
  console.log(`  Expected Output: ${hre.ethers.formatEther(user1ReverseExpected)} TokenA`);
  console.log(`  Minimum Output (with slippage): ${hre.ethers.formatEther(user1ReverseMin)} TokenA`);

  await (await routerUser1.swapExactTokensForTokens(
    user1ReverseAmount,
    user1ReverseMin,
    await tokenB.getAddress(),
    await tokenA.getAddress(),
    user1.address
  )).wait();

  console.log("  ✅ Swap completed!");

  user1TokenA = await tokenA.balanceOf(user1.address);
  user1TokenB = await tokenB.balanceOf(user1.address);
  console.log(`  User1 Balance: ${hre.ethers.formatEther(user1TokenA)} TokenA | ${hre.ethers.formatEther(user1TokenB)} TokenB`);

  reserves = await pairContract.getReserves();
  console.log(`  Pool: TokenA ${hre.ethers.formatEther(reserves[0])} | TokenB ${hre.ethers.formatEther(reserves[1])}`);

  // --- User2: Swap Exact Output ---
  console.log("\n👤 USER2: Swap TokenA → TokenB (Exact Output)");
  console.log("-".repeat(60));

  const user2DesiredOutput = hre.ethers.parseEther("200");
  const tokenAUser2 = tokenA.connect(user2);

  await (await tokenAUser2.approve(await router.getAddress(), hre.ethers.parseEther("1000"))).wait();

  console.log(`  Desired Output: ${hre.ethers.formatEther(user2DesiredOutput)} TokenB`);
  console.log(`  Max Input: ${hre.ethers.formatEther(hre.ethers.parseEther("50"))} TokenA`);

  await (await routerUser2.swapTokensForExactTokens(
    user2DesiredOutput,
    hre.ethers.parseEther("50"),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    user2.address
  )).wait();

  console.log("  ✅ Swap completed!");

  user2TokenA = await tokenA.balanceOf(user2.address);
  user2TokenB = await tokenB.balanceOf(user2.address);
  console.log(`  User2 Balance: ${hre.ethers.formatEther(user2TokenA)} TokenA | ${hre.ethers.formatEther(user2TokenB)} TokenB`);

  reserves = await pairContract.getReserves();
  console.log(`  Pool: TokenA ${hre.ethers.formatEther(reserves[0])} | TokenB ${hre.ethers.formatEther(reserves[1])}`);

  // ============================================================
  // PRICE CALCULATOR DEMO
  // ============================================================
  console.log("\n📊 PRICE CALCULATOR FUNCTIONS");
  console.log("=".repeat(60));

  const testAmount = hre.ethers.parseEther("10");

  const quotedAmount = await router.quote(
    await pairContract.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    testAmount
  );
  console.log(`\n  quote(): ${hre.ethers.formatEther(testAmount)} TokenA = ${hre.ethers.formatEther(quotedAmount)} TokenB`);

  const amountOutReserves = await router.getAmountOut(
    await pairContract.getAddress(),
    testAmount,
    reserves[0],
    reserves[1]
  );
  console.log(`  getAmountOut(): ${hre.ethers.formatEther(testAmount)} TokenA = ${hre.ethers.formatEther(amountOutReserves)} TokenB (with 3% fee)`);

  const amountOutPair = await router.getAmountOutForPair(
    await pairContract.getAddress(),
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    testAmount
  );
  console.log(`  getAmountOutForPair(): ${hre.ethers.formatEther(testAmount)} TokenA = ${hre.ethers.formatEther(amountOutPair)} TokenB`);

  // ============================================================
  // FINAL USER BALANCES
  // ============================================================
  console.log("\n💰 FINAL USER BALANCES");
  console.log("=".repeat(60));

  console.log("\n  Deployer:");
  let deployerTokenA = await tokenA.balanceOf(deployer.address);
  let deployerTokenB = await tokenB.balanceOf(deployer.address);
  console.log(`    TokenA: ${hre.ethers.formatEther(deployerTokenA)}`);
  console.log(`    TokenB: ${hre.ethers.formatEther(deployerTokenB)}`);

  console.log("\n  User1:");
  console.log(`    TokenA: ${hre.ethers.formatEther(user1TokenA)}`);
  console.log(`    TokenB: ${hre.ethers.formatEther(user1TokenB)}`);

  console.log("\n  User2:");
  console.log(`    TokenA: ${hre.ethers.formatEther(user2TokenA)}`);
  console.log(`    TokenB: ${hre.ethers.formatEther(user2TokenB)}`);

  console.log("\n  User3:");
  console.log(`    TokenA: ${hre.ethers.formatEther(user3TokenA)}`);
  console.log(`    TokenB: ${hre.ethers.formatEther(user3TokenB)}`);

  // ============================================================
  // REMOVE LIQUIDITY DEMO
  // ============================================================
  console.log("\n💸 REMOVE LIQUIDITY DEMO");
  console.log("=".repeat(60));

  const lpBalance = await pairContract.balanceOf(deployer.address);
  console.log(`\n  Deployer LP Balance: ${hre.ethers.formatEther(lpBalance)}`);

  await (await pairContract.approve(await router.getAddress(), lpBalance)).wait();

  const halfLiquidity = lpBalance / 2n;
  console.log(`  Removing 50% of liquidity...`);

  await (await router.removeLiquidity(
    await tokenA.getAddress(),
    await tokenB.getAddress(),
    halfLiquidity,
    0,
    0,
    deployer.address
  )).wait();

  console.log("  ✅ Liquidity removed!");

  const remainingLP = await pairContract.balanceOf(deployer.address);
  console.log(`  Remaining LP: ${hre.ethers.formatEther(remainingLP)}`);

  deployerTokenA = await tokenA.balanceOf(deployer.address);
  deployerTokenB = await tokenB.balanceOf(deployer.address);
  console.log(`  Deployer TokenA: ${hre.ethers.formatEther(deployerTokenA)}`);
  console.log(`  Deployer TokenB: ${hre.ethers.formatEther(deployerTokenB)}`);

  const finalReserves = await pairContract.getReserves();
  console.log(`\n  Final Pool: TokenA ${hre.ethers.formatEther(finalReserves[0])} | TokenB ${hre.ethers.formatEther(finalReserves[1])}`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("📊 DEPLOYMENT & MULTI-USER DEMO SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("\nContract Addresses:");
  console.log("  TokenA:   ", await tokenA.getAddress());
  console.log("  TokenB:   ", await tokenB.getAddress());
  console.log("  Factory:  ", await factory.getAddress());
  console.log("  Router:   ", await router.getAddress());
  console.log("  Pair:     ", pairAddress);
  console.log("=".repeat(60));
  console.log("✅ All operations completed successfully!");
  console.log("   ✓ Liquidity added (50:5000 ratio)");
  console.log("   ✓ Tokens distributed to 3 users");
  console.log("   ✓ Multiple swaps executed by different users");
  console.log("   ✓ Price calculations verified");
  console.log("   ✓ Liquidity partially removed");
  console.log("=".repeat(60));

  console.log("\n✨ Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
