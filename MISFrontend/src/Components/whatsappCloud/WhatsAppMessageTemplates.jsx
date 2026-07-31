import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {
  fetchWhatsAppMessageTemplates,
  saveWhatsAppMessageTemplates,
} from '../../services/vendorService';

const groupByCategory = (templates) => {
  const groups = new Map();
  templates.forEach((template) => {
    const category = template.category || 'Other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(template);
  });
  return Array.from(groups.entries());
};

export default function WhatsAppMessageTemplates() {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await fetchWhatsAppMessageTemplates();
      setTemplates(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load WhatsApp message templates.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => groupByCategory(templates), [templates]);

  const updateTemplate = (key, patch) => {
    setTemplates((prev) => prev.map((template) => (template.key === key ? { ...template, ...patch } : template)));
  };

  const updateButtonLabel = (key, buttonIndex, label) => {
    setTemplates((prev) =>
      prev.map((template) => {
        if (template.key !== key) return template;
        const buttons = (template.buttons || []).map((button, index) =>
          index === buttonIndex ? { ...button, label } : button
        );
        return { ...template, buttons };
      })
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveWhatsAppMessageTemplates(templates);
      setTemplates(Array.isArray(saved) ? saved : templates);
      setMessage('WhatsApp message text saved successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save WhatsApp message text.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, overflowY: 'auto', height: '100%' }}>
      <Stack spacing={2} sx={{ maxWidth: 960, mx: 'auto' }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            WhatsApp message text
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Every message and button label the project sends over WhatsApp — order commands, customer
            replies, attendance prompts, task/payment notifications and daily digests — is edited here.
            Nothing is hardcoded after this: what changes is only the wording, not what happens after a
            reply (that stays wired to the underlying action).
          </Typography>
        </Box>

        {message ? <Alert severity="success">{message}</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {isLoading ? <Alert severity="info">Loading message text…</Alert> : null}

        {grouped.map(([category, items]) => (
          <Accordion
            key={category}
            expanded={expanded === category}
            onChange={(_, isExpanded) => setExpanded(isExpanded ? category : '')}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>{category}</Typography>
                <Chip size="small" label={`${items.length} message${items.length === 1 ? '' : 's'}`} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {items.map((template) => (
                  <Paper key={template.key} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Typography variant="subtitle2" fontWeight={700}>{template.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{template.key}</Typography>
                      </Stack>

                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        label="Message text"
                        helperText="Use {{variableName}} for values filled in automatically (e.g. {{orderNumber}}, {{amount}})."
                        value={template.body}
                        onChange={(e) => updateTemplate(template.key, { body: e.target.value })}
                      />

                      {template.listButtonLabel ? (
                        <TextField
                          label="List picker button label"
                          value={template.listButtonLabel}
                          onChange={(e) => updateTemplate(template.key, { listButtonLabel: e.target.value })}
                          sx={{ maxWidth: 280 }}
                        />
                      ) : null}

                      {(template.buttons || []).length ? (
                        <Box>
                          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Buttons (label is editable; the action a tap triggers is fixed)
                          </Typography>
                          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                            {template.buttons.map((button, index) => (
                              <TextField
                                key={`${template.key}-btn-${index}`}
                                label={`Button ${index + 1} label`}
                                value={button.label}
                                onChange={(e) => updateButtonLabel(template.key, index, e.target.value)}
                                sx={{ minWidth: 180 }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : null}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}

        <Divider />

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={load} disabled={isLoading || isSaving}>
            Reload
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? 'Saving...' : 'Save all message text'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
