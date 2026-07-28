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

import React, { useCallback, useEffect, useState } from 'react';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Backdrop,
  CircularProgress,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  Skeleton,
  Typography,
  TextField,
  Tooltip,
  Chip,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import WriteIcon from '@mui/icons-material/EditNoteOutlined';
import EditIcon from '@mui/icons-material/DriveFileRenameOutlineOutlined';
import CopyIcon from '@mui/icons-material/ContentPasteOutlined';
import StopIcon from '@mui/icons-material/HighlightOffOutlined';
import NoteAddIcon from '@mui/icons-material/NoteAddOutlined';
import JoinIcon from '@mui/icons-material/AddLinkOutlined';
import { type NotetakerDerivedState, type DeployedNotetakerAPI } from '../../../api/src/index';
import { useDeployedNoteContext } from '../hooks';
import { type NoteDeployment } from '../contexts';
import { type Observable } from 'rxjs';
import { NoteStatus } from '../../../contract/src/index';
import { TextPromptDialog } from './TextPromptDialog';

/** The props required by the {@link Note} component. */
export interface NoteProps {
  noteDeployment$?: Observable<NoteDeployment>;
}

/**
 * Provides the UI for a deployed notetaker contract; allowing notes to be written, updated,
 * or deleted following the rules enforced by the underlying Compact contract.
 */
