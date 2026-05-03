import PropTypes from 'prop-types';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

export default function InputField({
  label,
  type = 'text',
  className = '',
  icon: Icon,
  ...props
}) {
  return (
    <TextField
      label={label}
      type={type}
      fullWidth
      size="small"
      className={className}
      InputProps={
        Icon
          ? {
              startAdornment: (
                <InputAdornment position="start">
                  <Icon aria-hidden="true" />
                </InputAdornment>
              ),
            }
          : undefined
      }
      {...props}
    />
  );
}

InputField.propTypes = {
  label: PropTypes.string,
  type: PropTypes.string,
  className: PropTypes.string,
  icon: PropTypes.elementType,
};
