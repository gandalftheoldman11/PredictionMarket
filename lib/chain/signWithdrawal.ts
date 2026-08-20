"use client";

import { encodeFunctionData } from "viem";
import { userProxyAbi } from "./abi";
import { FORWARD_REQUEST_TYPES } from "./forwarder";

export type WithdrawalParams = {
  chainId: number;
  forwarder: `0x${string}`;
  proxy: `0x${string}`;
  signer: `0x${string}`;
  usdc: `0x${string}`;
  nonce: string;
  deadline: string;
};

export async function signWithdrawalWithMagic(input: {
  params: WithdrawalParams;
  destination: `0x${string}`;
  amountMicros: string;
}) {
  const request = {
    from: input.params.signer,
    to: input.params.proxy,
    value: "0",
    gas: "300000",
    nonce: input.params.nonce,
    deadline: input.params.deadline,
    data: encodeFunctionData({
      abi: userProxyAbi,
      functionName: "withdrawToken",
      args: [input.params.usdc, input.destination, BigInt(input.amountMicros)],
    }),
  };
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ForwardRequest: FORWARD_REQUEST_TYPES.ForwardRequest,
    },
    domain: {
      name: "TRADEWAR Forwarder",
      version: "1",
      chainId: input.params.chainId,
      verifyingContract: input.params.forwarder,
    },
    primaryType: "ForwardRequest",
    message: request,
  };
  const localKey = process.env.NEXT_PUBLIC_LOCAL_E2E_PRIVATE_KEY;
  let signature: unknown;
  if (input.params.chainId === 31337 && localKey) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(localKey as `0x${string}`);
    if (account.address.toLowerCase() !== input.params.signer.toLowerCase()) {
      throw new Error("Local E2E signer does not match the signed-in wallet");
    }
    signature = await account.signTypedData({
      domain: typedData.domain,
      types: FORWARD_REQUEST_TYPES,
      primaryType: "ForwardRequest",
      message: {
        ...request,
        value: BigInt(request.value),
        gas: BigInt(request.gas),
        nonce: BigInt(request.nonce),
        deadline: Number(request.deadline),
      },
    });
  } else {
    const { Magic } = await import("magic-sdk");
    const magic = new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY!);
    signature = await magic.rpcProvider.request({
      method: "eth_signTypedData_v4",
      params: [input.params.signer, JSON.stringify(typedData)],
    });
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Wallet did not return a valid withdrawal signature");
  }
  return { request, signature: signature as `0x${string}` };
}
