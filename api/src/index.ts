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

/**
 * Provides types and utilities for working with notetaker contracts.
 *
 * @packageDocumentation
 */

import * as Notetaker from '../../contract/src/managed/notetaker/contract/index.js';

import { type ContractAddress, convertFieldToBytes } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import {
  type NotetakerDerivedState,
  type NotetakerContract,
  type NotetakerProviders,
  type DeployedNotetakerContract,
  notetakerPrivateStateKey,
} from './common-types.js';
import { CompiledNotetakerContractContract } from '../../contract/src/index';
import * as utils from './utils/index.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { combineLatest, map, tap, from, type Observable } from 'rxjs';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { NotetakerPrivateState, createNotetakerPrivateState } from '../../contract/src/witnesses.js';

/** @internal */

/**
 * An API for a deployed notetaker.
 */
export interface DeployedNotetakerAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<NotetakerDerivedState>;

  writeNote: (title: string) => Promise<void>;
  updateNote: (newTitle: string) => Promise<void>;
  deleteNote: () => Promise<void>;
}

/**
 * Provides an implementation of {@link DeployedNotetakerAPI} by adapting a deployed notetaker contract.
 *
 * @remarks
 * The `NotetakerPrivateState` is managed at the DApp level by a private state provider. As such,
 * this private state is shared between all instances of {@link NotetakerAPI}, and their underlying
 * deployed contracts. The private state defines a `'secretKey'` property that effectively identifies
 * the current user, and is used to determine if the current user is the owner of the note as the
 * observable contract state changes.
 */
export class NotetakerAPI implements DeployedNotetakerAPI {
  /** @internal */
  private constructor(
    public readonly deployedContract: DeployedNotetakerContract,
    providers: NotetakerProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);
    this.state$ = combineLatest(
      [
        // Combine public (ledger) state with...
        providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
          map((contractState) => Notetaker.ledger(contractState.data)),
          tap((ledgerState) =>
            logger?.trace({
              ledgerStateChanged: {
                ledgerState: {
                  ...ledgerState,
                  status: ledgerState.status === Notetaker.NoteStatus.WRITTEN ? 'written' : 'empty',
                  owner: toHex(ledgerState.owner),
                },
              },
            }),
          ),
        ),
        // ...private state...
        from(providers.privateStateProvider.get(notetakerPrivateStateKey) as Promise<NotetakerPrivateState>),
      ],
      // ...and combine them to produce the required derived state.
      (ledgerState, privateState) => {
        const hashedSecretKey = Notetaker.pureCircuits.noteKey(
          privateState.secretKey,
          convertFieldToBytes(32, ledgerState.sequence, 'api/src/index.ts'),
        );

        return {
          status: ledgerState.status,
          title: ledgerState.title.is_some ? ledgerState.title.value : undefined,
          sequence: ledgerState.sequence,
          isOwner: toHex(ledgerState.owner) === toHex(hashedSecretKey),
        };
      },
    );
  }

  /**
   * Gets the address of the current deployed contract.
   */
  readonly deployedContractAddress: ContractAddress;

  /**
   * Gets an observable stream of state changes based on the current public (ledger),
   * and private state data.
   */
  readonly state$: Observable<NotetakerDerivedState>;

  /**
   * Attempts to write a new note to the notetaker slot.
   *
   * @param title The note title to record on-chain.
   *
   * @remarks
   * This method can fail during local circuit execution if the slot is currently occupied.
   */
  async writeNote(title: string): Promise<void> {
    this.logger?.info(`writingNote: ${title}`);

    const txData = await this.deployedContract.callTx.writeNote(title);

    this.logger?.trace({
      transactionAdded: {
        circuit: 'writeNote',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Attempts to update the title of the current note.
   *
   * @param newTitle The new title to record on-chain.
   *
   * @remarks
   * This method can fail during local circuit execution if the slot is vacant,
   * or if the current note is not owned by this user.
   */
  async updateNote(newTitle: string): Promise<void> {
    this.logger?.info(`updatingNote: ${newTitle}`);

    const txData = await this.deployedContract.callTx.updateNote(newTitle);

    this.logger?.trace({
      transactionAdded: {
        circuit: 'updateNote',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Attempts to delete the current note.
   *
   * @remarks
   * This method can fail during local circuit execution if the slot is vacant,
   * or if the current note is not owned by this user.
   */
  async deleteNote(): Promise<void> {
    this.logger?.info('deletingNote');

    const txData = await this.deployedContract.callTx.deleteNote();

    this.logger?.trace({
      transactionAdded: {
        circuit: 'deleteNote',
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Deploys a new notetaker contract to the network.
   *
   * @param providers The notetaker providers.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link NotetakerAPI} instance that manages the
   * newly deployed {@link DeployedNotetakerContract}; or rejects with a deployment error.
   */
  static async deploy(providers: NotetakerProviders, logger?: Logger): Promise<NotetakerAPI> {
    logger?.info('deployContract');

    const deployedNotetakerContract = await deployContract(providers, {
      compiledContract: CompiledNotetakerContractContract,
      privateStateId: notetakerPrivateStateKey,
      initialPrivateState: createNotetakerPrivateState(utils.randomBytes(32)),
    });

    logger?.trace({
      contractDeployed: {
        finalizedDeployTxData: deployedNotetakerContract.deployTxData.public,
      },
    });

    return new NotetakerAPI(deployedNotetakerContract, providers, logger);
  }

  /**
   * Finds an already deployed notetaker contract on the network, and joins it.
   *
   * @param providers The notetaker providers.
   * @param contractAddress The contract address of the deployed notetaker contract to search for and join.
   * @param logger An optional 'pino' logger to use for logging.
   * @returns A `Promise` that resolves with a {@link NotetakerAPI} instance that manages the joined
   * {@link DeployedNotetakerContract}; or rejects with an error.
   */
  static async join(providers: NotetakerProviders, contractAddress: ContractAddress, logger?: Logger): Promise<NotetakerAPI> {
    logger?.info({
      joinContract: {
        contractAddress,
      },
    });

    const deployedNotetakerContract = await findDeployedContract<NotetakerContract>(providers, {
      contractAddress,
      compiledContract: CompiledNotetakerContractContract,
      privateStateId: notetakerPrivateStateKey,
      initialPrivateState: await NotetakerAPI.getPrivateState(providers, contractAddress),
    });

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedNotetakerContract.deployTxData.public,
      },
    });

    return new NotetakerAPI(deployedNotetakerContract, providers, logger);
  }

  private static async getPrivateState(
    providers: NotetakerProviders,
    contractAddress: ContractAddress,
  ): Promise<NotetakerPrivateState> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existingPrivateState = await providers.privateStateProvider.get(notetakerPrivateStateKey);
    return existingPrivateState ?? createNotetakerPrivateState(utils.randomBytes(32));
  }
}

/**
 * A namespace that represents the exports from the `'utils'` sub-package.
 *
 * @public
 */
export * as utils from './utils/index.js';

export * from './common-types.js';
