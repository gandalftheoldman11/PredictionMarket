import { parseAbi } from "viem";

/** Order struct field order must match TradewarExchange.Order exactly. */
export const ORDER_STRUCT =
  "struct Order { uint256 salt; address maker; address signer; address taker; uint256 tokenId; uint256 makerAmount; uint256 takerAmount; uint256 expiration; uint256 nonce; uint256 feeRateBps; uint8 side; }";

export const exchangeAbi = parseAbi([
  ORDER_STRUCT,
  "function usdc() view returns (address)",
  "function ctf() view returns (address)",
  "function proxyFactory() view returns (address)",
  "function trustedForwarder() view returns (address)",
  "function nonces(address signer) view returns (uint256)",
  "function filled(bytes32 orderHash) view returns (uint256)",
  "function cancelled(bytes32 orderHash) view returns (bool)",
  "function hashOrder(Order o) view returns (bytes32)",
  "function cancelOrder(Order o)",
  "function fillOrder(Order o, bytes sig, uint256 makerAssetFill)",
  "function matchOrders(uint8 mt, Order takerOrder, bytes takerSig, uint256 takerFill, Order[] makerOrders, bytes[] makerSigs, uint256[] makerFills)",
]);

export const registryAbi = parseAbi([
  "function isTradable(uint256 tokenId) view returns (bool)",
  "function feeBps(uint256 tokenId) view returns (uint16)",
  "function complementOf(uint256 tokenId) view returns (uint256)",
  "function conditionOf(uint256 tokenId) view returns (bytes32)",
  "function conversionAdapterOf(uint256 tokenId) view returns (address)",
  "function positionCollateralOf(uint256 tokenId) view returns (address)",
  "function getMarket(bytes32 conditionId) view returns ((bytes32 conditionId, address oracle, uint16 feeBps, bool paused, uint256[] tokenIds, string metadata))",
]);

export const negRiskAdapterAbi = parseAbi([
  "function activeOutcomeCount(bytes32 marketId) view returns (uint256)",
  "function activePositionId(bytes32 marketId, uint256 outcomeIndex, bool yes) view returns (uint256)",
  "function otherPositionId(bytes32 marketId, uint256 version, bool yes) view returns (uint256)",
  "function activeConditionId(bytes32 marketId, uint256 outcomeIndex) view returns (bytes32)",
  "function otherVersionCount(bytes32 marketId) view returns (uint256)",
  "function convertPositions(bytes32 marketId, uint256 indexSet, uint256 amount)",
  "function mergeYesSet(bytes32 marketId, uint256 amount)",
  "function mergeYesSetToNo(bytes32 marketId, uint256 targetOutcomeIndex, uint256 amount)",
  "function rollOther(bytes32 marketId, uint256 fromVersion, uint256 amount)",
]);

export const ctfAbi = parseAbi([
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) pure returns (bytes32)",
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)",
]);

export const usdcAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

export const factoryAbi = parseAbi([
  "function implementation() view returns (address)",
  "function usdc() view returns (address)",
  "function ctf() view returns (address)",
  "function exchange() view returns (address)",
  "function proxyOf(address owner) view returns (address)",
  "function createProxy(address owner) returns (address)",
]);

export const oracleAbi = parseAbi([
  "function propose(bytes32 conditionId, bytes32 questionId, uint256[] payouts)",
  "function finalize(bytes32 conditionId)",
  "function disputeWindow() view returns (uint64)",
  "function getProposal(bytes32 conditionId) view returns ((bytes32 questionId, uint256[] payouts, uint64 proposedAt, uint16 outcomeSlotCount, bool disputed, bool finalized))",
]);

export const userProxyAbi = parseAbi([
  "function factory() view returns (address)",
  "function owner() view returns (address)",
  "function trustedForwarder() view returns (address)",
  "function pausedAt() view returns (uint256)",
  "function exitAvailableAt() view returns (uint256)",
  "function pause()",
  "function unpause()",
  "function withdrawToken(address token, address to, uint256 amount)",
  "function withdrawPositions(address to, uint256[] tokenIds, uint256[] amounts)",
  "function revokeExchangeApprovals()",
  "function redeem(bytes32 conditionId, uint256[] indexSets)",
  "function convertNegRisk(address adapter, bytes32 marketId, uint256 indexSet, uint256 amount)",
  "function mergeNegRiskYesSetToNo(address adapter, bytes32 marketId, uint256 targetOutcomeIndex, uint256 amount)",
  "function rollNegRiskOther(address adapter, bytes32 marketId, uint256 fromVersion, uint256 amount)",
  "function redeemNegRisk(address adapter, bytes32 conditionId, uint256 yesAmount, uint256 noAmount) returns (uint256 payout)",
]);

export const forwarderAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function execute((address from,address to,uint256 value,uint256 gas,uint48 deadline,bytes data,bytes signature) request) payable",
]);
