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
  type CircuitContext,
  QueryContext,
  sampleContractAddress,
  convertFieldToBytes,
  createConstructorContext,
  CostModel,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
} from "../managed/notetaker/contract/index.js";
import { type NotetakerPrivateState, witnesses } from "../witnesses.js";

/**
 * Serves as a testbed to exercise the notetaker contract in unit tests.
 */
export class NotetakerSimulator {
  readonly contract: Contract<NotetakerPrivateState>;
  circuitContext: CircuitContext<NotetakerPrivateState>;

  constructor(secretKey: Uint8Array) {
    this.contract = new Contract<NotetakerPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      createConstructorContext({ secretKey }, "0".repeat(64)),
    );
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
  }

  /** Switch to a different secret key to simulate a different user. */
  public switchUser(secretKey: Uint8Array) {
    this.circuitContext.currentPrivateState = { secretKey };
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): NotetakerPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public writeNote(title: string): Ledger {
    this.circuitContext = this.contract.impureCircuits.writeNote(
      this.circuitContext,
      title,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public updateNote(newTitle: string): Ledger {
    this.circuitContext = this.contract.impureCircuits.updateNote(
      this.circuitContext,
      newTitle,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public deleteNote(): Ledger {
    this.circuitContext = this.contract.impureCircuits.deleteNote(
      this.circuitContext,
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  /** Derive the current user's public key hash based on current sequence. */
  public noteKey(): Uint8Array {
    const seq = convertFieldToBytes(
      32,
      this.getLedger().sequence,
      "notetaker-simulator.ts",
    );
    return this.contract.circuits.noteKey(
      this.circuitContext,
      this.getPrivateState().secretKey,
      seq,
    ).result;
  }
}
