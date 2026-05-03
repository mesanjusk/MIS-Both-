import { useMemo } from 'react';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTemplates } from '../../hooks/useTemplates';

const getVariableCount = (body) => {
  const matches = String(body || '').match(/\{\{\d+\}\}/g) || [];
  const numbers = matches
    .map((token) => Number(token.replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));

  if (!numbers.length) return 0;
  return Math.max(...numbers);
};

export default function TemplateSelector({ selectedTemplate, onTemplateChange, disabled = false }) {
  const { templates, isLoading, error, isEmpty, refetchTemplates } = useTemplates();

  const resolvedSelectedTemplate = useMemo(() => {
    if (!selectedTemplate?.name) return null;

    return templates.find(
      (template) =>
        template.name === selectedTemplate.name &&
        template.language === selectedTemplate.language
    ) || selectedTemplate;
  }, [templates, selectedTemplate]);

  const variableCount = getVariableCount(resolvedSelectedTemplate?.body);
  const parameters = Array.from({ length: variableCount }).map((_, index) => selectedTemplate?.parameters?.[index] || '');

  const preview = useMemo(() => {
    if (!resolvedSelectedTemplate?.body) return '';

    return parameters.reduce(
      (text, param, index) => text.replaceAll(`{{${index + 1}}}`, param || `{{${index + 1}}}`),
      resolvedSelectedTemplate.body
    );
  }, [resolvedSelectedTemplate, parameters]);

  const handleSelect = (value) => {
    if (!value) {
      onTemplateChange(null);
      return;
    }

    const parsed = JSON.parse(value);
    const template = templates.find(
      (item) => item.name === parsed.name && item.language === parsed.language
    );

    if (!template) return;

    onTemplateChange({
      ...template,
      parameters: Array.from({ length: getVariableCount(template.body) }).map(() => ''),
    });
  };

  const updateParameter = (index, value) => {
    onTemplateChange({
      ...(resolvedSelectedTemplate || {}),
      parameters: parameters.map((param, currentIndex) =>
        currentIndex === index ? value : param
      ),
    });
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="subtitle2" fontWeight={700}>Template Selector</Typography>
          <Button size="small" startIcon={<RefreshRoundedIcon fontSize="small" />} onClick={refetchTemplates} disabled={isLoading || disabled}>
            Refresh
          </Button>
        </Stack>

        <FormControl fullWidth size="small" disabled={disabled || isLoading}>
          <InputLabel id="wa-template-label">Choose Template</InputLabel>
          <Select
            labelId="wa-template-label"
            label="Choose Template"
            value={resolvedSelectedTemplate ? JSON.stringify({ name: resolvedSelectedTemplate.name, language: resolvedSelectedTemplate.language }) : ''}
            onChange={(event) => handleSelect(event.target.value)}
          >
            <MenuItem value=""><em>Select template</em></MenuItem>
            {templates.map((template) => (
              <MenuItem
                key={`${template.name}-${template.language}`}
                value={JSON.stringify({ name: template.name, language: template.language })}
              >
                {template.name} ({template.language}) • {template.category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {isEmpty ? <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>No templates found.</Typography> : null}
        {isLoading ? <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>Loading templates...</Typography> : null}

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={refetchTemplates}>Retry</Button>}>
            {error}
          </Alert>
        ) : null}

        {resolvedSelectedTemplate ? (
          <>
            {parameters.length > 0 ? (
              <Grid container spacing={1.25} sx={{ mt: 1 }}>
                {parameters.map((value, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <TextField
                      fullWidth
                      size="small"
                      label={`Variable ${index + 1}`}
                      value={value}
                      disabled={disabled}
                      onChange={(event) => updateParameter(index, event.target.value)}
                      placeholder={`Enter value for {{${index + 1}}}`}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : null}

            <Box sx={{ mt: 2, borderRadius: 2, bgcolor: 'grey.100', p: 1.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">Preview</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{preview || resolvedSelectedTemplate.body}</Typography>
            </Box>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

TemplateSelector.propTypes = {
  selectedTemplate: PropTypes.shape({
    name: PropTypes.string,
    language: PropTypes.string,
    body: PropTypes.string,
    parameters: PropTypes.arrayOf(PropTypes.string),
  }),
  onTemplateChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

TemplateSelector.defaultProps = {
  selectedTemplate: null,
  disabled: false,
};
