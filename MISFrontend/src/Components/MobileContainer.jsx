import PropTypes from 'prop-types';
import Container from '@mui/material/Container';

export default function MobileContainer({ children, maxWidth = 'sm', ...props }) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: { xs: 1.5, md: 2.5 } }} {...props}>
      {children}
    </Container>
  );
}

MobileContainer.propTypes = {
  maxWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  children: PropTypes.node.isRequired,
};
