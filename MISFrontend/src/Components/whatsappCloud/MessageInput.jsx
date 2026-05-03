import { useEffect, useState } from 'react';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MoodRoundedIcon from '@mui/icons-material/MoodRounded';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AttachmentUpload from './AttachmentUpload';
import TemplateMessageComposer from './TemplateMessageComposer';

const isImageFile = (file) => file && file.type.startsWith('image/');

export default function MessageInput({
  disabled,
  onSend,
  onSendAttachment,
  canSendTemplateOnly,
  recipient,
}) {
  const [value, setValue] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedType, setSelectedType] = useState('document');
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  useEffect(() => {
    if (!isImageFile(selectedFile)) {
      setImagePreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    if (!canSendTemplateOnly) return;
    setSelectedFile(null);
    setValue('');
  }, [canSendTemplateOnly]);

  const submit = async () => {
    const body = value.trim();
    if (!body || disabled) return;

    const didSend = await onSend(body);
    if (didSend) setValue('');
  };

  const submitAttachment = async () => {
    if (!selectedFile || disabled) return;

    try {
      setIsUploadingAttachment(true);
      const didSend = await onSendAttachment?.({
        file: selectedFile,
        type: selectedType,
        caption: value.trim(),
      });

      if (didSend) {
        setSelectedFile(null);
        setValue('');
      }
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Paper
      square
      elevation={0}
      sx={{
        borderTop: '1px solid #d1d7db',
        p: 1,
        position: 'sticky',
        bottom: 0,
        zIndex: 3,
        bgcolor: '#f0f2f5',
      }}
    >
      {canSendTemplateOnly ? (
        <>
          <Alert severity="warning" sx={{ mb: 1.2 }}>
            You are outside the 24-hour window. Only template messages can be sent.
          </Alert>
          <TemplateMessageComposer recipient={recipient} />
        </>
      ) : null}

      {selectedFile ? (
        <Paper variant="outlined" sx={{ mb: 1.2, p: 1, borderRadius: 2 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Stack sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap variant="body2" fontWeight={700}>{selectedFile.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedType.toUpperCase()} · {(selectedFile.size / 1024).toFixed(0)} KB
              </Typography>
            </Stack>
            <IconButton size="small" color="error" onClick={() => setSelectedFile(null)}>✕</IconButton>
          </Stack>

          {imagePreviewUrl ? (
            <Box
              component="img"
              src={imagePreviewUrl}
              alt="Image preview"
              sx={{ mt: 1, maxHeight: 180, borderRadius: 1.5, objectFit: 'cover' }}
            />
          ) : null}

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <IconButton onClick={submitAttachment} disabled={disabled || isUploadingAttachment} color="primary">
              {isUploadingAttachment ? <CircularProgress size={18} /> : <SendRoundedIcon fontSize="small" />}
            </IconButton>
          </Stack>
        </Paper>
      ) : null}

      <TextField
        fullWidth
        multiline
        maxRows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={disabled ? 'Text input disabled outside 24h window' : 'Type a message'}
        disabled={disabled}
        size="small"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 999,
            bgcolor: '#ffffff',
            pr: 0.5,
          },
        }}
        InputProps={{
          startAdornment: !canSendTemplateOnly ? (
            <InputAdornment position="start">
              <Stack direction="row" spacing={0}>
                <AttachmentUpload
                  disabled={disabled}
                  onSelectFile={(file, type) => {
                    setSelectedFile(file);
                    setSelectedType(type || 'document');
                  }}
                />
                <IconButton size="small" disabled={disabled}>
                  <MoodRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </InputAdornment>
          ) : null,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={submit} disabled={disabled || !value.trim()} color="primary">
                <SendRoundedIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Paper>
  );
}

MessageInput.propTypes = {
  disabled: PropTypes.bool,
  onSend: PropTypes.func.isRequired,
  onSendAttachment: PropTypes.func,
  canSendTemplateOnly: PropTypes.bool,
  recipient: PropTypes.string,
};

MessageInput.defaultProps = {
  disabled: false,
  onSendAttachment: undefined,
  canSendTemplateOnly: false,
  recipient: '',
};