export default function RecipientsMultiSelect({ options, value, onChange }) {
  return (
    <div className="multi-select">
      {options.map((email) => (
        <label key={email} className="multi-select-option">
          <input
            type="checkbox"
            checked={value.includes(email)}
            onChange={() => {
              if (value.includes(email)) {
                onChange(value.filter((v) => v !== email));
              } else {
                onChange([...value, email]);
              }
            }}
          />
          <span>{email}</span>
        </label>
      ))}
    </div>
  );
}
