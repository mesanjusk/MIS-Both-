import { useMemo, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';

function fileNameFrom(order) {
  return String(
    order?.driveFile?.name ||
    order?.driveFile?.fileName ||
    order?.driveFile?.localRelativePath ||
    ''
  ).trim();
}

function extensionOf(name) {
  const clean = String(name || '').split(/[\\/]/).pop() || '';
  const dot = clean.lastIndexOf('.');
  return dot > -1 ? clean.slice(dot + 1).toLowerCase() : '';
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff']);

export default function OrderFileThumbnail({ order, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fileId = String(order?.driveFile?.fileId || '').trim();
  const fileName = fileNameFrom(order);
  const ext = extensionOf(fileName);
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = ext === 'pdf';
  const isCorel = ext === 'cdr' || ext === 'cmx';

  const driveThumb = useMemo(
    () => (fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w160` : ''),
    [fileId]
  );

  if (!fileId && !fileName) return null;

  const title = fileName
    ? `Open order file/folder: ${fileName}`
    : 'Open order file/folder';

  return (
    <Tooltip title={title}>
      <Box
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onOpen?.();
          }
        }}
        sx={(t) => ({
          width: 38,
          height: 38,
          borderRadius: 1.25,
          overflow: 'hidden',
          border: `1px solid ${t.palette.divider}`,
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
        })}
      >
        {driveThumb && !imageFailed ? (
          <Box
            component="img"
            src={driveThumb}
            alt={fileName || 'Order file preview'}
            loading="lazy"
            onError={() => setImageFailed(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : isPdf ? (
          <PictureAsPdfOutlinedIcon sx={{ fontSize: 24, color: 'error.main' }} />
        ) : isCorel ? (
          <Box sx={{ textAlign: 'center', lineHeight: 1 }}>
            <DescriptionOutlinedIcon sx={{ fontSize: 20, color: 'success.dark' }} />
            <Typography sx={{ fontSize: 8, fontWeight: 900, color: 'success.dark' }}>CDR</Typography>
          </Box>
        ) : isImage ? (
          <Typography sx={{ fontSize: 9, fontWeight: 900, color: 'primary.main' }}>IMG</Typography>
        ) : (
          <InsertDriveFileOutlinedIcon sx={{ fontSize: 22, color: 'text.secondary' }} />
        )}
      </Box>
    </Tooltip>
  );
}
