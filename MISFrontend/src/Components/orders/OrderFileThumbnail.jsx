import { useEffect, useMemo, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import axios from '../../apiClient';
import { launchMisFileUrl, normalizeWindowsPath } from '../../utils/localFileLauncher';

function extensionOf(name) {
  const clean = String(name || '').split(/[\\/]/).pop() || '';
  const dot = clean.lastIndexOf('.');
  return dot > -1 ? clean.slice(dot + 1).toLowerCase() : '';
}

function joinWindowsPath(root, relative) {
  const cleanRoot = normalizeWindowsPath(root || '').replace(/\\+$/g, '');
  const cleanRelative = String(relative || '').replace(/^\\+/g, '');
  return cleanRoot && cleanRelative ? `${cleanRoot}\\${cleanRelative}` : '';
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff']);

export default function OrderFileThumbnail({ order, onOpen }) {
  const [preview, setPreview] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const orderNumber = Number(order?.Order_Number || 0);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoaded(false);
    setImageFailed(false);

    if (!orderNumber) {
      setLoaded(true);
      return () => { cancelled = true; };
    }

    axios.get(`/api/network-files/printing-preview/${orderNumber}`)
      .then((res) => {
        if (!cancelled) setPreview(res?.data?.result || null);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => { cancelled = true; };
  }, [orderNumber]);

  const fileId = String(preview?.fileId || '').trim();
  const fileName = String(preview?.fileName || '').trim();
  const ext = extensionOf(fileName);
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = ext === 'pdf';
  const isCorel = ext === 'cdr' || ext === 'cmx';

  const driveThumb = useMemo(
    () => (fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w160` : ''),
    [fileId]
  );

  if (!loaded || !preview) return null;

  const openPrintingFile = () => {
    const localPath = joinWindowsPath(preview.networkShareRoot, preview.relativePath);
    if (localPath) {
      launchMisFileUrl(localPath, { select: true });
      return;
    }
    if (preview.driveUrl) {
      window.open(preview.driveUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    onOpen?.();
  };

  const title = `Printing file: ${fileName}`;

  return (
    <Tooltip title={title}>
      <Box
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); openPrintingFile(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openPrintingFile();
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
            alt={fileName || 'Printing file preview'}
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
