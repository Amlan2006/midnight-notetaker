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

import React from 'react';
import { AppBar, Box, Typography } from '@mui/material';
import NoteIcon from '@mui/icons-material/StickyNote2Outlined';

/**
 * Application-level header for the Notetaker DApp.
 */
export const Header: React.FC = () => (
  <AppBar
    position="static"
    data-testid="header"
    sx={{
      backgroundColor: '#000',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid rgba(120,80,255,0.25)',
    }}
  >
    <Box
      sx={{
        display: 'flex',
        px: 4,
        py: 2,
        alignItems: 'center',
        gap: 2,
      }}
      data-testid="header-logo"
    >
      <img src="/midnight-logo.png" alt="Midnight logo" height={48} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
        <NoteIcon sx={{ color: '#7c3aed', fontSize: 28 }} />
        <Typography
          variant="h6"
          sx={{
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '1rem',
          }}
        >
          Notetaker
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(120,80,255,0.8)',
            ml: 1,
            fontSize: '0.65rem',
            letterSpacing: '0.12em',
          }}
        >
          Private Notes on Midnight
        </Typography>
      </Box>
    </Box>
  </AppBar>
);
