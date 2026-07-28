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

import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { MainLayout, Note } from './components';
import { useDeployedNoteContext } from './hooks';
import { type NoteDeployment } from './contexts';
import { type Observable } from 'rxjs';

/**
 * The root notetaker application component.
 *
 * @remarks
 * The {@link App} component requires a `<DeployedNoteProvider />` parent in order to retrieve
 * information about current notetaker deployments.
 *
 * @internal
 */
const App: React.FC = () => {
  const noteApiProvider = useDeployedNoteContext();
  const [noteDeployments, setNoteDeployments] = useState<Array<Observable<NoteDeployment>>>([]);

  useEffect(() => {
    const subscription = noteApiProvider.noteDeployments$.subscribe(setNoteDeployments);
    return () => subscription.unsubscribe();
  }, [noteApiProvider]);

  return (
    <Box sx={{ background: '#000', minHeight: '100vh' }}>
      <MainLayout>
        {noteDeployments.map((noteDeployment, idx) => (
          <div data-testid={`note-${idx}`} key={`note-${idx}`}>
            <Note noteDeployment$={noteDeployment} />
          </div>
        ))}
        <div data-testid="note-start">
          <Note />
        </div>
      </MainLayout>
    </Box>
  );
};

export default App;
