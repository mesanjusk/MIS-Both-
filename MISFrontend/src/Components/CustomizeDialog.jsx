import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Switch,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { useNavCustomize } from '../hooks/useNavCustomize';

const RIGHT_ACTIONS = ['Day Book', 'Send Email', 'UPI Payment', 'Transaction 4D', 'Attendance'];
const RIGHT_LINKS = ['Orders', 'Business', 'Post Print', 'Workflows', 'WhatsApp', 'Reports', 'Attendance', 'Dispatch'];

export default function CustomizeDialog({ open, onClose }) {
  const { prefs, save } = useNavCustomize();
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (open) setDraft(prefs);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLeft = (path) => {
    setDraft((prev) => {
      const hidden = prev.leftHidden || [];
      return {
        ...prev,
        leftHidden: hidden.includes(path)
          ? hidden.filter((p) => p !== path)
          : [...hidden, path],
      };
    });
  };

  const toggleRightAction = (label) => {
    setDraft((prev) => {
      const hidden = prev.rightActionsHidden || [];
      return {
        ...prev,
        rightActionsHidden: hidden.includes(label)
          ? hidden.filter((l) => l !== label)
          : [...hidden, label],
      };
    });
  };

  const toggleRightLink = (label) => {
    setDraft((prev) => {
      const hidden = prev.rightLinksHidden || [];
      return {
        ...prev,
        rightLinksHidden: hidden.includes(label)
          ? hidden.filter((l) => l !== label)
          : [...hidden, label],
      };
    });
  };

  const handleSave = () => {
    save(draft);
    onClose();
  };

  const handleCancel = () => {
    setDraft(prefs);
    onClose();
  };

  const handleReset = () => setDraft({});

  return (
    <Dialog open={open} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0, fontWeight: 800 }}>Customize Navigation</DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3 }}>
        <Tab label="Left Sidebar" />
        <Tab label="Right Sidebar" />
      </Tabs>

      <Divider />

      <DialogContent sx={{ pt: 1.5, minHeight: 380, maxHeight: '60vh', overflowY: 'auto' }}>
        {tab === 0 && (
          <Box>
            {SIDEBAR_GROUPS.map((group) => (
              <Box key={group.label} sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  fontWeight={800}
                  color="text.disabled"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
                >
                  {group.label}
                </Typography>
                <Box sx={{ pl: 1, mt: 0.25 }}>
                  {group.items.map((item) => (
                    <FormControlLabel
                      key={item.path}
                      control={
                        <Switch
                          size="small"
                          checked={!(draft.leftHidden || []).includes(item.path)}
                          onChange={() => toggleLeft(item.path)}
                        />
                      }
                      label={<Typography variant="body2">{item.label}</Typography>}
                      sx={{ display: 'flex', mx: 0, my: 0.2 }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Typography
              variant="caption"
              fontWeight={800}
              color="text.disabled"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
            >
              Quick Actions
            </Typography>
            <Box sx={{ pl: 1, mt: 0.25, mb: 2 }}>
              {RIGHT_ACTIONS.map((label) => (
                <FormControlLabel
                  key={label}
                  control={
                    <Switch
                      size="small"
                      checked={!(draft.rightActionsHidden || []).includes(label)}
                      onChange={() => toggleRightAction(label)}
                    />
                  }
                  label={<Typography variant="body2">{label}</Typography>}
                  sx={{ display: 'flex', mx: 0, my: 0.2 }}
                />
              ))}
            </Box>

            <Typography
              variant="caption"
              fontWeight={800}
              color="text.disabled"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
            >
              Quick Links
            </Typography>
            <Box sx={{ pl: 1, mt: 0.25 }}>
              {RIGHT_LINKS.map((label) => (
                <FormControlLabel
                  key={`link-${label}`}
                  control={
                    <Switch
                      size="small"
                      checked={!(draft.rightLinksHidden || []).includes(label)}
                      onChange={() => toggleRightLink(label)}
                    />
                  }
                  label={<Typography variant="body2">{label}</Typography>}
                  sx={{ display: 'flex', mx: 0, my: 0.2 }}
                />
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleReset} color="warning" size="small">
          Restore Defaults
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

CustomizeDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
