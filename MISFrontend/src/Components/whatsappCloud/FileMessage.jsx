import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { Button, Paper, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

const getFileUrl = (message) => message?.mediaUrl || message?.url || message?.link || message?.document?.link || message?.media?.url || '';

const getFilename = (message) => message?.filename || message?.fileName || message?.document?.filename || message?.document?.name || 'Attachment';

export default function FileMessage({ message }) {
  const url = getFileUrl(message);
  const name = getFilename(message);

  if (!url) return <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.75 }}>Document unavailable</Typography>;

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.paper' }}>
      <Stack direction="row" spacing={1.2} alignItems="center">
        <DescriptionRoundedIcon color="action" fontSize="small" />
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
          <Typography variant="caption" color="text.secondary">Tap to download</Typography>
        </Stack>
        <Button
          component="a"
          href={url}
          download
          size="small"
          variant="contained"
          endIcon={<DownloadRoundedIcon fontSize="small" />}
        >
          Download
        </Button>
      </Stack>
    </Paper>
  );
}

FileMessage.propTypes = {
  message: PropTypes.object,
};

FileMessage.defaultProps = {
  message: null,
};
