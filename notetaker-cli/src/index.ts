// This file is part of midnightntwrk/notetaker.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/*
 * This file is the main driver for the Midnight Notetaker example.
 * The entry point is the run function, at the end of the file.
 * We expect the startup files (preprod.ts, standalone.ts, etc.) to
 * call run with some specific configuration that sets the network addresses
 * of the servers this file relies on.
 */

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { WebSocket } from 'ws';
import {
  NotetakerAPI,
  type NotetakerDerivedState,
  notetakerPrivateStateKey,
  type NotetakerProviders,
  type DeployedNotetakerContract,
  type PrivateStateId,
} from '../../api/src/index';
import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ledger, type Ledger, NoteStatus } from '../../contract/src/managed/notetaker/contract/index.js';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type Logger } from 'pino';
import { type Config, StandaloneConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { TestEnvironment } from '@midnight-ntwrk/testkit-js';
import { MidnightWalletProvider } from './midnight-wallet-provider';
import { randomBytes } from '../../api/src/utils';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils';
import { generateDust } from './generate-dust';
import { NotetakerPrivateState } from '../../contract/src/witnesses.js';

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

/* **********************************************************************
 * getNotetakerLedgerState: a helper that queries the current state of
 * the data on the ledger, for a specific notetaker contract.
 */

export const getNotetakerLedgerState = async (
  providers: NotetakerProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  return contractState != null ? ledger(contractState.data) : null;
};

/* **********************************************************************
 * deployOrJoin: returns a contract, by prompting the user about
 * whether to deploy a new one or join an existing one and then
 * calling the appropriate helper.
 */

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new notetaker contract
  2. Join an existing notetaker contract
  3. Exit
Which would you like to do? `;

const deployOrJoin = async (providers: NotetakerProviders, rli: Interface, logger: Logger): Promise<NotetakerAPI | null> => {
  let api: NotetakerAPI | null = null;

  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        api = await NotetakerAPI.deploy(providers, logger);
        logger.info(`Deployed contract at address: ${api.deployedContractAddress}`);
        return api;
      case '2':
        api = await NotetakerAPI.join(providers, await rli.question('What is the contract address (in hex)? '), logger);
        logger.info(`Joined contract at address: ${api.deployedContractAddress}`);
        return api;
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * displayLedgerState: shows the values of each of the fields declared
 * by the contract to be in the ledger state of the notetaker.
 */

const displayLedgerState = async (
  providers: NotetakerProviders,
  deployedNotetakerContract: DeployedNotetakerContract,
  logger: Logger,
): Promise<void> => {
  const contractAddress = deployedNotetakerContract.deployTxData.public.contractAddress;
  const ledgerState = await getNotetakerLedgerState(providers, contractAddress);
  if (ledgerState === null) {
    logger.info(`There is no notetaker contract deployed at ${contractAddress}`);
  } else {
    const slotStatus = ledgerState.status === NoteStatus.WRITTEN ? 'written' : 'empty';
    const currentTitle = !ledgerState.title.is_some ? 'none' : ledgerState.title.value;
    logger.info(`Current status is: '${slotStatus}'`);
    logger.info(`Current title is: '${currentTitle}'`);
    logger.info(`Current sequence is: ${ledgerState.sequence}`);
    logger.info(`Current owner is: '${toHex(ledgerState.owner)}'`);
  }
};

/* **********************************************************************
 * displayPrivateState: shows the hex-formatted value of the secret key.
 */

const displayPrivateState = async (providers: NotetakerProviders, logger: Logger): Promise<void> => {
  const privateState = await providers.privateStateProvider.get(notetakerPrivateStateKey);
  if (privateState === null) {
    logger.info(`There is no existing notetaker private state`);
  } else {
    logger.info(`Current secret key is: ${toHex(privateState.secretKey)}`);
  }
};

/* **********************************************************************
 * displayDerivedState: shows the values of derived state which is made
 * by combining the ledger state with private state. The derived state
 * compares the owner's key with the private secret key to determine if
 * the current user is the owner of the current note.
 */

const displayDerivedState = (state: NotetakerDerivedState | undefined, logger: Logger) => {
  if (state === undefined) {
    logger.info(`No notetaker state currently available`);
  } else {
    const slotStatus = state.status === NoteStatus.WRITTEN ? 'written' : 'empty';
    const currentTitle = state.status === NoteStatus.WRITTEN ? state.title : 'none';
    logger.info(`Current status is: '${slotStatus}'`);
    logger.info(`Current title is: '${currentTitle}'`);
    logger.info(`Current sequence is: ${state.sequence}`);
    logger.info(`Current owner is: '${state.isOwner ? 'you' : 'not you'}'`);
  }
};

/* **********************************************************************
 * mainLoop: the main interactive menu of the notetaker CLI.
 */

const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Write a new note (title only — body stays private off-chain)
  2. Update your note title
  3. Delete your note
  4. Display the current ledger state (known by everyone)
  5. Display the current private state (known only to this DApp instance)
  6. Display the current derived state (known only to this DApp instance)
  7. Exit
Which would you like to do? `;

const mainLoop = async (providers: NotetakerProviders, rli: Interface, logger: Logger): Promise<void> => {
  const notetakerApi = await deployOrJoin(providers, rli, logger);
  if (notetakerApi === null) {
    return;
  }
  let currentState: NotetakerDerivedState | undefined;
  const stateObserver = {
    next: (state: NotetakerDerivedState) => (currentState = state),
  };
  const subscription = notetakerApi.state$.subscribe(stateObserver);
  try {
    while (true) {
      const choice = await rli.question(MAIN_LOOP_QUESTION);
      try {
        switch (choice) {
          case '1': {
            const title = await rli.question(`What title do you want for the note? `);
            await notetakerApi.writeNote(title);
            break;
          }
          case '2': {
            const newTitle = await rli.question(`What new title do you want? `);
            await notetakerApi.updateNote(newTitle);
            break;
          }
          case '3':
            await notetakerApi.deleteNote();
            break;
          case '4':
            await displayLedgerState(providers, notetakerApi.deployedContract, logger);
            break;
          case '5':
            await displayPrivateState(providers, logger);
            break;
          case '6':
            displayDerivedState(currentState, logger);
            break;
          case '7':
            logger.info('Exiting...');
            return;
          default:
            logger.error(`Invalid choice: ${choice}`);
        }
      } catch (e) {
        logError(logger, e);
        logger.info('Returning to main menu...');
      }
    }
  } finally {
    subscription.unsubscribe();
  }
};

/* ***********************************************************************
 * This seed gives access to tokens minted in the genesis block of a local development node.
 */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

/* **********************************************************************
 * buildWallet: unless running in standalone mode, prompt the user to
 * tell us whether to create a new wallet or recreate one from a prior seed.
 */

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<string | undefined> => {
  if (config instanceof StandaloneConfig) {
    return GENESIS_MINT_WALLET_SEED;
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return toHex(randomBytes(32));
      case '2':
        return await rli.question('Enter your wallet seed: ');
      case '3':
        logger.info('Exiting...');
        return undefined;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * run: the main entry point that starts the whole notetaker CLI.
 */

export const run = async (config: Config, testEnv: TestEnvironment, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];
  try {
    const envConfiguration = await testEnv.start();
    logger.info(`Environment started with configuration: ${JSON.stringify(envConfiguration)}`);
    const seed = await buildWallet(config, rli, logger);
    if (seed === undefined) {
      return;
    }
    const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
    providersToBeStopped.push(walletProvider);
    const walletFacade: WalletFacade = walletProvider.wallet;

    await walletProvider.start();

    const unshieldedState = await waitForUnshieldedFunds(logger, walletFacade, envConfiguration, unshieldedToken());
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      logger.info('No funds received, exiting...');
      return;
    }
    logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

    if (config.generateDust) {
      const dustGeneration = await generateDust(logger, seed, unshieldedState, walletFacade);
      if (dustGeneration) {
        logger.info(`Submitted dust generation registration transaction: ${dustGeneration}`);
        await syncWallet(logger, walletFacade);
      }
    }

    const zkConfigProvider = new NodeZkConfigProvider<'writeNote' | 'updateNote' | 'deleteNote'>(config.zkConfigPath);
    const providers: NotetakerProviders = {
      privateStateProvider: levelPrivateStateProvider<PrivateStateId, NotetakerPrivateState>({
        privateStateStoreName: config.privateStateStoreName,
        signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
        privateStoragePasswordProvider: () => {
          return 'Notetaker-Test-2026!';
        },
        accountId: seed,
      }),
      publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
      zkConfigProvider: zkConfigProvider,
      proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
      walletProvider: walletProvider,
      midnightProvider: walletProvider,
    };
    await mainLoop(providers, rli, logger);
  } catch (e) {
    logError(logger, e);
    logger.info('Exiting...');
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logError(logger, e);
    } finally {
      try {
        for (const wallet of providersToBeStopped) {
          logger.info('Stopping wallet...');
          await wallet.stop();
        }
        if (testEnv) {
          logger.info('Stopping test environment...');
          await testEnv.shutdown();
        }
      } catch (e) {
        logError(logger, e);
      }
    }
  }
};

function logError(logger: Logger, e: unknown) {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error(`Found error (unknown type)`);
  }
}
