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

import React, { type PropsWithChildren, createContext } from 'react';
import { type DeployedNoteAPIProvider, BrowserDeployedNoteManager } from './BrowserDeployedNoteManager';
import { type Logger } from 'pino';

/**
 * Encapsulates a deployed notes provider as a context object.
 */
export const DeployedNoteContext = createContext<DeployedNoteAPIProvider | undefined>(undefined);

/**
 * The props required by the {@link DeployedNoteProvider} component.
 */
export type DeployedNoteProviderProps = PropsWithChildren<{
  logger: Logger;
}>;

/**
 * A React component that sets a new {@link BrowserDeployedNoteManager} object as the currently
 * in-scope deployed note provider.
 */
export const DeployedNoteProvider: React.FC<Readonly<DeployedNoteProviderProps>> = ({ logger, children }) => (
  <DeployedNoteContext.Provider value={new BrowserDeployedNoteManager(logger)}>
    {children}
  </DeployedNoteContext.Provider>
);
