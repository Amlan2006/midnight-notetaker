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

import {
  NotetakerAPI,
  type NotetakerCircuitKeys,
  type NotetakerProviders,
  type DeployedNotetakerAPI,
} from '../../../api/src/index';
import { type ContractAddress, fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  BehaviorSubject,
  catchError,
  concatMap,
  filter,
  firstValueFrom,
  interval,
  map,
  type Observable,
  take,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import { pipe as fnPipe } from 'fp-ts/function';
import { type Logger } from 'pino';
import { ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import semver from 'semver';
import {
  Binding,
  FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { NotetakerPrivateState } from '@midnight-ntwrk/notetaker-contract';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider';
import { NetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';

/**
 * An in-progress notetaker deployment.
 */
export interface InProgressNoteDeployment {
  readonly status: 'in-progress';
}

/**
 * A deployed notetaker deployment.
 */
export interface DeployedNoteDeployment {
  readonly status: 'deployed';
  readonly api: DeployedNotetakerAPI;
}

/**
 * A failed notetaker deployment.
 */
export interface FailedNoteDeployment {
  readonly status: 'failed';
  readonly error: Error;
}

/**
 * A notetaker deployment state.
 */
export type NoteDeployment = InProgressNoteDeployment | DeployedNoteDeployment | FailedNoteDeployment;

/**
 * Provides access to notetaker deployments.
 */
export interface DeployedNoteAPIProvider {
  readonly noteDeployments$: Observable<Array<Observable<NoteDeployment>>>;
  readonly resolve: (contractAddress?: ContractAddress) => Observable<NoteDeployment>;
}

/**
 * A {@link DeployedNoteAPIProvider} that manages notetaker deployments in a browser setting.
 */
export class BrowserDeployedNoteManager implements DeployedNoteAPIProvider {
  readonly #noteDeploymentsSubject: BehaviorSubject<Array<BehaviorSubject<NoteDeployment>>>;
  #initializedProviders: Promise<NotetakerProviders> | undefined;

  constructor(private readonly logger: Logger) {
    this.#noteDeploymentsSubject = new BehaviorSubject<Array<BehaviorSubject<NoteDeployment>>>([]);
    this.noteDeployments$ = this.#noteDeploymentsSubject;
  }

  readonly noteDeployments$: Observable<Array<Observable<NoteDeployment>>>;

  resolve(contractAddress?: ContractAddress): Observable<NoteDeployment> {
    const deployments = this.#noteDeploymentsSubject.value;
    let deployment = deployments.find(
      (d) => d.value.status === 'deployed' && d.value.api.deployedContractAddress === contractAddress,
    );

    if (deployment) {
      return deployment;
    }

    deployment = new BehaviorSubject<NoteDeployment>({ status: 'in-progress' });

    if (contractAddress) {
      void this.joinDeployment(deployment, contractAddress);
    } else {
      void this.deployDeployment(deployment);
    }

    this.#noteDeploymentsSubject.next([...deployments, deployment]);
    return deployment;
  }

  private getProviders(): Promise<NotetakerProviders> {
    return this.#initializedProviders ?? (this.#initializedProviders = initializeProviders(this.logger));
  }

  private async deployDeployment(deployment: BehaviorSubject<NoteDeployment>): Promise<void> {
    try {
      const providers = await this.getProviders();
      const api = await NotetakerAPI.deploy(providers, this.logger);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      deployment.next({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  private async joinDeployment(
    deployment: BehaviorSubject<NoteDeployment>,
    contractAddress: ContractAddress,
  ): Promise<void> {
    try {
      const providers = await this.getProviders();
      const api = await NotetakerAPI.join(providers, contractAddress, this.logger);
      deployment.next({ status: 'deployed', api });
    } catch (error: unknown) {
      deployment.next({ status: 'failed', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
}

/** @internal */
const initializeProviders = async (logger: Logger): Promise<NotetakerProviders> => {
  const networkId = import.meta.env.VITE_NETWORK_ID as NetworkId;
  const connectedAPI = await connectToWallet(logger, networkId);
  const zkConfigPath = window.location.origin;
  const keyMaterialProvider = new FetchZkConfigProvider<NotetakerCircuitKeys>(zkConfigPath, fetch.bind(window));
  const config = await connectedAPI.getConfiguration();
  const inMemoryNotetakerPrivateStateProvider = inMemoryPrivateStateProvider<string, NotetakerPrivateState>();
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();
  return {
    privateStateProvider: inMemoryNotetakerPrivateStateProvider,
    zkConfigProvider: keyMaterialProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri!, keyMaterialProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey(): string {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey(): string {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      balanceTx: async (tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction> => {
        try {
          logger.info({ tx, ttl }, 'Balancing transaction via wallet');
          const serializedTx = toHex(tx.serialize());
          const received = await connectedAPI.balanceUnsealedTransaction(serializedTx);
          return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
            'signature',
            'proof',
            'binding',
            fromHex(received.tx),
          );
        } catch (e) {
          logger.error({ error: e }, 'Error balancing transaction via wallet');
          throw e;
        }
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        const txIdentifiers = tx.identifiers();
        const txId = txIdentifiers[0];
        logger.info({ txIdentifiers }, 'Submitted transaction via wallet');
        return txId;
      },
    },
  };
};

/** @internal */
const getFirstCompatibleWallet = (): InitialAPI | undefined => {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
};

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

/** @internal */
const connectToWallet = (logger: Logger, networkId: string): Promise<ConnectedAPI> => {
  return firstValueFrom(
    fnPipe(
      interval(100),
      map(() => getFirstCompatibleWallet()),
      tap((connectorAPI) => {
        logger.info(connectorAPI, 'Check for wallet connector API');
      }),
      filter((connectorAPI): connectorAPI is InitialAPI => !!connectorAPI),
      tap((connectorAPI) => {
        logger.info(connectorAPI, 'Compatible wallet connector API found. Connecting.');
      }),
      take(1),
      timeout({
        first: 1_000,
        with: () =>
          throwError(() => {
            logger.error('Could not find wallet connector API');
            return new Error('Could not find Midnight Lace wallet. Extension installed?');
          }),
      }),
      concatMap(async (initialAPI) => {
        const connectedAPI = await initialAPI.connect(networkId);
        const connectionStatus = await connectedAPI.getConnectionStatus();
        logger.info(connectionStatus, 'Wallet connector API enabled status');
        return connectedAPI;
      }),
      timeout({
        first: 5_000,
        with: () =>
          throwError(() => {
            logger.error('Wallet connector API has failed to respond');
            return new Error('Midnight Lace wallet has failed to respond. Extension enabled?');
          }),
      }),
      catchError((error, apis) =>
        error
          ? throwError(() => {
              logger.error('Unable to enable connector API' + error);
              return new Error('Application is not authorized');
            })
          : apis,
      ),
    ),
  );
};