export const Note: React.FC<Readonly<NoteProps>> = ({ noteDeployment$ }) => {
  const noteApiProvider = useDeployedNoteContext();
  const [noteDeployment, setNoteDeployment] = useState<NoteDeployment>();
  const [deployedNoteAPI, setDeployedNoteAPI] = useState<DeployedNotetakerAPI>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [noteState, setNoteState] = useState<NotetakerDerivedState>();
  const [titleInput, setTitleInput] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isWorking, setIsWorking] = useState(!!noteDeployment$);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  const onCreateNote = useCallback(() => noteApiProvider.resolve(), [noteApiProvider]);
  const onJoinNote = useCallback(
    (contractAddress: ContractAddress) => noteApiProvider.resolve(contractAddress),
    [noteApiProvider],
  );

  const onWriteNote = useCallback(async () => {
    if (!titleInput.trim()) return;
    try {
      if (deployedNoteAPI) {
        setIsWorking(true);
        await deployedNoteAPI.writeNote(titleInput.trim());
        setTitleInput('');
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  }, [deployedNoteAPI, titleInput]);

  const onUpdateNote = useCallback(async () => {
    if (!titleInput.trim()) return;
    try {
      if (deployedNoteAPI) {
        setIsWorking(true);
        await deployedNoteAPI.updateNote(titleInput.trim());
        setTitleInput('');
        setIsEditing(false);
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  }, [deployedNoteAPI, titleInput]);

  const onDeleteNote = useCallback(async () => {
    try {
      if (deployedNoteAPI) {
        setIsWorking(true);
        await deployedNoteAPI.deleteNote();
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  }, [deployedNoteAPI]);

  const onCopyContractAddress = useCallback(async () => {
    if (deployedNoteAPI) {
      await navigator.clipboard.writeText(deployedNoteAPI.deployedContractAddress);
    }
  }, [deployedNoteAPI]);

  useEffect(() => {
    if (!noteDeployment$) return;
    const subscription = noteDeployment$.subscribe(setNoteDeployment);
    return () => subscription.unsubscribe();
  }, [noteDeployment$]);

  useEffect(() => {
    if (!noteDeployment) return;
    if (noteDeployment.status === 'in-progress') return;

    setIsWorking(false);

    if (noteDeployment.status === 'failed') {
      setErrorMessage(
        noteDeployment.error.message.length ? noteDeployment.error.message : 'Encountered an unexpected error.',
      );
      return;
    }

    setDeployedNoteAPI(noteDeployment.api);
    const subscription = noteDeployment.api.state$.subscribe(setNoteState);
    return () => subscription.unsubscribe();
  }, [noteDeployment]);

  const isOwned = noteState?.status === NoteStatus.WRITTEN && noteState.isOwner;
  const isWritten = noteState?.status === NoteStatus.WRITTEN;

  return (
    <Card
      sx={{
        position: 'relative',
        width: 300,
        minWidth: 300,
        minHeight: 340,
        background: 'rgba(10,10,20,0.92)',
        border: '1px solid rgba(120,80,255,0.3)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {!noteDeployment$ && (
        /* ── Empty slot: deploy or join ── */
        <React.Fragment>
          <CardContent sx={{ textAlign: 'center', pt: 4 }}>
            <Typography variant="h1" color="primary.dark">
              <NoteAddIcon fontSize="large" />
            </Typography>
            <Typography variant="body2" color="primary.dark" sx={{ mt: 1 }}>
              Create a new note slot, or join an existing one...
            </Typography>
          </CardContent>
          <CardActions disableSpacing sx={{ justifyContent: 'center' }}>
            <Tooltip title="Deploy new note slot">
              <IconButton data-testid="note-deploy-btn" onClick={onCreateNote}>
                <NoteAddIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Join existing note slot">
              <IconButton
                data-testid="note-join-btn"
                onClick={() => setJoinDialogOpen(true)}
              >
                <JoinIcon />
              </IconButton>
            </Tooltip>
          </CardActions>
          <TextPromptDialog
            prompt="Enter contract address"
            isOpen={joinDialogOpen}
            onCancel={() => setJoinDialogOpen(false)}
            onSubmit={(text) => {
              setJoinDialogOpen(false);
              onJoinNote(text);
            }}
          />
        </React.Fragment>
      )}

      {noteDeployment$ && (
        <React.Fragment>
          {/* Loading overlay */}
          <Backdrop
            sx={{ position: 'absolute', color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={isWorking}
          >
            <CircularProgress data-testid="note-working-indicator" />
          </Backdrop>

          {/* Error overlay */}
          <Backdrop
            sx={{ position: 'absolute', color: '#ff4444', zIndex: (theme) => theme.zIndex.drawer + 1 }}
            open={!!errorMessage}
            onClick={() => setErrorMessage(undefined)}
          >
            <StopIcon fontSize="large" />
            <Typography component="div" data-testid="note-error-message" sx={{ ml: 1, fontSize: '0.85rem' }}>
              {errorMessage}
            </Typography>
          </Backdrop>

          {/* Card header */}
          <CardHeader
            avatar={
              noteState ? (
                isOwned || !isWritten ? (
                  <LockOpenIcon data-testid="note-unlocked-icon" sx={{ color: '#7c3aed' }} />
                ) : (
                  <LockIcon data-testid="note-locked-icon" sx={{ color: '#6b7280' }} />
                )
              ) : (
                <Skeleton variant="circular" width={20} height={20} />
              )
            }
            titleTypographyProps={{ color: 'primary', fontSize: '0.75rem' }}
            title={toShortAddress(deployedNoteAPI?.deployedContractAddress) ?? 'Loading...'}
            action={
              deployedNoteAPI?.deployedContractAddress ? (
                <Tooltip title="Copy contract address">
                  <IconButton onClick={onCopyContractAddress} size="small">
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Skeleton variant="circular" width={20} height={20} />
              )
            }
          />

          {/* Card body */}
          <CardContent>
            {noteState ? (
              isWritten && !isEditing ? (
                /* ── Note is written, show title ── */
                <React.Fragment>
                  <Chip
                    label={isOwned ? 'Your Note' : "Someone's Note"}
                    size="small"
                    color={isOwned ? 'secondary' : 'default'}
                    sx={{ mb: 1 }}
                  />
                  <Typography
                    data-testid="note-title"
                    variant="h6"
                    color="primary"
                    sx={{ wordBreak: 'break-word', minHeight: 80 }}
                  >
                    {noteState.title ?? '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Seq #{noteState.sequence.toString()} · Body stays private (off-chain)
                  </Typography>
                </React.Fragment>
              ) : isEditing ? (
                /* ── Update title input ── */
                <TextField
                  id="update-title-input"
                  data-testid="note-update-input"
                  variant="outlined"
                  focused
                  fullWidth
                  placeholder="New title…"
                  size="small"
                  color="primary"
                  value={titleInput}
                  slotProps={{ htmlInput: { style: { color: 'white' } } }}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
              ) : (
                /* ── Empty slot, write input ── */
                <TextField
                  id="write-title-input"
                  data-testid="note-write-input"
                  variant="outlined"
                  focused
                  fullWidth
                  placeholder="Note title to record on-chain…"
                  size="small"
                  color="primary"
                  value={titleInput}
                  slotProps={{ htmlInput: { style: { color: 'white' } } }}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
              )
            ) : (
              <Skeleton variant="rectangular" width={260} height={120} />
            )}
          </CardContent>

          {/* Card actions */}
          <CardActions>
            {deployedNoteAPI ? (
              <React.Fragment>
                {/* Write button — only when empty */}
                <Tooltip title="Write note">
                  <span>
                    <IconButton
                      data-testid="note-write-btn"
                      disabled={isWritten || isEditing || !titleInput.trim()}
                      onClick={onWriteNote}
                    >
                      <WriteIcon />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* Edit button — toggle edit mode when owner */}
                <Tooltip title={isEditing ? 'Save updated title' : 'Edit title'}>
                  <span>
                    <IconButton
                      data-testid="note-edit-btn"
                      disabled={!isOwned}
                      onClick={() => {
                        if (isEditing) {
                          void onUpdateNote();
                        } else {
                          setTitleInput(noteState?.title ?? '');
                          setIsEditing(true);
                        }
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* Delete button — only owner */}
                <Tooltip title="Delete note">
                  <span>
                    <IconButton
                      data-testid="note-delete-btn"
                      disabled={!isOwned || isEditing}
                      onClick={onDeleteNote}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </React.Fragment>
            ) : (
              <Skeleton variant="rectangular" width={80} height={20} />
            )}
          </CardActions>
        </React.Fragment>
      )}
    </Card>
  );
};

/** @internal */
const toShortAddress = (addr: ContractAddress | undefined): React.ReactElement | undefined =>
  addr ? (
    <span data-testid="note-address">
      0x{addr.replace(/^[A-Fa-f0-9]{6}([A-Fa-f0-9]{8}).*([A-Fa-f0-9]{8})$/g, '$1...$2')}
    </span>
  ) : undefined;
