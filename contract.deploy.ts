import {
  beginCell,
  contractAddress,
  toNano,
  TonClient4,
  WalletContractV4,
  internal,
  fromNano,
} from "@ton/ton";
import { mnemonicToPrivateKey } from "ton-crypto";
import { buildOnchainMetadata } from "./helpers";
import {
  SampleJetton,
  storeMint,
} from "./sources/output/SampleJetton_SampleJetton";
import { Address } from "@ton/ton";
import * as dotenv from "dotenv";
dotenv.config();

import { getHttpV4Endpoint } from "@orbs-network/ton-access";

// setting jetton & deployment params
const MAX_SUPPLY = 100000000000;
const PREMINT_HOLDER = "0QDjWRYSZ3tp7kiB0-euniJlH_9jsTR7WYPwKjCEdT48GgCX";
const jettonParams = {
  name: "HarryJetton",
  description: "This is a test from my own project.",
  symbol: "HRJ",
  image: "https://www.amazix.com/wp-content/uploads/2024/05/ton_symbol.png",
};

(async () => {
  const endpoint = await getHttpV4Endpoint({
    network: "testnet",
  });

  //create client
  const client4 = new TonClient4({
    endpoint: endpoint,
  });

  let mnemonics = (process.env.mnemonics || "").toString();
  if (mnemonics.length == 0) {
    console.log("Please set mnemonics in .env file");
    process.exit();
  }

  let keyPair = await mnemonicToPrivateKey(mnemonics.split(" "));
  let secretKey = keyPair.secretKey;

  let workchain = 0; //we are working in basechain.
  let deployer_wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  });
  console.log(deployer_wallet.address, "-------------------------");

  let deployer_wallet_contract = client4.open(deployer_wallet);

  // Create content Cell
  let content = buildOnchainMetadata(jettonParams);
  let max_supply = toNano(MAX_SUPPLY);

  // Compute init data for deployment
  // NOTICE: the parameters inside the init functions were the input for the contract address
  // which means any changes will change the smart contract address as well
  let init = await SampleJetton.init(
    deployer_wallet_contract.address,
    content,
    max_supply
  );
  let jettonMaster = contractAddress(workchain, init);
  let deployAmount = toNano("0.15");

  let supply = toNano(1000000000); // pre-mint amount
  let packed_msg = beginCell()
    .store(
      storeMint({
        $$type: "Mint",
        amount: supply,
        receiver: Address.parse(PREMINT_HOLDER), // send pre-minted jetton to another address
      })
    )
    .endCell();

  // send a message on new address contract to deploy it
  let seqno: number = await deployer_wallet_contract.getSeqno();
  console.log(
    "🛠️Preparing new outgoing massage from deployment wallet. \n" +
      deployer_wallet_contract.address
  );

  // Get deployment wallet balance
  let balance: bigint = await deployer_wallet_contract.getBalance();

  console.log(
    "Current deployment wallet balance = ",
    fromNano(balance).toString(),
    "💎TON"
  );
  console.log("Minting:", fromNano(supply));

  await deployer_wallet_contract.sendTransfer({
    seqno,
    secretKey,
    messages: [
      internal({
        to: jettonMaster,
        value: deployAmount,
        init: {
          code: init.code,
          data: init.data,
        },
        body: packed_msg,
      }),
    ],
  });
  console.log("====== Deployment message sent =======\n");
  console.log("Jetton master address:", jettonMaster);
})();
