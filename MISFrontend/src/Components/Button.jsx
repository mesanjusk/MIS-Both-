import PropTypes from 'prop-types';
import MuiButton from '@mui/material/Button';

const sizeMap = { sm: 'small', md: 'medium', lg: 'large' };
const colorMap = { primary: 'primary', secondary: 'secondary', danger: 'error' };
const variantMap = { primary: 'contained', secondary: 'outlined', danger: 'contained' };

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  fullWidth = false,
  ...props
}) {
  return (
    <MuiButton
      variant={variantMap[variant] || 'contained'}
      color={colorMap[variant] || 'primary'}
      size={sizeMap[size] || 'medium'}
      className={className}
      startIcon={LeftIcon ? <LeftIcon aria-hidden="true" /> : undefined}
      endIcon={RightIcon ? <RightIcon aria-hidden="true" /> : undefined}
      fullWidth={fullWidth}
      {...props}
    >
      {children}
    </MuiButton>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  children: PropTypes.node,
  leftIcon: PropTypes.elementType,
  rightIcon: PropTypes.elementType,
  fullWidth: PropTypes.bool,
};
