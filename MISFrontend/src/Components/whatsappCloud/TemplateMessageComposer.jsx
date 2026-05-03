import { useState } from 'react';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { Button, Stack } from '@mui/material';
import { toast } from '../../Components';
import { buildTemplatePayload, whatsappCloudService } from '../../services/whatsappCloudService';
import { parseApiError } from '../../utils/parseApiError';
import TemplateSelector from './TemplateSelector';
import PropTypes from 'prop-types';

export default function TemplateMessageComposer({
  recipient,
  className = '',
  buttonLabel = 'Send Template Message',
  disabled = false,
  onSent,
}) {
  const [template, setTemplate] = useState(null);
  const [isSending, setIsSending] = useState(false);

  const handleSendTemplate = async () => {
    if (!recipient?.trim()) {
      toast.error('Recipient number is required.');
      return;
    }

    if (!template?.name || !template?.language) {
      toast.error('Please select a template first.');
      return;
    }

    try {
      setIsSending(true);
      await whatsappCloudService.sendTemplateMessage(
        buildTemplatePayload({
          to: recipient.trim(),
          template: {
            name: template.name,
            language: template.language,
            parameters: template.parameters || [],
          },
        }),
      );
      toast.success('Template sent successfully.');
      setTemplate(null);
      onSent?.();
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to send template message.'));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Stack spacing={1.5} className={className}>
      <TemplateSelector
        selectedTemplate={template}
        onTemplateChange={setTemplate}
        disabled={disabled || isSending}
      />
      <Button
        type="button"
        onClick={handleSendTemplate}
        disabled={disabled || isSending || !template}
        variant="contained"
        startIcon={<SendRoundedIcon fontSize="small" />}
      >
        {isSending ? 'Sending...' : buttonLabel}
      </Button>
    </Stack>
  );
}

TemplateMessageComposer.propTypes = {
  recipient: PropTypes.string,
  className: PropTypes.string,
  buttonLabel: PropTypes.string,
  disabled: PropTypes.bool,
  onSent: PropTypes.func,
};

TemplateMessageComposer.defaultProps = {
  recipient: '',
  className: '',
  buttonLabel: 'Send Template Message',
  disabled: false,
  onSent: undefined,
};
