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
 * Notetaker common types and abstractions.
 *
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { NoteStatus, NotetakerPrivateState, Contract, Witnesses } from '../../contract/src/index';

export const notetakerPrivateStateKey = 'notetakerPrivateState';
export type PrivateStateId = typeof notetakerPrivateStateKey;

/**
 * The private states consumed throughout the application.
 *
 * @remarks
 * {@link PrivateStates} can be thought of as a type that describes a schema for all
 * private states for all contracts used in the application. Each key represents
 * the type of private state consumed by a particular type of contract.
 *
 * @public
 */
export type PrivateStates = {
  /**
   * Key used to provide the private state for {@link NotetakerContract} deployments.
   */
  readonly notetakerPrivateState: NotetakerPrivateState;
};

/**
 * Represents a notetaker contract and its private state.
 *
 * @public
 */
export type NotetakerContract = Contract<NotetakerPrivateState, Witnesses<NotetakerPrivateState>>;

/**
 * The keys of the circuits exported from {@link NotetakerContract}.
 *
 * @public
 */
export type NotetakerCircuitKeys = Exclude<keyof NotetakerContract['impureCircuits'], number | symbol>;

/**
 * The providers required by {@link NotetakerContract}.
 *
 * @public
 */
export type NotetakerProviders = MidnightProviders<NotetakerCircuitKeys, PrivateStateId, NotetakerPrivateState>;

/**
 * A {@link NotetakerContract} that has been deployed to the network.
 *
 * @public
 */
export type DeployedNotetakerContract = FoundContract<NotetakerContract>;

/**
 * A type that represents the derived combination of public (or ledger), and private state.
 *
 * @public
 */
export type NotetakerDerivedState = {
  /** Whether the note slot is currently occupied. */
  readonly status: NoteStatus;
  /** Monotonically-increasing sequence counter (public). */
  readonly sequence: bigint;
  /** The note title stored on-chain (public). */
  readonly title: string | undefined;
  /**
   * A readonly flag that determines if the current note was written by the current user.
   *
   * @remarks
   * The `owner` property of the public (or ledger) state is the public key hash of the note owner,
   * while the `secretKey` property of {@link NotetakerPrivateState} is the secret key of the
   * current user. If `owner` corresponds to the public key hash derived from `secretKey`,
   * then `isOwner` is `true`.
   */
  readonly isOwner: boolean;
};
