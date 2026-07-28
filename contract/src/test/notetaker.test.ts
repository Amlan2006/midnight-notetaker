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

import { NotetakerSimulator } from "./notetaker-simulator.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { randomBytes } from "./utils.js";
import { NoteStatus } from "../managed/notetaker/contract/index.js";

setNetworkId("undeployed");

describe("Notetaker smart contract", () => {
  it("generates initial ledger state deterministically", () => {
    const key = randomBytes(32);
    const sim0 = new NotetakerSimulator(key);
    const sim1 = new NotetakerSimulator(key);
    expect(sim0.getLedger()).toEqual(sim1.getLedger());
  });

  it("properly initializes ledger state and private state", () => {
    const key = randomBytes(32);
    const sim = new NotetakerSimulator(key);
    const ledgerState = sim.getLedger();
    expect(ledgerState.sequence).toEqual(1n);
    expect(ledgerState.title.is_some).toEqual(false);
    expect(ledgerState.title.value).toEqual("");
    expect(ledgerState.owner).toEqual(new Uint8Array(32));
    expect(ledgerState.status).toEqual(NoteStatus.EMPTY);
    expect(sim.getPrivateState()).toEqual({ secretKey: key });
  });

  it("lets you write a note", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    const initialPrivateState = sim.getPrivateState();
    const title = "My first private note";
    sim.writeNote(title);
    // private state should not change
    expect(initialPrivateState).toEqual(sim.getPrivateState());
    const ls = sim.getLedger();
    expect(ls.sequence).toEqual(1n);
    expect(ls.title.is_some).toEqual(true);
    expect(ls.title.value).toEqual(title);
    expect(ls.owner).toEqual(sim.noteKey());
    expect(ls.status).toEqual(NoteStatus.WRITTEN);
  });

  it("lets you update a note title", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("Original title");
    sim.updateNote("Updated title");
    const ls = sim.getLedger();
    expect(ls.title.is_some).toEqual(true);
    expect(ls.title.value).toEqual("Updated title");
    expect(ls.status).toEqual(NoteStatus.WRITTEN);
    // sequence should not change on update
    expect(ls.sequence).toEqual(1n);
  });

  it("lets you delete a note", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    const initialKey = sim.noteKey();
    sim.writeNote("To be deleted");
    sim.deleteNote();
    const ls = sim.getLedger();
    expect(ls.sequence).toEqual(2n);
    expect(ls.title.is_some).toEqual(false);
    // owner is not reset on delete (same as original bboard behavior)
    expect(ls.owner).toEqual(initialKey);
    expect(ls.status).toEqual(NoteStatus.EMPTY);
  });

  it("lets you write another note after deleting the first", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("First note");
    sim.deleteNote();
    sim.writeNote("Second note");
    const ls = sim.getLedger();
    expect(ls.sequence).toEqual(2n);
    expect(ls.title.is_some).toEqual(true);
    expect(ls.title.value).toEqual("Second note");
    expect(ls.status).toEqual(NoteStatus.WRITTEN);
  });

  it("lets a different user write after the first deletes", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("User1 note");
    sim.deleteNote();
    sim.switchUser(randomBytes(32));
    sim.writeNote("User2 note");
    const ls = sim.getLedger();
    expect(ls.title.value).toEqual("User2 note");
    expect(ls.owner).toEqual(sim.noteKey());
    expect(ls.status).toEqual(NoteStatus.WRITTEN);
  });

  it("doesn't let the same user write twice", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("First note");
    expect(() => sim.writeNote("Second note")).toThrow("Note slot is already occupied");
  });

  it("doesn't let a different user write to an occupied slot", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("Occupied");
    sim.switchUser(randomBytes(32));
    expect(() => sim.writeNote("Intruder note")).toThrow("Note slot is already occupied");
  });

  it("doesn't let a non-owner update a note", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("Original");
    sim.switchUser(randomBytes(32));
    expect(() => sim.updateNote("Hijacked")).toThrow("Not the note owner");
  });

  it("doesn't let a non-owner delete a note", () => {
    const sim = new NotetakerSimulator(randomBytes(32));
    sim.writeNote("Private note");
    sim.switchUser(randomBytes(32));
    expect(() => sim.deleteNote()).toThrow("Not the note owner");
  });
});
