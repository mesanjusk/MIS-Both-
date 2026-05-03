import { useMemo, useState } from 'react';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

const deriveImageUrl = (message) => message?.mediaUrl || message?.url || message?.link || message?.image?.link || message?.media?.url || '';

export default function ImageMessage({ message }) {
  const [isOpen, setIsOpen] = useState(false);
  const imageUrl = useMemo(() => deriveImageUrl(message), [message]);

  if (!imageUrl) {
    return <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.75 }}>Image unavailable</Typography>;
  }

  return (
    <>
      <Stack spacing={1}>
        <img
          src={imageUrl}
          alt="Shared media"
          loading="lazy"
          onClick={() => setIsOpen(true)}
          style={{ maxHeight: 280, maxWidth: 280, cursor: 'pointer', borderRadius: 12, objectFit: 'cover' }}
        />
        <Stack direction="row" spacing={1}>
          <Button component="a" href={imageUrl} download size="small" variant="outlined" startIcon={<DownloadRoundedIcon fontSize="small" />}>
            Download
          </Button>
          <Button component="a" href={imageUrl} target="_blank" rel="noreferrer" size="small" startIcon={<OpenInNewRoundedIcon fontSize="small" />}>
            Open
          </Button>
        </Stack>
      </Stack>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Image Preview</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <img src={imageUrl} alt="Full preview" style={{ maxHeight: '70vh', width: '100%', objectFit: 'contain', borderRadius: 12 }} />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button component="a" href={imageUrl} download variant="contained" startIcon={<DownloadRoundedIcon fontSize="small" />}>
                Download
              </Button>
              <Button component="a" href={imageUrl} target="_blank" rel="noreferrer" variant="outlined" startIcon={<OpenInNewRoundedIcon fontSize="small" />}>
                Open in new tab
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}

ImageMessage.propTypes = {
  message: PropTypes.object,
};

ImageMessage.defaultProps = {
  message: null,
};
