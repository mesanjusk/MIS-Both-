import { useRef } from 'react';
import PropTypes from 'prop-types';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import { IconButton, Tooltip } from '@mui/material';

const ACCEPTED = {
  image: 'image/*',
  video: 'video/*',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv',
};

export default function AttachmentUpload({ disabled, onSelectFile }) {
  const inputRef = useRef(null);

  const openPicker = (type) => {
    if (disabled || !inputRef.current) return;
    inputRef.current.value = '';
    inputRef.current.accept = ACCEPTED[type];
    inputRef.current.dataset.attachmentType = type;
    inputRef.current.click();
  };

  const onFileChange = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    const requestedType = event.target.dataset.attachmentType;
    const inferredType = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : requestedType || 'document';

    await onSelectFile?.(file, inferredType);
  };

  return (
    <>
      <input ref={inputRef} type="file" onChange={onFileChange} hidden />
      <Tooltip title="Upload image"><span><IconButton size="small" onClick={() => openPicker('image')} disabled={disabled}><ImageRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Upload video"><span><IconButton size="small" onClick={() => openPicker('video')} disabled={disabled}><VideocamRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Upload document"><span><IconButton size="small" onClick={() => openPicker('document')} disabled={disabled}><AttachFileRoundedIcon fontSize="small" /></IconButton></span></Tooltip>
    </>
  );
}

AttachmentUpload.propTypes = {
  disabled: PropTypes.bool,
  onSelectFile: PropTypes.func,
};

AttachmentUpload.defaultProps = {
  disabled: false,
  onSelectFile: undefined,
};
