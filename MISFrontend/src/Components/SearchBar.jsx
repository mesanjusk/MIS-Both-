import PropTypes from 'prop-types';
import { FiSearch } from 'react-icons/fi';
import InputField from './InputField';

export default function SearchBar({ value, onChange, placeholder = 'Search...', className = '', ...props }) {
  return (
    <InputField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      icon={FiSearch}
      className={className}
      size="small"
      {...props}
    />
  );
}

SearchBar.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
};
