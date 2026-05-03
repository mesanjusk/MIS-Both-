import PropTypes from 'prop-types';
import LoadingSpinner from './LoadingSpinner';

export default function Loader({ size = 24, message, className = '', spinnerClassName = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <LoadingSpinner size={size} className={spinnerClassName} />
      {message && <span className="text-gray-600 text-sm">{message}</span>}
    </div>
  );
}

Loader.propTypes = {
  size: PropTypes.number,
  message: PropTypes.string,
  className: PropTypes.string,
  spinnerClassName: PropTypes.string,
};
